/**
 * Pure builder for the run-from-line resume preamble - the most dangerous thing in this codebase, so
 * it lives in its own module with its own tests rather than staying inline in ToolpathWidget.vue.
 *
 * M26 only seeks the file pointer; it does NOT reset modal state, so a bare M26 + M24 resumes a
 * program whose modal state (units/plane/WCS/tool/spindle/feed/coolant/distance mode) was set by
 * lines the machine will never (re-)execute. This reconstructs that state first, from
 * model/gcode/modalState.ts's replay, then moves to a safe, known position before resuming.
 */
import type { ModalState } from "./modalState";

export interface ResumePreambleOptions {
	/** Byte offset to resume at (the position M26 seeks to). */
	offset: number;
	/** Work-coordinate Z height to lift to (at the resume X/Y) before M26/M24 - always a safe retract
	 *  height the caller supplies, never the file's own cutting depth. */
	safeZ: number;
	/** The tool currently selected on the machine (state.currentTool), or null if unknown. Only
	 *  used to decide whether T<n> needs reissuing - see buildResumePreamble's doc comment. */
	currentTool: number | null;
}

/**
 * Build the full preamble + M26 + M24 as one multi-line G-code block, ready to send verbatim (and to
 * show verbatim in a confirm dialog first - the caller must never send this without an explicit,
 * visible confirmation).
 */
export function buildResumePreamble(state: ModalState, opts: ResumePreambleOptions): string {
	const lines: Array<string> = [];
	lines.push(state.units === "inch" ? "G20" : "G21");
	lines.push(state.plane === 18 ? "G18" : state.plane === 19 ? "G19" : "G17");
	// WCS must be selected before any coordinate move below, or the safety Z/XY targets would be
	// interpreted in whatever WCS happens to be active right now instead of the one the file expects.
	if (state.wcs) { lines.push(state.wcs); }
	// Only reissue T<n> if it differs from the tool already selected - re-selecting the SAME tool
	// runs a full tool-change sequence (freed/parked/re-picked) for nothing, and could even eject a
	// tool that's already correctly loaded.
	if (state.tool !== null && state.tool !== opts.currentTool) { lines.push(`T${state.tool}`); }
	if (state.spindleDirection === "cw") { lines.push(`M3 S${state.spindleRpm}`); }
	else if (state.spindleDirection === "ccw") { lines.push(`M4 S${state.spindleRpm}`); }
	else { lines.push("M5"); }
	if (state.coolantFlood) { lines.push("M8"); }
	else if (state.coolantMist) { lines.push("M7"); }
	else { lines.push("M9"); }
	// Force absolute for these two safety moves specifically, regardless of the file's own distance
	// mode at the resume point - that mode is restored explicitly below, right before M26/M24, since
	// M26 does not reset modal state; whatever is active when M24 resumes is what the file's own next
	// lines inherit.
	lines.push("G90");
	lines.push(`G0 Z${opts.safeZ}`);
	lines.push(`G0 X${state.x} Y${state.y}`);
	lines.push(state.absolute ? "G90" : "G91");
	if (state.feed > 0) { lines.push(`G1 F${state.feed}`); } // sets the modal feed only; no move word follows
	lines.push(`M26 S${opts.offset}`);
	lines.push("M24");
	return lines.join("\n");
}
