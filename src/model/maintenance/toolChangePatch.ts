/**
 * Tool-change counting, patched directly into RRF's own tpost#.g / tpost.g macros rather than
 * inferred by polling `state.currentTool` in maintenance-daemon.g (see macros.ts's v6 changelog entry
 * for why the polling approach undercounts real-world usage). RRF's own tool-change sequence
 * guarantees tpost#.g (or its tpost.g fallback) runs exactly once per genuine tool change - selecting
 * a tool that's already active is a documented no-op that runs no macros at all (Duet3D wiki,
 * "Tool_changing.md") - so a direct increment here is authoritative in a way polling never can be.
 *
 * Per that same page's documented fallback rule: "If a tool-number-specific file is not found, RRF
 * tries to run tfree.g, tpre.g or tpost.g (without a tool number), regardless of the tool number." In
 * practice a machine either uses per-tool numbered files for every tool, or relies on the generic
 * tpost.g for all of them - so the generic file is only touched when NO numbered tpost#.g exists at
 * all on the card. If even one tpost#.g is present, only the numbered files found are patched; the
 * generic tpost.g is left alone (created or not) rather than assumed to also be in play for some other
 * tool. `tfree#.g`/`tpre#.g` aren't touched at all - only tpost matters for counting.
 *
 * Never overwrites existing content, same non-destructive contract as configPatch.ts's config.g/
 * daemon.g patches - these files commonly already carry real, load-bearing content (M116 temperature
 * waits, retraction, offset restores), and a full-file rewrite here would be a real hazard.
 */
import type { FileListEntry, MachineIO } from "dwc-config-backup-core";

import { appendLine, findLine, type GcodeFilePatchResult } from "../../util/gcodeFilePatch";

export const SYS_DIR = "0:/sys";
const TPOST_NUMBERED_RE = /^tpost\d+\.g$/i;

/** Unique enough to never collide with unrelated user content, specific enough that it only matches
 *  the actual mutating line this module writes (not just any mention of the variable name). */
const INCREMENT_MARKER = "flMaintToolChanges = global.flMaintToolChanges + 1";

const INCREMENT_BLOCK = `; Flexible Layouts: count this tool change for maintenance tracking
if exists(global.flMaintToolChanges)
	set global.flMaintToolChanges = global.flMaintToolChanges + 1`;

/** True if this tpost file already has the counting hook - guarded so re-running setup, or clicking
 *  "Redeploy" again, never double-appends (which would double-count every tool change from then on). */
export function tpostHasToolChangeHook(text: string): boolean {
	return findLine(text, (code) => code.includes(INCREMENT_MARKER)) !== null;
}

/** Appends the increment block if missing, or creates a minimal file containing just it if none
 *  exists yet (mirrors patchDaemonGForMaintenance's null-vs-empty-string distinction). No-ops
 *  (changed: false) if the hook is already present. */
export function patchTpostForToolChanges(existingText: string | null): GcodeFilePatchResult {
	if (existingText === null) {
		return { text: `${INCREMENT_BLOCK}\n`, changed: true, changes: ["No file on the card yet - creating one with just the tool-change counter."] };
	}
	if (tpostHasToolChangeHook(existingText)) {
		return { text: existingText, changed: false, changes: [] };
	}
	return { text: appendLine(existingText, INCREMENT_BLOCK), changed: true, changes: ["Added tool-change counting to the end of this file."] };
}

/** Every tpost#.g name currently on the card, if any exist - otherwise just the generic "tpost.g"
 *  fallback (created if it doesn't exist yet). See the module doc comment above for why these are
 *  mutually exclusive rather than additive. A directory-listing failure (e.g. offline) resolves to
 *  just the generic name rather than throwing, matching every other "best effort" check in this feature. */
export async function findTpostFiles(io: Pick<MachineIO, "getFileList">): Promise<Array<string>> {
	let entries: Array<FileListEntry> = [];
	try {
		entries = await io.getFileList(SYS_DIR);
	} catch {
		entries = [];
	}
	const numbered = new Set<string>();
	for (const entry of entries) {
		if (!entry.isDirectory && TPOST_NUMBERED_RE.test(entry.name)) { numbered.add(entry.name); }
	}
	if (numbered.size > 0) { return [...numbered].sort(); }
	return ["tpost.g"];
}

export interface TpostPatchPlan {
	file: string;
	path: string;
	plan: GcodeFilePatchResult;
}

/** Downloads and plans a patch for every relevant tpost file (see findTpostFiles) - read-only, used
 *  both for the setup dialog's preview and immediately before applying. */
export async function planTpostPatches(io: Pick<MachineIO, "getFileList" | "downloadText">): Promise<Array<TpostPatchPlan>> {
	const files = await findTpostFiles(io);
	const plans: Array<TpostPatchPlan> = [];
	for (const file of files) {
		const path = `${SYS_DIR}/${file}`;
		const existingText = await io.downloadText(path).catch(() => null);
		plans.push({ file, path, plan: patchTpostForToolChanges(existingText) });
	}
	return plans;
}

/** Uploads every plan that actually changed something; plans with nothing to do are skipped. */
export async function applyTpostPatches(io: Pick<MachineIO, "upload">, plans: Array<TpostPatchPlan>): Promise<void> {
	for (const { path, plan } of plans) {
		if (!plan.changed) { continue; }
		await io.upload(path, new Blob([plan.text], { type: "text/plain" }));
	}
}
