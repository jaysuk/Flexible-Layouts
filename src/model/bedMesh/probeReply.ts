/**
 * Turns a probe result into a height-map cell value. Pure and isolated in its own module - this is
 * the one arithmetic mistake that silently corrupts a bed mesh, so it gets its own tests and nothing
 * else shares the file.
 *
 * `G30 S-1` (a standalone report-only probe, no mesh/tool side effects) replies with RRF's raw
 * console text `Stopped at height <n> mm` (`GCodes4.cpp`, the "just print the stop height" branch),
 * where `<n>` is RAW machine Z at the point of triggering - it is NOT the map value. RRF's own grid
 * probing computes the map value as `stoppedHeight - triggerHeight`
 * (`g30zHeightError = g30zStoppedHeight - zp->GetActiveModeTriggerHeight()`, `GCodes4.cpp`), and a
 * standalone G30 computes the identical expression - so re-probing a single cell must apply the same
 * subtraction to reproduce exactly what a full mesh probe would have written for that cell.
 *
 * Storing the raw stop height as the map value bakes the whole trigger height (commonly ~10-15mm for
 * an inductive/BLTouch probe) into every re-probed cell - a real bug in an early version of a similar
 * feature elsewhere, independently confirming this is worth guarding with its own test.
 */

const STOPPED_AT_HEIGHT_RE = /Stopped at height\s+(-?\d+(?:\.\d+)?)\s*mm/i;

/**
 * Parse RRF's `Stopped at height <n> mm` console reply. Returns null (not a fabricated 0) for
 * anything that isn't that exact reply - including a probe's error reply on a failed trigger - so a
 * caller can tell "no result" apart from "triggered at 0.000".
 */
export function parseProbeReply(reply: string): { stopHeight: number } | null {
	if (typeof reply !== "string") {
		return null;
	}
	const match = STOPPED_AT_HEIGHT_RE.exec(reply);
	if (!match) {
		return null;
	}
	const stopHeight = Number(match[1]);
	return Number.isNaN(stopHeight) ? null : { stopHeight };
}

/** The height-map cell value for a probe result: raw stop height minus the probe's trigger height. */
export function heightmapValue(stopHeight: number, triggerHeight: number): number {
	return stopHeight - triggerHeight;
}
