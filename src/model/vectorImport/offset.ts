/**
 * Cutter compensation: move each profile off the drawn line by the tool radius.
 *
 * This is the one part of the importer that is genuinely hard, and it is
 * delegated. A polygon offsetter has to cope with the offset self-intersecting
 * (an inside offset of a narrow slot collapses and must vanish, not fold back
 * on itself), with holes growing while their container shrinks, and with joins
 * at reflex corners. Getting any of those subtly wrong cuts a part to the wrong
 * size, which is the worst failure this application can have — so it runs on
 * Clipper, which has been the reference implementation of exactly this since
 * 2010, rather than on something written here.
 *
 * Clipper works in integers. Coordinates are scaled to micrometres, which is
 * two orders of magnitude finer than the machine can position and keeps a
 * 1500mm bed at 1.5 million — nowhere near the precision limit.
 *
 * MUST run after place() (geometry.ts), never before. `place()`'s own doc
 * comment states this from the other side: a flipped ring's winding survives
 * into a correct cut direction only because normalise()'s even-odd union
 * below re-derives outer/hole winding from geometric containment, discarding
 * whatever the input winding was — but that re-derivation is a one-time event
 * at the moment placement and offsetting meet. Offset first, place second
 * would offset an unflipped (drawing-space) ring, then mirror the *result* -
 * same size, same cut side, but every loop's travel direction inverts.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/import/offset.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: added the pipeline-order invariant note above (mirroring geometry.ts's `place`); stripped
 * the `.js` extension from the sibling import (this repo's typecheck step resolves with
 * moduleResolution: "node", which does not rewrite `.js` to `.ts`).
 */
import ClipperLib from "clipper-lib";

import { signedArea, type Point, type Polyline } from "./types";

/** Integer units per millimetre. */
const SCALE = 1000;

type IntPoint = { X: number; Y: number };

const toClipper = (points: Point[]): IntPoint[] =>
	points.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));

const fromClipper = (path: IntPoint[]): Point[] =>
	path.map((p): Point => [p.X / SCALE, p.Y / SCALE]);

export type CutSide = "inside" | "outside" | "on";

export interface OffsetOptions {
	side: CutSide;
	/** Tool diameter, mm. */
	toolDiameter: number;
	/**
	 * Extra stock left on the wall, mm. Positive leaves material for a finishing
	 * pass — which means it moves the cut *away* from the part on both sides.
	 */
	allowance: number;
	/** Chord tolerance for rounded joins, mm. */
	tolerance: number;
}

export interface OffsetResult {
	loops: Polyline[];
	warnings: string[];
}

/**
 * Normalise a set of rings so containment is expressed by winding.
 *
 * Union under the even-odd rule is what turns "a rectangle and a circle drawn
 * inside it" into "an outer ring anticlockwise and a hole clockwise". Offsetting
 * depends on that entirely: a single negative delta then shrinks the outer and
 * grows the hole, which is what an inside cut means, without anything here
 * having to work out which ring contains which.
 */
function normalise(loops: Point[][]): IntPoint[][] {
	const clipper = new ClipperLib.Clipper();
	clipper.AddPaths(loops.map(toClipper), ClipperLib.PolyType.ptSubject, true);
	const solution: IntPoint[][] = [];
	clipper.Execute(
		ClipperLib.ClipType.ctUnion,
		solution,
		ClipperLib.PolyFillType.pftEvenOdd,
		ClipperLib.PolyFillType.pftEvenOdd,
	);
	return solution;
}

