/**
 * Shared "does this widget type move the machine, and along which axes" classification - the one
 * fact both printLock.ts's "lock while printing" default and homedCheck.ts's "warn if unhomed"
 * check are really asking about, from two different angles.
 */
import type { Widget } from "../model/document";

/**
 * True if this widget type sends axis motion (G0/G1/G2/G3/G28 or equivalent) as part of normal
 * use. Excludes things that are unsafe mid-print for OTHER reasons (spindle control) and things
 * that only ever read/advise (preflight downloads and analyses a file; it never sends a move).
 */
export function movesAxes(widget: Widget): boolean {
	switch (widget.type) {
		case "jog":
		case "octopusJog":
		case "extruder":
		case "wcs":
		case "wcsTable":
		case "toolSelect":
		case "toolAlign":
		case "bedMesh":
		case "bedTram":
		case "xyzProbe":
		case "probeRoutines":
		case "probe":
		case "surfacing":
		case "toolpath":
			return true;
		default:
			return false;
	}
}

/**
 * The fixed set of axes a "guided routine" widget's motion depends on, for the homed-before-motion
 * check - null for widgets that either don't move axes, or move axes per-button/per-selection
 * rather than against one fixed list (jog/octopusJog: each button already shows its own axis's
 * homed state inline, DWC-style; preflight: has its own homed check over a caller-shaped machine
 * snapshot in model/gcode/preflight.ts, not this live one).
 */
export function fixedAxesFor(widget: Widget): Array<string> | null {
	switch (widget.type) {
		case "extruder":
			return ["E"];
		case "wcs":
		case "wcsTable":
			return widget.axes?.length ? widget.axes.map((a) => a.toUpperCase()) : ["X", "Y", "Z"];
		case "toolSelect":
		case "toolAlign":
		case "bedMesh":
		case "bedTram":
		case "xyzProbe":
		case "probeRoutines":
		case "probe":
		case "surfacing":
		case "toolpath":
			return ["X", "Y", "Z"];
		default:
			return null;
	}
}
