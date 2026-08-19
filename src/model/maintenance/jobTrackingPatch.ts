/**
 * Job-started/finished/cancelled counting, patched directly into RRF's own start.g/stop.g/cancel.g
 * macros rather than inferred by pattern-matching RRF's WARN-level event log text (eventLog.ts) - that
 * approach counted ANY warn-level line containing "started" as a job start, with no scoping to it
 * actually being about a print, which is what let a real user's "jobs started" figure climb without
 * them ever starting a job.
 *
 * Verified directly against RRF firmware source (Duet3D/RepRapFirmware: GCodes.cpp, GCodes2.cpp,
 * GCodes4.cpp, RepRap.cpp), not just the wiki:
 *  - start.g runs exactly once per genuine NEW print start (`StartPrinting(fromStart=true)`,
 *    GCodes.cpp) - NOT on a resume after pause/power-fail (`fromStart=false`) - but it runs for BOTH a
 *    real print AND an M37 simulation/dry-run, from the exact same call site. `state.status` DOES
 *    differ between the two by the time start.g's own gcode executes (RepRap::GetStatusIndex: printing
 *    while `IsSimulating()` reports "simulating", otherwise "processing" - both derived from
 *    `IsPrinting()`, which is already true before start.g runs). The appended block therefore guards on
 *    `state.status != "simulating"` - a dry-run must never count as a job actually starting.
 *  - stop.g runs ONLY on genuine, non-simulated normal completion (GCodes4.cpp's `GCodeState::stopping`
 *    handler, reached from `StopPrint(..., normalCompletion)`). A simulation's completion is a
 *    completely separate branch in `StopPrint` (`exitSimulationWhenFileComplete`) that calls
 *    `EndSimulation()` directly and never touches `GCodeState`/`DoFileMacro` at all - so stop.g needs
 *    no simulation guard, it simply never runs during one.
 *  - cancel.g runs ONLY for a real (non-simulated) cancel of an ALREADY-PAUSED print
 *    (GCodes2.cpp: `else if (pauseState == PauseState::paused)`, itself guarded by
 *    `if (!wasSimulating)`) - and CRITICALLY, if cancel.g does not exist, RRF silently falls back to
 *    running stop.g INSTEAD ("If cancel.g exists then run it and do nothing else... if
 *    (!DoFileMacro(gb, STOP_G, ...))"). So unlike start.g/stop.g (already common in a real config),
 *    cancel.g being absent doesn't just mean "one less place to count" - it actively misattributes
 *    every real cancellation as a finish. This module therefore always creates cancel.g if missing,
 *    exactly like the other two, so that misattribution can't happen once tracking is set up.
 *
 * Never overwrites existing content, same non-destructive contract as configPatch.ts/toolChangePatch.ts.
 */
import type { MachineIO } from "dwc-config-backup-core";

import { appendLine, findLine, type GcodeFilePatchResult } from "../../util/gcodeFilePatch";
import { SYS_DIR } from "./toolChangePatch";

export const START_G_PATH = `${SYS_DIR}/start.g`;
export const STOP_G_PATH = `${SYS_DIR}/stop.g`;
export const CANCEL_G_PATH = `${SYS_DIR}/cancel.g`;

const START_MARKER = "flMaintJobsStarted = global.flMaintJobsStarted + 1";
const STOP_MARKER = "flMaintJobsFinished = global.flMaintJobsFinished + 1";
const CANCEL_MARKER = "flMaintJobsCancelled = global.flMaintJobsCancelled + 1";

const START_BLOCK = `; Flexible Layouts: count this job start for maintenance tracking (skipped during an M37 simulation)
if exists(global.flMaintJobsStarted) && state.status != "simulating"
	set global.flMaintJobsStarted = global.flMaintJobsStarted + 1`;

const STOP_BLOCK = `; Flexible Layouts: count this job finish for maintenance tracking
if exists(global.flMaintJobsFinished)
	set global.flMaintJobsFinished = global.flMaintJobsFinished + 1`;

const CANCEL_BLOCK = `; Flexible Layouts: count this job cancellation for maintenance tracking
if exists(global.flMaintJobsCancelled)
	set global.flMaintJobsCancelled = global.flMaintJobsCancelled + 1`;

function hasMarker(text: string, marker: string): boolean {
	return findLine(text, (code) => code.includes(marker)) !== null;
}

function patchJobMacro(existingText: string | null, marker: string, block: string, createMessage: string): GcodeFilePatchResult {
	if (existingText === null) {
		return { text: `${block}\n`, changed: true, changes: [createMessage] };
	}
	if (hasMarker(existingText, marker)) {
		return { text: existingText, changed: false, changes: [] };
	}
	return { text: appendLine(existingText, block), changed: true, changes: ["Added job tracking to the end of this file."] };
}

export function patchStartGForJobTracking(existingText: string | null): GcodeFilePatchResult {
	return patchJobMacro(existingText, START_MARKER, START_BLOCK, "No start.g on the card yet - creating one with just the job-start counter.");
}

export function patchStopGForJobTracking(existingText: string | null): GcodeFilePatchResult {
	return patchJobMacro(existingText, STOP_MARKER, STOP_BLOCK, "No stop.g on the card yet - creating one with just the job-finish counter.");
}

/** Unlike start.g/stop.g, a missing cancel.g isn't optional here - see the module doc comment for why
 *  RRF falls back to running stop.g instead, silently miscounting every real cancellation as a finish. */
export function patchCancelGForJobTracking(existingText: string | null): GcodeFilePatchResult {
	return patchJobMacro(
		existingText, CANCEL_MARKER, CANCEL_BLOCK,
		"No cancel.g on the card yet - creating one with just the job-cancel counter. Without this file, RRF runs stop.g instead when a paused print is cancelled, miscounting it as finished.",
	);
}

export interface JobMacroPlan {
	file: string;
	path: string;
	plan: GcodeFilePatchResult;
}

const JOB_MACRO_TARGETS: ReadonlyArray<{ file: string; path: string; patch: (existingText: string | null) => GcodeFilePatchResult }> = [
	{ file: "start.g", path: START_G_PATH, patch: patchStartGForJobTracking },
	{ file: "stop.g", path: STOP_G_PATH, patch: patchStopGForJobTracking },
	{ file: "cancel.g", path: CANCEL_G_PATH, patch: patchCancelGForJobTracking },
];

/** Downloads and plans a patch for start.g/stop.g/cancel.g - read-only, used both for the setup
 *  dialog's preview and immediately before applying. */
export async function planJobTrackingPatches(io: Pick<MachineIO, "downloadText">): Promise<Array<JobMacroPlan>> {
	const plans: Array<JobMacroPlan> = [];
	for (const target of JOB_MACRO_TARGETS) {
		const existingText = await io.downloadText(target.path).catch(() => null);
		plans.push({ file: target.file, path: target.path, plan: target.patch(existingText) });
	}
	return plans;
}

/** Uploads every plan that actually changed something; plans with nothing to do are skipped. */
export async function applyJobTrackingPatches(io: Pick<MachineIO, "upload">, plans: Array<JobMacroPlan>): Promise<void> {
	for (const { path, plan } of plans) {
		if (!plan.changed) { continue; }
		await io.upload(path, new Blob([plan.text], { type: "text/plain" }));
	}
}
