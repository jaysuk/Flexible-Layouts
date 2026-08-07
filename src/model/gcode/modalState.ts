/**
 * Replay a G-code file's modal state up to a byte offset - deliberately geometry-free (no
 * arcs/vertices/bbox). Used by run-from-line (Phase 3) to reconstruct the preamble a resume needs:
 * it cares about the words parse.ts's geometry pass discards (M3/M4/M5, M7/M8/M9, T, WCS selects)
 * and none of the tessellation. Kept as its own module rather than folded into parse.ts so a
 * preamble rebuild never has to pay for (or risk drifting out of sync with) arc math it doesn't need.
 */
import { parseLines, wordValue, wordValues } from "./words";

export type SpindleDirection = "off" | "cw" | "ccw";

export interface ModalState {
	units: "mm" | "inch";
	plane: 17 | 18 | 19;
	absolute: boolean;
	/** Active WCS as a G-word (G54..G59.3); null if this file never selected one explicitly. */
	wcs: string | null;
	/** Last selected tool (T-word); null if never selected. */
	tool: number | null;
	spindleDirection: SpindleDirection;
	/** Commanded spindle speed while spindleDirection is not "off"; 0 once stopped. */
	spindleRpm: number;
	/** Current modal feed rate, mm/min (already unit-converted). 0 if never set. */
	feed: number;
	coolantMist: boolean;
	coolantFlood: boolean;
	/** Position at this point in the file, mm, same axis-composition rules as parse.ts. */
	x: number;
	y: number;
	z: number;
}

const WCS_BY_G: Record<string, string> = {
	"54": "G54", "55": "G55", "56": "G56", "57": "G57", "58": "G58", "59": "G59",
	"59.1": "G59.1", "59.2": "G59.2", "59.3": "G59.3",
};

/**
 * State as of "about to execute the line at `targetOffset`" - i.e. everything strictly before it,
 * not including it. That line hasn't run yet; a resume seeks to it and then executes it fresh.
 */
export function modalStateAt(text: string, targetOffset: number): ModalState {
	const state: ModalState = {
		units: "mm", plane: 17, absolute: true, wcs: null, tool: null,
		spindleDirection: "off", spindleRpm: 0, feed: 0,
		coolantMist: false, coolantFlood: false, x: 0, y: 0, z: 0,
	};

	for (const { offset, words } of parseLines(text)) {
		if (offset >= targetOffset) { break; }
		if (words.length === 0) { continue; }

		for (const g of wordValues(words, "G")) {
			if (g === 20) { state.units = "inch"; }
			else if (g === 21) { state.units = "mm"; }
			else if (g === 90) { state.absolute = true; }
			else if (g === 91) { state.absolute = false; }
			else if (g === 17) { state.plane = 17; }
			else if (g === 18) { state.plane = 18; }
			else if (g === 19) { state.plane = 19; }
			else {
				const wcs = WCS_BY_G[String(g)];
				if (wcs) { state.wcs = wcs; }
			}
		}

		for (const m of wordValues(words, "M")) {
			if (m === 3) { state.spindleDirection = "cw"; }
			else if (m === 4) { state.spindleDirection = "ccw"; }
			else if (m === 5) { state.spindleDirection = "off"; state.spindleRpm = 0; }
			else if (m === 7) { state.coolantMist = true; }
			else if (m === 8) { state.coolantFlood = true; }
			else if (m === 9) { state.coolantMist = false; state.coolantFlood = false; }
		}
		if (state.spindleDirection !== "off") {
			const s = wordValue(words, "S");
			if (s !== undefined) { state.spindleRpm = s; }
		}

		const tWord = words.find((w) => w.letter === "T" && w.value >= 0);
		if (tWord) { state.tool = tWord.value; }

		const unitScale = state.units === "inch" ? 25.4 : 1;
		const fWord = wordValue(words, "F");
		if (fWord !== undefined) { state.feed = fWord * unitScale; }

		const wx = wordValue(words, "X"), wy = wordValue(words, "Y"), wz = wordValue(words, "Z");
		if (wx !== undefined) { state.x = state.absolute ? wx * unitScale : state.x + wx * unitScale; }
		if (wy !== undefined) { state.y = state.absolute ? wy * unitScale : state.y + wy * unitScale; }
		if (wz !== undefined) { state.z = state.absolute ? wz * unitScale : state.z + wz * unitScale; }
	}
	return state;
}
