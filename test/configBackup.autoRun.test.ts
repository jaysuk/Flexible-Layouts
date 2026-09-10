import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { dwc, loadObjectModel, setConnected, setModel } from "dwc-plugin-test-kit";
import {
	addBackedUpMachineKey, configureHost, getBackupFailureStreak, getLastBackupAttempt, resetForTests, resetHostConfigForTests,
	setAutoBackupNudgeSettings, setEncryptPreference, setLastBackupAt, setLastBackupAttempt,
} from "dwc-config-backup-core";

// The headless pipeline is covered by runBackup.test.ts - here we only care whether the on-connect
// trigger decides to call it, and how it reports the outcome.
const collectForBackup = vi.hoisted(() => vi.fn());
const runBackup = vi.hoisted(() => vi.fn());
vi.mock("../src/model/configBackup/runBackup", () => ({ collectForBackup, runBackup }));

import { installAutoBackupNudges, uninstallAutoBackupNudges } from "../src/model/configBackup/autoBackupNudges";

const T = (k: string) => `plugins.flexibleLayouts.configBackup.${k}`;
const NUDGE = (k: string) => `plugins.flexibleLayouts.configBackup.nudge.${k}`;

function notificationTitles(): Array<string> {
	return dwc.notifications.map((n) => n.title);
}

/** Overdue by construction: last successful backup was ~100 days ago, threshold 7. */
function makeOverdue() {
	setLastBackupAt(new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString());
}

beforeEach(() => {
	resetForTests();
	resetHostConfigForTests();
	configureHost({ storageNamespace: "flexibleLayouts.configBackup" });
	collectForBackup.mockReset().mockResolvedValue({ collected: {}, identity: {}, directories: {}, pluginVersion: "x", dwcVersion: "y" });
	runBackup.mockReset().mockResolvedValue({ ok: true, built: { manifest: {} }, redacted: false });
	setConnected(false);
	setModel(loadObjectModel()); // fixture: state.status === "idle"
});

// installAutoBackupNudges wires a connection watcher + an Events handler that must be torn down
// between tests or they leak into the next one.
afterEach(() => uninstallAutoBackupNudges());

describe("auto-run trigger (SCHEDULED-BACKUPS-PLAN.md §4.3) - when it must NOT fire", () => {
	it("does nothing extra when autoRun is disabled - the plain overdue nudge still fires", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: false, autoRunDestination: "dropbox" });
		makeOverdue();
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(runBackup).not.toHaveBeenCalled();
		expect(notificationTitles()).toContain(NUDGE("overdueTitle"));
	});

	it("does not fire when a backup is not overdue", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: true, autoRunDestination: "dropbox" });
		setLastBackupAt(new Date().toISOString()); // just backed up
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(runBackup).not.toHaveBeenCalled();
	});

	it("does not fire mid-print - defers to the plain nudge instead (§4.3 step 3)", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: true, autoRunDestination: "dropbox" });
		makeOverdue();
		setModel({ ...loadObjectModel(), state: { status: "processing" } });
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(runBackup).not.toHaveBeenCalled();
		expect(notificationTitles()).toContain(NUDGE("overdueTitle"));
	});

	it("does not fire for an ineligible destination (local / drive / none)", async () => {
		for (const dest of ["local", "drive", null] as const) {
			resetForTests();
			configureHost({ storageNamespace: "flexibleLayouts.configBackup" });
			setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: true, autoRunDestination: dest });
			makeOverdue();
			installAutoBackupNudges();
			setConnected(true);
			await flushPromises();
			uninstallAutoBackupNudges();
		}
		expect(runBackup).not.toHaveBeenCalled();
	});

	it("does not fire when the chosen destination has encryption turned on (§4.2)", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: true, autoRunDestination: "dropbox" });
		setEncryptPreference("dropbox", true);
		makeOverdue();
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(runBackup).not.toHaveBeenCalled();
		expect(notificationTitles()).toContain(NUDGE("overdueTitle"));
	});
});

