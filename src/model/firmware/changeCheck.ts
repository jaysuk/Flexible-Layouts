/**
 * The shared, reactive half of the firmware-change feature: runs a scan of the machine's own files between two versions and
 * remembers the latest report for the dialog. The automatic trigger (`changeNudges.ts`), the Settings card's "Check now" and the
 * firmware-update pre-flight all go through here, so they agree on what "the machine's files" are and how the cache is used.
 */
import { ref, shallowRef, toRaw } from "vue";

import type { ImpactReport, ScanFile } from "dwc-gcode-core";

import { useMachineStore } from "@/stores/machine";

import { defaultMachineIO } from "../configBackup/machineIO";
import { directoriesOf, scanMachine, type LoadResult } from "./changeScan";
import { readFirmwareChangeState } from "./changeState";

/** The latest report - from the automatic check, "Check now", or a re-scan when the dialog opens. */
export const firmwareChangeReport = shallowRef<ImpactReport | null>(null);
/** What the last scan could not read (too large, unreadable), for the report's footer. */
export const firmwareChangeLoad = shallowRef<Pick<LoadResult, "tooLarge" | "unreadable" | "cacheHits"> | null>(null);
export const firmwareScanBusy = ref(false);

/**
 * The text each report was made from. A suggested edit is a list of offsets into that text, so the plan for a report
 * (`changePlan.ts`) must read the SAME files, not whatever the cache holds by the time the dialog renders. Keyed by the
 * report object, so a pre-flight report and the shared one never share files, and the files go with the report.
 */
const reportFiles = new WeakMap<ImpactReport, ReadonlyArray<ScanFile>>();
// `toRaw`: a report handed down as a prop, or held in a deep `ref` (the firmware-update widget's pre-flight), arrives as a reactive Proxy,
// which is a different key from the object the scan registered.
export const filesOfReport = (report: ImpactReport): ReadonlyArray<ScanFile> => reportFiles.get(toRaw(report)) ?? [];
/** Say which text a report was made from (a scan does this itself; a test that builds a report with `scanImpact` does it by hand). */
export function rememberReportFiles(report: ImpactReport, files: ReadonlyArray<ScanFile>): ImpactReport {
	reportFiles.set(toRaw(report), files);
	return report;
}
/** Set by the toast's click-through; the Settings tab opens the report when it sees it (and clears it). */
export const reportOpenRequested = ref(false);

/** The machine's status string (`state.status`), or undefined. */
export function machineStatus(): string | undefined {
	return (useMachineStore().model as { state?: { status?: string } }).state?.status;
}

export interface RunScanOptions {
	/** Stop (and report nothing) unless the machine is connected and strictly idle. The manual "Check now" does not need it. */
	requireIdle?: boolean;
	/** Use these instead of the stored acknowledged ids. */
	acknowledged?: ReadonlyArray<string>;
	/** Keep the result out of the shared `firmwareChangeReport` (a pre-flight against a hypothetical release). */
	quiet?: boolean;
	onProgress?: (done: number, total: number) => void;
}

/**
 * Scan the machine's `sys` and `macros` between `from` and `to` (either order). Resolves `null` when the scan was stopped
 * (connection lost, or a job started when `requireIdle`). Only one scan runs at a time: a second call while one is in flight
 * resolves `null` rather than queueing.
 */
export async function runFirmwareScan(from: string, to: string, options: RunScanOptions = {}): Promise<ImpactReport | null> {
	if (firmwareScanBusy.value) { return null; }
	const machineStore = useMachineStore();
	firmwareScanBusy.value = true;
	try {
		const scan = await scanMachine(defaultMachineIO(), from, to, {
			directories: directoriesOf(machineStore.model),
			acknowledged: options.acknowledged ?? readFirmwareChangeState().acknowledged,
			onProgress: options.onProgress,
			shouldContinue: () => machineStore.isConnected && (!options.requireIdle || machineStatus() === "idle"),
		});
		if (scan === null) { return null; }
		rememberReportFiles(scan.report, scan.load.files);
		if (options.quiet !== true) {
			firmwareChangeReport.value = scan.report;
			firmwareChangeLoad.value = { tooLarge: scan.load.tooLarge, unreadable: scan.load.unreadable, cacheHits: scan.load.cacheHits };
		}
		return scan.report;
	} finally {
		firmwareScanBusy.value = false;
	}
}

/** How long a toast's "open the report" request stays valid; a Settings visit much later should not pop a dialog. */
export const REPORT_REQUEST_TTL_MS = 2 * 60 * 1000;
let requestTimer: ReturnType<typeof setTimeout> | undefined;

/** Ask the Settings tab to open the report (used by the toast, whose route can only name the page). */
export function requestFirmwareReport(): void {
	reportOpenRequested.value = true;
	clearTimeout(requestTimer);
	requestTimer = setTimeout(() => { reportOpenRequested.value = false; }, REPORT_REQUEST_TTL_MS);
}
