/**
 * Homed-before-motion check: given the live object model and the axis letters a widget's motion
 * depends on (see motionAxes.ts), report which of them aren't homed. Pure and defensive - reads
 * via resolveOmPath so a stub/incomplete machine model (tests, a disconnected page) never throws.
 */
import { resolveOmPath } from "./omPath";

interface RawAxis {
	letter?: string;
	homed?: boolean;
}

/** Axis letters (from `letters`) that are not currently homed, in the order given. */
export function unhomedAxes(model: unknown, letters: ReadonlyArray<string>): Array<string> {
	if (!letters.length) {
		return [];
	}
	const arr = resolveOmPath(model, "move.axes");
	const byLetter = new Map<string, RawAxis>();
	if (Array.isArray(arr)) {
		for (const a of arr as Array<RawAxis>) {
			if (a?.letter) {
				byLetter.set(a.letter.toUpperCase(), a);
			}
		}
	}
	// A missing/invalid move.axes (no object model yet, a disconnected page, a stub in tests) can't
	// vouch for anything being homed - every requested axis falls out as "unhomed" below, the same
	// conservative treatment as an individual axis the machine doesn't report.
	return letters
		.map((l) => l.toUpperCase())
		.filter((l) => {
			const axis = byLetter.get(l);
			// An axis this widget cares about that the machine doesn't even report is not something
			// this check can vouch for either - conservatively treat it the same as "not homed".
			return !axis || axis.homed !== true;
		});
}
