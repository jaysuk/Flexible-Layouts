/**
 * "Lock while printing" support: stop a panel/widget from being interacted with during a print so the
 * machine can't be moved unexpectedly (homing, tool change, jog, …). Per-widget and per-page, with a
 * sensible default per widget type — on for things that move/retract/change tools, off for safe
 * controls like pause/resume.
 */
import type { Widget } from "./../model/document";
import { movesAxes } from "./motionAxes";

/** Machine statuses that count as an active print session (mirrors DWC's isPrinting, incl. paused). */
export const PRINTING_STATUSES = new Set([
	"pausing", "paused", "cancelling", "resuming", "processing", "simulating",
]);

export function isPrintingStatus(status?: string): boolean {
	return !!status && PRINTING_STATUSES.has(status);
}

/** Built-in DWC panels that drive motion / tool selection (so they default to locked while printing). */
const MOVE_PANELS = new Set(["MovementPanel"]);

// G/M-code that could move the printer or swap tools unexpectedly mid-print. Pause/resume/stop/ack
// codes are deliberately excluded so a "pause print" button stays usable.
const MOTION_CODE = /\b(G0|G1|G2|G3|G28|G29|G30|G32)\b/i;
const TOOL_CHANGE = /(^|[\s;\n])T-?\d/i;

function codeMoves(code?: string): boolean {
	if (!code) {
		return false;
	}
	return MOTION_CODE.test(code) || TOOL_CHANGE.test(code);
}

/**
 * Whether a widget should be locked during a print by default. True for widgets that cause motion /
 * extrusion / tool changes; for a command button it's inferred from its G-code (homing, moves, tool
 * change → locked; pause/resume/etc. → not).
 */
export function defaultLockForWidget(widget: Widget): boolean {
	// motionAxes.ts is the single source of truth for "does this widget type send axis motion" -
	// covers jog/octopusJog/probe/surfacing/toolpath too, closing gaps this switch used to have.
	if (movesAxes(widget)) {
		return true;
	}
	switch (widget.type) {
		// Turns the spindle on/off unexpectedly mid-print - not an axis move, but unsafe anyway.
		case "spindle":
			return true;
		case "builtinPanel":
			return MOVE_PANELS.has(widget.component);
		case "codeButton":
			// Only g-code actions can move the machine; url/http actions never do.
			return (widget.action ?? "gcode") === "gcode" && codeMoves(widget.code);
		default:
			return false;
	}
}

/** Effective lock for an item: explicit per-item choice wins, else the per-type default. */
export function effectiveLockForItem(widget: Widget, explicit?: boolean): boolean {
	return explicit ?? defaultLockForWidget(widget);
}