describe("auto-run trigger - when it fires", () => {
	beforeEach(() => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: true, autoRunDestination: "dropbox" });
		makeOverdue();
	});

	it("runs the headless backup and shows a success toast, not the plain nudge", async () => {
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(collectForBackup).toHaveBeenCalledTimes(1);
		expect(runBackup).toHaveBeenCalledTimes(1);
		expect(runBackup.mock.calls[0][1]).toMatchObject({ destination: "dropbox", encrypt: false });
		expect(notificationTitles()).toContain(T("autoRun.okTitle"));
		expect(notificationTitles()).not.toContain(NUDGE("overdueTitle"));
	});

	it("a failed run raises an error toast", async () => {
		runBackup.mockResolvedValue({ ok: false, reason: "failed", message: "401 Unauthorized" });
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		const err = dwc.notifications.find((n) => n.title === T("autoRun.failedTitle"));
		expect(err).toBeDefined();
		expect(err?.type).toBe("error");
		// (the i18n stub echoes keys, so the interpolated {message} isn't visible here - the real
		// failedBody string carries it; runBackup.test.ts covers the message plumbing itself)
	});

	it("escalates the copy once the failure streak reaches the threshold", async () => {
		setLastBackupAttempt({ at: new Date().toISOString(), ok: false, destination: "dropbox", message: "x" });
		setLastBackupAttempt({ at: new Date().toISOString(), ok: false, destination: "dropbox", message: "x" });
		setLastBackupAttempt({ at: new Date().toISOString(), ok: false, destination: "dropbox", message: "x" });
		expect(getBackupFailureStreak()).toBe(3);
		runBackup.mockResolvedValue({ ok: false, reason: "failed", message: "still broken" });
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(notificationTitles()).toContain(T("autoRun.failedRepeatedlyTitle"));
	});

	it("a needsInput result falls back to the plain overdue nudge, no error toast", async () => {
		runBackup.mockResolvedValue({ ok: false, reason: "needsInput", needsInputKind: "unredacted", message: "sensitive" });
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(notificationTitles()).toContain(NUDGE("overdueTitle"));
		expect(notificationTitles()).not.toContain(T("autoRun.failedTitle"));
	});

	it("records a failed attempt itself when the networked collect step throws (runBackup never reached)", async () => {
		collectForBackup.mockRejectedValue(new Error("machine unreachable"));
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();

		expect(runBackup).not.toHaveBeenCalled();
		const attempt = getLastBackupAttempt();
		expect(attempt?.ok).toBe(false);
		expect(attempt?.destination).toBe("dropbox");
		expect(attempt?.message).toContain("machine unreachable");
		expect(notificationTitles()).toContain(T("autoRun.failedTitle"));
	});
});

// A tab left open past the due date should still act on the next reconnect (machine reboot, WiFi
// blip, laptop waking) rather than waiting for a manual page reload - but a flapping connection must
// not re-trigger a backup every few seconds.
describe("auto-run trigger - re-checks on reconnect, rate-limited", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "dropbox" });
		makeOverdue();
	});
	afterEach(() => vi.useRealTimers());

	async function reconnect() {
		setConnected(false);
		await flushPromises();
		setConnected(true);
		await flushPromises();
	}

	it("does NOT re-run on a quick reconnect flap (inside the cooldown)", async () => {
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 5 * 60 * 1000); // 5 minutes later
		await reconnect();
		expect(runBackup).toHaveBeenCalledTimes(1); // still just the one
	});

	it("re-runs on a reconnect once the cooldown has elapsed and it's still overdue", async () => {
		runBackup.mockResolvedValue({ ok: false, reason: "failed", message: "token expired" }); // stays overdue
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 61 * 60 * 1000); // just over an hour later
		await reconnect();
		expect(runBackup).toHaveBeenCalledTimes(2);
	});

	it("does not fire the one-time new-machine nudge again on a reconnect", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: false, autoRunDestination: "dropbox" });
		// Make this machine look unseen: some OTHER machine has a backup on record.
		addBackedUpMachineKey("some-other-machine");
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		expect(notificationTitles()).toContain(NUDGE("newMachineTitle")); // fired on the first connect

		vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
		dwc.notifications.length = 0;
		await reconnect();
		expect(notificationTitles()).not.toContain(NUDGE("newMachineTitle")); // but not again
	});
});
