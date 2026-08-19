/**
 * Orchestrates a full CAN address change: scans every file under 0:/sys, 0:/macros and 0:/filaments
 * (recursively - Macros.md documents macros as freely sub-foldered, and each filament gets its own
 * subfolder under 0:/filaments/<name>/ with its own config.g/load.g/unload.g) for references to the
 * board's old address, plans the rewrite (rewrite.ts), and - once applied - reprograms the board
 * itself. 0:/filaments/ commonly doesn't exist at all on a machine with no custom filaments defined -
 * that's normal, not an error (matches dwc-config-backup-core's own collect.ts comment on the same
 * directory), and is handled the same way a missing 0:/macros subfolder already is: the recursive
 * listing just resolves to nothing for that root.
 *
 * Deliberately does NOT filter by a ".g" extension. RRF has no extension requirement for a macro
 * invoked via M98 - it just runs whatever text is in the file - and user macros conventionally have
 * NO extension at all (e.g. "Preheat PLA", "Load Filament"), confirmed against DWC's own macro
 * browser (components/lists/MacroList.vue lists every non-directory file with no default extension
 * filter) and already documented in this repo's own MacrosWidget.vue. Only files under 0:/sys/ and
 * 0:/filaments/<name>/ that RRF looks up by a hardcoded name (config.g, tpost0.g, start.g, load.g,
 * unload.g, ...) truly need ".g", but a machine can just as easily have a no-extension helper file
 * M98-included from one of those - so every scanned directory is walked without any extension filter,
 * matching DWC's own default macro-list behaviour exactly. A binary file picked up this way just
 * yields no matches; harmless.
 *
 * DOES skip any file ending in ".bak" though - that's DWC's own backup-copy convention (see
 * src/utils/path.ts's `configBackupFile: "config.g.bak"` and MonacoEditor.vue's save-time backup), a
 * stale snapshot of an earlier version of a file, never something RRF executes live. Rewriting one
 * would edit dead content that just sits there looking like it still matches the current config.g -
 * actively misleading rather than harmless.
 *
 * Deliberately does NOT restart the whole machine. M952 only takes effect once the EXPANSION board
 * itself is restarted (RRF Gcode Dictionary: "the change of CAN address will not take place until the
 * expansion board is restarted"), which `M999 B<oldAddr>` does - note the OLD address, since the board
 * keeps responding on it right up until that restart. But the MAIN board's own in-memory drive mapping
 * (from the M584/M569 lines this module just corrected in config.g) is only re-read at the main board's
 * own next boot - so a full machine restart is still needed afterward for movement to work correctly
 * again. That's a much higher-blast-radius action (drops the current connection, aborts any job) than
 * this module should ever trigger on its own - the caller must surface it as an explicit, separate step.
 */
import type { FileListEntry, MachineIO } from "dwc-config-backup-core";

import { rewriteCanAddressReferences, type CanAddressRewriteResult } from "./rewrite";

export const CAN_ADDRESS_MIN = 1;
export const CAN_ADDRESS_MAX = 125;

const SCAN_ROOTS = ["0:/sys", "0:/macros", "0:/filaments"];

async function listAllFilesRecursive(io: Pick<MachineIO, "getFileList">, dir: string): Promise<Array<string>> {
	let entries: Array<FileListEntry> = [];
	try {
		entries = await io.getFileList(dir);
	} catch {
		return [];
	}
	const out: Array<string> = [];
	for (const entry of entries) {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory) {
			out.push(...await listAllFilesRecursive(io, path));
		} else if (!/\.bak$/i.test(entry.name)) {
			out.push(path);
		}
	}
	return out;
}

export interface CanAddressFilePlan {
	path: string;
	result: CanAddressRewriteResult;
}

/** Downloads and plans a rewrite for every file under 0:/sys, 0:/macros and 0:/filaments that actually
 *  references `oldAddr` - read-only, used for the preview. Files with nothing to change are omitted
 *  entirely, so the preview only ever shows what will actually be touched. */
export async function planCanAddressRewrite(
	io: Pick<MachineIO, "getFileList" | "downloadText">, oldAddr: number, newAddr: number,
): Promise<Array<CanAddressFilePlan>> {
	const files: Array<string> = [];
	for (const root of SCAN_ROOTS) { files.push(...await listAllFilesRecursive(io, root)); }

	const plans: Array<CanAddressFilePlan> = [];
	for (const path of files) {
		const text = await io.downloadText(path).catch(() => null);
		if (text == null) { continue; }
		const result = rewriteCanAddressReferences(text, oldAddr, newAddr);
		if (result.changed) { plans.push({ path, result }); }
	}
	return plans;
}

/** Uploads every planned rewrite. */
export async function applyCanAddressRewrite(io: Pick<MachineIO, "upload">, plans: Array<CanAddressFilePlan>): Promise<void> {
	for (const { path, result } of plans) {
		await io.upload(path, new Blob([result.text], { type: "text/plain" }));
	}
}

/** Reprograms the expansion board's stored address (M952) and restarts JUST that board (M999, still
 *  addressed at its OLD number - see the module doc comment for why) so the change takes effect. Does
 *  NOT restart the main board - the caller is responsible for telling the user a full machine restart
 *  is still needed for the corrected driver mapping in config.g to actually be re-read. */
export async function sendCanAddressChange(io: Pick<MachineIO, "sendCode">, oldAddr: number, newAddr: number): Promise<void> {
	await io.sendCode(`M952 B${oldAddr} A${newAddr}`);
	await io.sendCode(`M999 B${oldAddr}`);
}
