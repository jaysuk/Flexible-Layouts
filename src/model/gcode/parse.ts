/**
 * Pure G-code geometry parser - no Vue/DWC imports, so it can run identically on the main thread,
 * inside a Vitest run, or inside the Web Worker built by scripts/build-gcode-worker.mjs
 * (parseWorker.ts is a thin postMessage wrapper around parseGcode() below).
 *
 * Scope: G0/G1 straight moves, G2/G3 arcs (I/J/K or R form, in any of the G17/G18/G19 planes,
 * including a helical linear-axis component), G20/G21 units, G90/G91 distance mode, G90.1/G91.1 arc
 * IJK distance mode, and motion-mode persistence (a line with only axis words continues whichever of
 * G0/G1/G2/G3 was last commanded - a very common CAM-post pattern). Canned cycles, cutter comp and
 * everything else are simply ignored: their words don't match any letter this parser tracks.
 */
import { parseLines, wordValue, wordValues } from "./words";

export type MoveKind = "rapid" | "cut";

export interface ParsedVertex {
	x: number;
	y: number;
	z: number;
	kind: MoveKind;
	/** Byte offset of the source line that produced this vertex - see parseLines' doc comment. */
	offset: number;
}

export interface ParseResult {
	vertices: Array<ParsedVertex>;
	min: { x: number; y: number; z: number };
	max: { x: number; y: number; z: number };
	/** Distinct tool numbers selected (T-words), in first-seen order. */
	tools: Array<number>;
	/** Distinct spindle speeds commanded (M3/M4 S-words), in first-seen order. */
	spindleSpeeds: Array<number>;
	/** Highest F-word seen on a cutting move (mm/min). 0 if none. */
	maxFeed: number;
	/** Total time of all G1/G2/G3 moves that had a known feed rate (seconds). */
	cutSeconds: number;
	/** Total length of all G0 moves (mm) - deliberately untimed; how fast a rapid runs is a property
	 *  of the machine, not the file. Callers add rapidLength / rapidRate themselves. */
	rapidLength: number;
	/** Lowest Z reached by a rapid that also moves in X or Y; null if no such rapid exists. A
	 *  vertical-only retract doesn't count. */
	minRapidZ: number | null;
	warnings: Array<string>;
}

const MM_PER_INCH = 25.4;
// Tessellate arcs to this angular resolution - fine enough for bbox/length/preview accuracy without
// an excessive vertex count on large-radius arcs.
const ARC_STEP_RAD = (2 * Math.PI) / 180; // 2 degrees
const MAX_ARC_SEGMENTS = 720;

interface Vec3 { x: number; y: number; z: number; }
type AxisKey = "x" | "y" | "z";

function planeAxes(plane: 17 | 18 | 19): { u: AxisKey; v: AxisKey; w: AxisKey; uWord: string; vWord: string } {
	switch (plane) {
		case 18: return { u: "x", v: "z", w: "y", uWord: "I", vWord: "K" };
		case 19: return { u: "y", v: "z", w: "x", uWord: "J", vWord: "K" };
		default: return { u: "x", v: "y", w: "z", uWord: "I", vWord: "J" };
	}
}

// Standard grbl/NIST-RS274NGC center-from-radius construction: given the start->end chord in-plane
// and a signed radius (negative R means "take the long way around"), returns the offset from start
// to the arc's center.
function centerOffsetFromRadius(dx: number, dy: number, r: number, clockwise: boolean): { ox: number; oy: number } {
	const dist = Math.hypot(dx, dy);
	let h2 = 4 * r * r - dx * dx - dy * dy;
	if (h2 < 0) { h2 = 0; }
	let hDiv = dist === 0 ? 0 : -Math.sqrt(h2) / dist;
	// R positive selects the minor (<=180 deg) arc, R negative the major one (NIST RS274NGC
	// convention) - verified numerically against a known 60 deg case, not just recalled from memory.
	if (clockwise === r < 0) { hDiv = -hDiv; }
	return { ox: 0.5 * (dx - dy * hDiv), oy: 0.5 * (dy + dx * hDiv) };
}

