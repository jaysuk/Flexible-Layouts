/**
 * From a scan report to what the user has to do about it, and doing it.
 *
 * `dwc-gcode-core`'s `planActions` decides which occurrences matter and what edit would put each right; this file is the host half:
 *  - `planFor(report)`: the plan for a report, over the text that report was made from;
 *  - `applyFix(report, edits)`: writes an edit to the SD card - only when it is still true, with the original kept and an undo;
 *  - `squiggleWanted`: which events the editor draws squiggles for (the same "only what needs attention" rule).
 *
 * Writing to a printer's SD card is the part to be careful with, so `applyFix` refuses rather than guesses:
 *  1. connected and strictly idle, like the scan (a config file is not edited under a running job);
 *  2. every file is downloaded again and must equal the text the report was made from - offsets into anything else would edit the wrong place;
 *  3. the original is saved as `<file>.bak` before the first change to that file in this page session (so the first fix keeps its
 *     original even after a second one), and an in-memory undo restores the file as it was just before this edit - but only
 *     if the file is still exactly what this edit wrote;
 *  4. a failed write puts back the files already written.
 */
import {
	RULE_EVENT_IDS, applyFileEdits, changesBetween, planActions, severityOf,
	type ActionPlan, type FileEdit, type ImpactReport,
} from "dwc-gcode-core";
import type { MachineIO } from "dwc-config-backup-core";

import { useMachineStore } from "@/stores/machine";

import { defaultMachineIO } from "../configBackup/machineIO";
import { filesOfReport, machineStatus } from "./changeCheck";
import { forgetScannedFiles } from "./changeScan";
import type { FirmwareRange } from "./impactRange";

export function planFor(report: ImpactReport): ActionPlan {
	return planActions(report, filesOfReport(report));
}

/** What the toast and the Settings card count: the lines that need changing (not the ones worth a look). */
export function summaryOf(plan: ActionPlan): { lines: number; files: number; events: number } {
	return {
		lines: plan.problems.length,
		files: new Set(plan.problems.map((p) => p.occurrence.path)).size,
		events: new Set(plan.problems.map((p) => p.event.id)).size,
	};
}

/**
 * Whether the editor should draw a squiggle for an event over `range`. The same rule as the dialog: nothing for a change that cannot hurt,
 * and nothing for one whose occurrences need a look at the other files to tell (a heater number is fine until it is used twice).
 */
export function squiggleWanted(eventId: string, range: FirmwareRange): boolean {
	const event = changesBetween(range.from, range.to).find((e) => e.id === eventId);
	if (event === undefined) { return true; }
	const severity = severityOf(event);
	if (severity === "info") { return false; }
	return !(RULE_EVENT_IDS.includes(eventId) && severity !== "breaks");
}

// --- applying ----------------------------------------------------------------------------------------------------------

export type ApplyIO = Pick<MachineIO, "downloadText" | "upload">;

export type ApplyFailure = "offline" | "busy" | "changed" | "failed";

export type UndoOutcome = { ok: true } | { ok: false; reason: "changed" | "failed"; path?: string };

export type ApplyOutcome =
	| { ok: true; paths: Array<string>; backups: Array<string>; needsRestart: boolean; undo: () => Promise<UndoOutcome> }
	| { ok: false; reason: ApplyFailure; path?: string };

/** Files whose original this page session has already saved as `.bak`. */
const backedUp = new Set<string>();
export const clearBackupMemory = (): void => backedUp.clear();

const asBlob = (text: string): Blob => new Blob([text], { type: "text/plain" });

export interface ApplyOptions {
	io?: ApplyIO;
	/** Test seam; defaults to the machine store. */
	state?: () => { connected: boolean; idle: boolean };
}

export async function applyFix(report: ImpactReport, edits: ReadonlyArray<FileEdit>, options: ApplyOptions = {}): Promise<ApplyOutcome> {
	const state = options.state?.() ?? { connected: useMachineStore().isConnected, idle: machineStatus() === "idle" };
	if (!state.connected) { return { ok: false, reason: "offline" }; }
	if (!state.idle) { return { ok: false, reason: "busy" }; }
	const io = options.io ?? defaultMachineIO();

	const scanned = filesOfReport(report);
	const paths = [...new Set(edits.map((e) => e.path))];
	const before = new Map<string, string>();
	for (const path of paths) {
		const known = scanned.find((f) => f.path === path);
		if (known === undefined) { return { ok: false, reason: "changed", path }; }
		let current: string;
		try { current = await io.downloadText(path); } catch { return { ok: false, reason: "failed", path }; }
		if (current !== known.text) { return { ok: false, reason: "changed", path }; }
		before.set(path, current);
	}

	let after: Map<string, string>;
	try {
		after = new Map(applyFileEdits([...before].map(([path, text]) => ({ path, text })), edits).map((f) => [f.path, f.text]));
	} catch {
		return { ok: false, reason: "failed" };
	}

	const backups: Array<string> = [];
	const written: Array<string> = [];
	try {
		for (const path of paths) {
			if (!backedUp.has(path)) {
				await io.upload(`${path}.bak`, asBlob(before.get(path)!));
				backedUp.add(path);
				backups.push(`${path}.bak`);
			}
		}
		for (const path of paths) {
			await io.upload(path, asBlob(after.get(path)!));
			written.push(path);
		}
	} catch {
		// Put back what was already written, best effort: a half-applied two-file edit is worse than none.
		for (const path of written) { try { await io.upload(path, asBlob(before.get(path)!)); } catch { /* nothing more to do */ } }
		return { ok: false, reason: "failed" };
	}

	forgetScannedFiles(paths);
	return {
		ok: true,
		paths,
		backups,
		needsRestart: paths.some((p) => /\/config\.g$/i.test(p)),
		async undo(): Promise<UndoOutcome> {
			for (const path of paths) {
				let current: string;
				try { current = await io.downloadText(path); } catch { return { ok: false, reason: "failed", path }; }
				if (current !== after.get(path)) { return { ok: false, reason: "changed", path }; }
			}
			try {
				for (const path of paths) { await io.upload(path, asBlob(before.get(path)!)); }
			} catch {
				return { ok: false, reason: "failed" };
			}
			forgetScannedFiles(paths);
			return { ok: true };
		},
	};
}
