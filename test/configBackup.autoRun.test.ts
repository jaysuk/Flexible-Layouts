import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { dwc, loadObjectModel, setConnected, setModel } from "dwc-plugin-test-kit";
import {
	addBackedUpMachineKey, configureHost, getAutoBackupNudgeSettings, getBackupFailureStreak, getLastBackupAttempt, resetForTests, resetHostConfigForTests,
	setAutoBackupNudgeSettings, setEncryptPreference, setLastBackupAt, setLastBackupAttempt,
} from "dwc-config-backup-core";

// The headless pipeline is covered by runBackup.test.ts - here we only care whether the on-connect
// trigger decides to call it, and how it reports the outcome.
const collectForBackup = vi.hoisted(() => vi.fn());
const runBackup = vi.hoisted(() => vi.fn());
vi.mock("../src/model/configBackup/runBackup", () => ({ collectForBackup, runBackup }));

import Events from "@/utils/events";

import { CONFIG_SAVE_DEBOUNCE_MS, installAutoBackupNudges, uninstallAutoBackupNudges } from "../src/model/configBackup/autoBackupNudges";

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

// §A1: a backup that came due mid-print (so only the plain nudge could be shown) is taken as soon as the
// machine goes from busy to idle, instead of waiting for the next reconnect.
describe("auto-run trigger - runs when the machine becomes idle", () => {
	function setStatus(status: string) {
		setModel({ ...loadObjectModel(), state: { status } });
	}

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "dropbox" });
		makeOverdue();
	});
	afterEach(() => vi.useRealTimers());

	async function connectBusy() {
		setStatus("processing");
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		expect(runBackup).not.toHaveBeenCalled(); // mid-print: only the nudge
	}

	it("fires once on processing -> idle", async () => {
		await connectBusy();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1);
		expect(runBackup.mock.calls[0][1]).toMatchObject({ destination: "dropbox" });
	});

	it("does not fire on busy -> busy, or on paused (not strictly idle)", async () => {
		await connectBusy();
		setStatus("paused");
		await flushPromises();
		setStatus("processing");
		await flushPromises();
		expect(runBackup).not.toHaveBeenCalled();
	});

	it("does not fire when the status was never busy (undefined -> idle)", async () => {
		setModel({ ...loadObjectModel(), state: {} });
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).not.toHaveBeenCalled();
	});

	it("shares its cooldown with the connect trigger", async () => {
		setStatus("idle");
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1); // connect trigger ran (and failed to clear "overdue" - mocked)

		vi.setSystemTime(Date.now() + 5 * 60 * 1000);
		setStatus("processing");
		await flushPromises();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1); // inside the hour: skipped

		vi.setSystemTime(Date.now() + 61 * 60 * 1000);
		setStatus("processing");
		await flushPromises();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(2);
	});

	it("a reconnect shortly after an idle-edge run does not start a second one", async () => {
		await connectBusy();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 5 * 60 * 1000);
		setConnected(false);
		await flushPromises();
		setConnected(true);
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1);
	});

	it("never fires when disabled, ineligible, or not overdue", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: false, autoRun: false, autoRunDestination: "dropbox" });
		await connectBusy();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).not.toHaveBeenCalled();

		uninstallAutoBackupNudges();
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "drive" });
		setConnected(false);
		await flushPromises();
		await connectBusy();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).not.toHaveBeenCalled();

		uninstallAutoBackupNudges();
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "dropbox" });
		setLastBackupAt(new Date().toISOString());
		setConnected(false);
		await flushPromises();
		await connectBusy();
		setStatus("idle");
		await flushPromises();
		expect(runBackup).not.toHaveBeenCalled();
	});
});

