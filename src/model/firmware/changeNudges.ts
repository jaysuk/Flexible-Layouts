/**
 * Host wiring for the firmware-change toast: when the main board's firmware version differs from the one the user last reviewed
 * their files against, scan `0:/sys` and `0:/macros` for lines that use something that changed, and raise ONE click-through toast
 * if there are any. Installed once at plugin load, torn down on `dwcPluginUnloaded`, in the shape of `installAutoBackupNudges`.
 *
 *  - First ever connect: the current version is recorded as the baseline and nothing is said (there is nothing to compare with).
 *  - Same version: nothing. A different version - newer OR older - scans, and only while the machine is strictly idle; if it is busy
 *    the scan waits for the busy -> idle edge (same rule as the backup auto-run).
 *  - Findings: one toast, once per `baseline->running` pair machine-wide (`notifiedKey`); the baseline stays put until the user marks
 *    the report reviewed. No findings: the baseline advances silently. The wording is "known changes", never "your files are safe".
 *  - Runs on the first connect and every reconnect (a firmware update reboots the board), with `CHECK_COOLDOWN_MS` so a flapping
 *    connection cannot rescan.
 */
import { watch } from "vue";

import { LogLevel, useUiStore } from "@/stores/ui";
import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { firmwareChangeReport, machineStatus, requestFirmwareReport, runFirmwareScan } from "./changeCheck";
import {
	acknowledgeReview, decideCheck, mainBoardFirmwareVersion, readFirmwareChangeState, writeFirmwareChangeState,
} from "./changeState";

export const CHECK_COOLDOWN_MS = 10 * 60 * 1000;
/** The page the toast opens: FL's own Settings tab, which shows the report (see `requestFirmwareReport`). */
export const FIRMWARE_CHANGES_ROUTE_PATH = "/Settings/flexibleLayouts";

let stopWatch: (() => void) | null = null;
let stopIdleWatch: (() => void) | null = null;
let stopEnabledWatch: (() => void) | null = null;
let lastScanAt = 0;
let lastScanKey = "";
let waitingForIdle = false;
let inFlight = false;

function t(key: string, params?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.firmwareChanges.${key}`, params ?? {});
}

/** One evaluation of the connect/idle trigger. Exported for tests; the watchers call it. */
export async function checkFirmwareChanges(): Promise<void> {
	const machineStore = useMachineStore();
	if (!machineStore.isConnected || inFlight) { return; }
	const state = readFirmwareChangeState();
	const running = mainBoardFirmwareVersion(machineStore.model);
	const decision = decideCheck(state, running);
	if (decision === "none" || running === null) { return; }
	if (decision === "record-baseline") {
		writeFirmwareChangeState({ baseline: running });
		return;
	}

	const baseline = state.baseline!;
	if (machineStatus() !== "idle") { waitingForIdle = true; return; }
	const key = `${baseline}->${running}`;
	if (key === lastScanKey && Date.now() - lastScanAt < CHECK_COOLDOWN_MS) { return; }

	inFlight = true;
	try {
		const report = await runFirmwareScan(baseline, running, { requireIdle: true });
		if (report === null) { waitingForIdle = true; return; } // interrupted: the next idle edge or reconnect tries again
		waitingForIdle = false;
		lastScanAt = Date.now();
		lastScanKey = key;
		const { occurrences, filesAffected, eventsHit } = report.totals;
		writeFirmwareChangeState({
			lastScan: { from: baseline, to: running, at: new Date().toISOString(), occurrences, files: filesAffected, events: eventsHit },
		});
		if (occurrences === 0) {
			acknowledgeReview(running); // nothing known is affected: move on without a word
			return;
		}
		if (readFirmwareChangeState().notifiedKey === key) { return; }
		writeFirmwareChangeState({ notifiedKey: key });
		requestFirmwareReport();
		useUiStore().log(
			LogLevel.info,
			t("toastTitle"),
			t("toastBody", { from: baseline, to: running, lines: occurrences, files: filesAffected }),
			FIRMWARE_CHANGES_ROUTE_PATH,
		);
	} finally {
		inFlight = false;
	}
}

export function installFirmwareChangeNudges(): void {
	const machineStore = useMachineStore();
	// A firmware update reboots the board: the connection drops and comes back with a new version, so watching the pair covers both
	// the first connect and every reconnect. The version can also arrive a moment after `isConnected` (the model loads after it).
	stopWatch = watch(
		() => [machineStore.isConnected, mainBoardFirmwareVersion(machineStore.model)] as const,
		([connected]) => { if (connected) { void checkFirmwareChanges(); } },
		{ immediate: true },
	);
	stopIdleWatch = watch(machineStatus, (status) => {
		if (status === "idle" && waitingForIdle) { void checkFirmwareChanges(); }
	});
	// Switching the feature on while connected should check now, not at the next reconnect.
	stopEnabledWatch = watch(() => readFirmwareChangeState().enabled, (enabled) => {
		if (enabled && machineStore.isConnected) { void checkFirmwareChanges(); }
	});
}

export function uninstallFirmwareChangeNudges(): void {
	if (stopWatch) { stopWatch(); stopWatch = null; }
	if (stopIdleWatch) { stopIdleWatch(); stopIdleWatch = null; }
	if (stopEnabledWatch) { stopEnabledWatch(); stopEnabledWatch = null; }
	lastScanAt = 0;
	lastScanKey = "";
	waitingForIdle = false;
	inFlight = false;
	firmwareChangeReport.value = null;
}