export function parseGcode(text: string): ParseResult {
	const lines = parseLines(text);

	let units = 1; // 1 = mm, MM_PER_INCH = inch
	let absolute = true; // G90/G91
	let arcAbsolute = false; // G90.1/G91.1 - RRF default is I/J/K relative to the arc's own start
	let plane: 17 | 18 | 19 = 17;
	let feed = 0; // mm/min, current modal feed (already unit-converted)
	let motionMode: 0 | 1 | 2 | 3 | null = null;
	let pos: Vec3 = { x: 0, y: 0, z: 0 };

	const vertices: Array<ParsedVertex> = [{ x: 0, y: 0, z: 0, kind: "rapid", offset: 0 }];
	const min: Vec3 = { x: 0, y: 0, z: 0 };
	const max: Vec3 = { x: 0, y: 0, z: 0 };
	const toolSeen = new Set<number>();
	const tools: Array<number> = [];
	const spindleSeen = new Set<number>();
	const spindleSpeeds: Array<number> = [];
	let maxFeed = 0;
	let cutSeconds = 0;
	let rapidLength = 0;
	let minRapidZ: number | null = null;
	const warnings: Array<string> = [];
	let warnedNoFeed = false;

	function extend(p: Vec3): void {
		min.x = Math.min(min.x, p.x); max.x = Math.max(max.x, p.x);
		min.y = Math.min(min.y, p.y); max.y = Math.max(max.y, p.y);
		min.z = Math.min(min.z, p.z); max.z = Math.max(max.z, p.z);
	}
	extend(pos);

	function accrueCutTime(dist: number): void {
		if (feed > 0) {
			cutSeconds += (dist / feed) * 60;
			maxFeed = Math.max(maxFeed, feed);
		} else if (!warnedNoFeed) {
			warnings.push("Some cutting moves specify no feed rate; those durations are excluded from the estimate.");
			warnedNoFeed = true;
		}
	}

	for (const line of lines) {
		const { words, offset } = line;
		if (words.length === 0) { continue; }

		for (const g of wordValues(words, "G")) {
			if (g === 20) { units = MM_PER_INCH; }
			else if (g === 21) { units = 1; }
			else if (g === 90) { absolute = true; }
			else if (g === 91) { absolute = false; }
			else if (g === 90.1) { arcAbsolute = true; }
			else if (g === 91.1) { arcAbsolute = false; }
			else if (g === 17) { plane = 17; }
			else if (g === 18) { plane = 18; }
			else if (g === 19) { plane = 19; }
			else if (g === 0 || g === 1 || g === 2 || g === 3) { motionMode = g; }
		}

		const fWord = wordValue(words, "F");
		if (fWord !== undefined) { feed = fWord * units; }

		for (const m of wordValues(words, "M")) {
			if (m === 3 || m === 4) {
				const s = wordValue(words, "S");
				if (s !== undefined && s > 0 && !spindleSeen.has(s)) { spindleSeen.add(s); spindleSpeeds.push(s); }
			}
		}
		const tWord = words.find((w) => w.letter === "T" && w.value >= 0);
		if (tWord && !toolSeen.has(tWord.value)) { toolSeen.add(tWord.value); tools.push(tWord.value); }

		// A move-relevant word (axis or arc-offset/radius) is what turns "motion mode is active" into
		// "this line is actually a move" - a bare "G90" or "M3 S10000" line must not emit a vertex.
		const hasMoveWord = words.some((w) => "XYZIJKR".includes(w.letter));
		if (motionMode === null || !hasMoveWord) { continue; }

		const wx = wordValue(words, "X"), wy = wordValue(words, "Y"), wz = wordValue(words, "Z");
		const target: Vec3 = {
			x: wx === undefined ? pos.x : absolute ? wx * units : pos.x + wx * units,
			y: wy === undefined ? pos.y : absolute ? wy * units : pos.y + wy * units,
			z: wz === undefined ? pos.z : absolute ? wz * units : pos.z + wz * units,
		};

		if (motionMode === 0) {
			const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
			const len = Math.hypot(dx, dy, dz);
			if (len > 0) {
				rapidLength += len;
				if (dx !== 0 || dy !== 0) {
					const zHere = Math.min(pos.z, target.z);
					minRapidZ = minRapidZ === null ? zHere : Math.min(minRapidZ, zHere);
				}
				vertices.push({ x: target.x, y: target.y, z: target.z, kind: "rapid", offset });
				extend(target);
			}
			pos = target;
			continue;
		}

		if (motionMode === 1) {
			const dist = Math.hypot(target.x - pos.x, target.y - pos.y, target.z - pos.z);
			if (dist > 0) {
				accrueCutTime(dist);
				vertices.push({ x: target.x, y: target.y, z: target.z, kind: "cut", offset });
				extend(target);
			}
			pos = target;
			continue;
		}

		// G2 (clockwise) / G3 (counter-clockwise) arc.
		const clockwise = motionMode === 2;
		const { u, v, w, uWord, vWord } = planeAxes(plane);
		const su = pos[u], sv = pos[v], sw = pos[w];
		const eu = target[u], ev = target[v];

		const rWord = wordValue(words, "R");
		let cu: number, cv: number;
		if (rWord !== undefined) {
			const off = centerOffsetFromRadius(eu - su, ev - sv, rWord * units, clockwise);
			cu = su + off.ox; cv = sv + off.oy;
		} else {
			const iWord = wordValue(words, uWord), jWord = wordValue(words, vWord);
			const iVal = (iWord ?? 0) * units, jVal = (jWord ?? 0) * units;
			cu = arcAbsolute ? iVal : su + iVal;
			cv = arcAbsolute ? jVal : sv + jVal;
		}

		const radius = Math.hypot(su - cu, sv - cv);
		const startAngle = Math.atan2(sv - cv, su - cu);
		const endAngle = Math.atan2(ev - cv, eu - cu);
		const isFullCircle = rWord === undefined && Math.abs(eu - su) < 1e-9 && Math.abs(ev - sv) < 1e-9;
		let sweep: number;
		if (isFullCircle) {
			sweep = clockwise ? -2 * Math.PI : 2 * Math.PI;
		} else {
			sweep = endAngle - startAngle;
			if (clockwise) { if (sweep >= 0) { sweep -= 2 * Math.PI; } }
			else { if (sweep <= 0) { sweep += 2 * Math.PI; } }
		}

		const segs = radius > 0 ? Math.min(MAX_ARC_SEGMENTS, Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP_RAD))) : 1;
		let prev: Vec3 = { ...pos };
		for (let i = 1; i <= segs; i++) {
			const t = i / segs;
			const angle = startAngle + sweep * t;
			const p: Vec3 = { x: 0, y: 0, z: 0 };
			p[u] = cu + radius * Math.cos(angle);
			p[v] = cv + radius * Math.sin(angle);
			p[w] = sw + (target[w] - sw) * t;
			const dist = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
			accrueCutTime(dist);
			vertices.push({ x: p.x, y: p.y, z: p.z, kind: "cut", offset });
			extend(p);
			prev = p;
		}
		pos = target;
	}

	return { vertices, min, max, tools, spindleSpeeds, maxFeed, cutSeconds, rapidLength, minRapidZ, warnings };
}