export function offsetPaths(paths: Polyline[], opts: OffsetOptions): OffsetResult {
	const warnings: string[] = [];
	const closed = paths.filter((p) => p.closed && p.points.length >= 3);
	const open = paths.filter((p) => !p.closed || p.points.length < 3);

	if (opts.side === "on") {
		// No compensation: the tool centre follows the line. Open paths are fine
		// here and only here, which is why engraving is the only thing they can do.
		return { loops: paths.map((p) => ({ ...p, points: p.points.slice() })), warnings };
	}

	if (open.length) {
		warnings.push(
			`${open.length} open path(s) ignored — only a closed profile has an inside and an outside. Use "On the line" to cut them.`,
		);
	}
	if (!closed.length) {
		warnings.push("No closed profiles to offset.");
		return { loops: [], warnings };
	}

	const delta = (opts.toolDiameter / 2 + opts.allowance) * (opts.side === "outside" ? 1 : -1);
	const subject = normalise(closed.map((p) => p.points));

	const co = new ClipperLib.ClipperOffset(2, Math.max(1, opts.tolerance * SCALE));
	// Round joins: a miter on a sharp external corner projects a spike far beyond
	// the tool radius, and a real cutter cannot make one anyway — the corner it
	// leaves is an arc of its own radius. Round is what the machine will actually
	// do.
	co.AddPaths(subject, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	const solution: IntPoint[][] = [];
	co.Execute(solution, delta * SCALE);

	if (!solution.length) {
		warnings.push(
			opts.side === "inside"
				? "The tool is too large for every inside profile in this drawing — nothing is left to cut."
				: "Offsetting produced nothing.",
		);
		return { loops: [], warnings };
	}

	const before = subject.length;
	if (opts.side === "inside" && solution.length < before) {
		warnings.push(
			`${before - solution.length} profile(s) disappeared: the tool does not fit inside them.`,
		);
	}

	const loops = solution
		.map((path): Polyline => ({ points: fromClipper(path), closed: true }))
		.filter((p) => p.points.length >= 3 && Math.abs(signedArea(p.points)) > 1e-6);

	return { loops, warnings };
}

/**
 * Cut direction.
 *
 * Climb milling means each tooth enters the material at full chip thickness and
 * leaves at zero, which on a router is the better finish and the lower
 * deflection. Deriving the travel direction from that, once, because it is easy
 * to get backwards:
 *
 * A right-hand cutter turns clockwise seen from above. Feeding in +X, the tooth
 * on the tool's left side is moving +X with the feed, and the tooth on the right
 * is moving against it. Same direction as the feed is climb — so climb means the
 * material being cut is on the tool's LEFT.
 *
 * Material is on the left of an anticlockwise loop, since a positively wound
 * ring keeps its interior to the left. So: climb ⇒ travel anticlockwise around
 * whatever the material is inside of.
 *
 * That last clause is the part Clipper's winding alone cannot answer. Clipper
 * marks containment — outers anticlockwise, holes clockwise — not which side of
 * the path the part is. Cutting OUTSIDE a profile keeps the material inside the
 * loop, so the two coincide. Cutting INSIDE one is an aperture: the material
 * kept is outside the loop, and every direction inverts. Taking the winding as
 * the answer would climb-mill every outside cut correctly and conventional-mill
 * every inside one while claiming otherwise.
 *
 * 'on' has no side, so it is left exactly as drawn.
 */
export function orientForCut(loops: Polyline[], climb: boolean, side: CutSide): Polyline[] {
	if (side === "on") return loops;
	return loops.map((loop) => {
		const anticlockwise = signedArea(loop.points) > 0;
		const materialInside = side === "outside" ? anticlockwise : !anticlockwise;
		const wantAnticlockwise = climb === materialInside;
		return anticlockwise === wantAnticlockwise
			? loop
			: { ...loop, points: loop.points.slice().reverse() };
	});
}

/**
 * Sort loops so the machine works from the inside out.
 *
 * Cutting a hole after its container has already been freed means cutting a
 * part that is only held by tabs, so holes go first. Area descending would do
 * the opposite; ascending puts the smallest — the holes — at the front.
 */
export function orderForCut(loops: Polyline[]): Polyline[] {
	return loops
		.map((loop, i) => ({ loop, i, area: Math.abs(signedArea(loop.points)) }))
		.sort((a, b) => a.area - b.area || a.i - b.i)
		.map((x) => x.loop);
}