// §A2: an opt-in backup a while after config.g is saved. Waits for the LAST save of a burst to settle, runs only if
// the destination is eligible and the machine idle, and otherwise leaves the ordinary "config.g saved" nudge.
describe("auto-run trigger - shortly after config.g is saved (opt-in)", () => {
	const CONFIG = "0:/sys/config.g";
	const save = (filename = CONFIG) => Events.emit("fileUploaded", { filename } as never);
	const armed = (over: Record<string, unknown> = {}) =>
		setAutoBackupNudgeSettings({ configSaved: true, overdue: false, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "dropbox", autoRunOnConfigSave: true, ...over } as never);

	beforeEach(() => {
		vi.useFakeTimers();
		setLastBackupAt(new Date().toISOString()); // NOT overdue: only the save trigger can start a run here
	});
	afterEach(() => vi.useRealTimers());

	async function start() {
		installAutoBackupNudges();
		setConnected(true);
		await flushPromises();
		dwc.notifications.length = 0;
	}
	const advance = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await flushPromises(); };

	it("is off by default: a config.g save just raises the ordinary nudge, as before", async () => {
		setAutoBackupNudgeSettings({ configSaved: true, overdue: false, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "dropbox" });
		await start();
		save();
		expect(notificationTitles()).toContain(NUDGE("configSavedTitle"));
		await advance(CONFIG_SAVE_DEBOUNCE_MS * 2);
		expect(runBackup).not.toHaveBeenCalled();
	});

	it("when armed, waits out the quiet time, then runs once, and holds the nudge back", async () => {
		armed();
		await start();
		save();
		expect(notificationTitles()).not.toContain(NUDGE("configSavedTitle"));
		await advance(CONFIG_SAVE_DEBOUNCE_MS - 1000);
		expect(runBackup).not.toHaveBeenCalled();
		await advance(1500);
		expect(runBackup).toHaveBeenCalledTimes(1);
		expect(runBackup.mock.calls[0][1]).toMatchObject({ destination: "dropbox" });
		expect(notificationTitles()).not.toContain(NUDGE("configSavedTitle"));
	});

	it("a burst of saves is ONE backup, timed from the last save", async () => {
		armed();
		await start();
		save();
		await advance(CONFIG_SAVE_DEBOUNCE_MS / 2);
		save();
		await advance(CONFIG_SAVE_DEBOUNCE_MS / 2 + 1000); // the first save's window has passed, the second's has not
		expect(runBackup).not.toHaveBeenCalled();
		await advance(CONFIG_SAVE_DEBOUNCE_MS / 2);
		expect(runBackup).toHaveBeenCalledTimes(1);
	});

	it("the debounce is longer than the 5-minute nudge rate-limit (which is not a debounce)", () => {
		expect(CONFIG_SAVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
	});

	it("falls back to the ordinary nudge when the machine is busy at the time", async () => {
		armed();
		await start();
		save();
		setModel({ ...loadObjectModel(), state: { status: "processing" } });
		await advance(CONFIG_SAVE_DEBOUNCE_MS + 1000);
		expect(runBackup).not.toHaveBeenCalled();
		expect(notificationTitles()).toContain(NUDGE("configSavedTitle"));
	});

	it("falls back to the nudge if it was switched off during the wait", async () => {
		armed();
		await start();
		save();
		setAutoBackupNudgeSettings({ configSaved: true, overdue: false, overdueDays: 7, newMachine: false, autoRun: true, autoRunDestination: "dropbox" });
		await advance(CONFIG_SAVE_DEBOUNCE_MS + 1000);
		expect(runBackup).not.toHaveBeenCalled();
		expect(notificationTitles()).toContain(NUDGE("configSavedTitle"));
	});

	it("does not arm without auto-run, or for an ineligible destination or an encrypted one", async () => {
		for (const over of [{ autoRun: false }, { autoRunDestination: "local" }, { autoRunDestination: "drive" }, { autoRunDestination: null }]) {
			resetForTests();
			configureHost({ storageNamespace: "flexibleLayouts.configBackup" });
			armed(over);
			runBackup.mockClear();
			await start();
			dwc.notifications.length = 0;
			save();
			expect(notificationTitles()).toContain(NUDGE("configSavedTitle")); // immediate, ordinary
			await advance(CONFIG_SAVE_DEBOUNCE_MS * 2);
			expect(runBackup).not.toHaveBeenCalled();
			uninstallAutoBackupNudges();
		}
		resetForTests();
		configureHost({ storageNamespace: "flexibleLayouts.configBackup" });
		armed();
		setEncryptPreference("dropbox", true);
		await start();
		dwc.notifications.length = 0;
		save();
		expect(notificationTitles()).toContain(NUDGE("configSavedTitle"));
	});

	it("ignores every file except config.g", async () => {
		armed();
		await start();
		save("0:/sys/other.g");
		save("0:/macros/config.g.bak");
		await advance(CONFIG_SAVE_DEBOUNCE_MS * 2);
		expect(runBackup).not.toHaveBeenCalled();
		expect(notificationTitles()).not.toContain(NUDGE("configSavedTitle"));
	});

	it("the overdue and save triggers cannot double up (they share the in-flight guard)", async () => {
		makeOverdue();
		armed();
		let release: () => void = () => {};
		runBackup.mockImplementation(() => new Promise((res) => { release = () => res({ ok: true, built: { manifest: {} }, redacted: false }); }));
		installAutoBackupNudges();
		setConnected(true); // the overdue trigger starts a (slow) run
		await flushPromises();
		expect(runBackup).toHaveBeenCalledTimes(1);
		save();
		await advance(CONFIG_SAVE_DEBOUNCE_MS + 1000);
		expect(runBackup).toHaveBeenCalledTimes(1); // still in flight: no second one
		release();
		await flushPromises();
	});

	it("uninstalling cancels a pending backup", async () => {
		armed();
		await start();
		save();
		uninstallAutoBackupNudges();
		await advance(CONFIG_SAVE_DEBOUNCE_MS * 2);
		expect(runBackup).not.toHaveBeenCalled();
	});

	it("the flag round-trips through the core's settings blob without needing a migration", () => {
		armed();
		expect(getAutoBackupNudgeSettings().autoRunOnConfigSave).toBe(true);
		setAutoBackupNudgeSettings({ ...getAutoBackupNudgeSettings(), autoRunOnConfigSave: false });
		expect(getAutoBackupNudgeSettings().autoRunOnConfigSave).toBe(false);
		// an older stored blob that predates the field reads as off
		setAutoBackupNudgeSettings({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true, autoRun: false, autoRunDestination: null });
		expect(getAutoBackupNudgeSettings().autoRunOnConfigSave).toBe(false);
	});
});
