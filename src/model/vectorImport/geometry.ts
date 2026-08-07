/**
 * Geometry cleanup between importing and cutting.
 *
 * Both file formats produce the same two problems. They emit far more points
 * than the cut needs (a browser-sampled bezier, a 720-segment DXF spline), and
 * they emit a closed shape as a scatter of separate segments in no particular
 * order — a DXF rectangle is four LINE entities, and nothing in the file says
 * they form a loop.
 *
 * Fixing both here means the offsetting stage can assume clean rings, and the
 * importers stay dumb readers of their own formats.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/import/geometry.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: dropped `dedupe`/`orient` (unused by anything in this port's v1 scope - both were only
 * reachable from AxisControl's pocketing/drilling operations, out of scope here); added the
 * pipeline-order invariant note on `place` and the uniform-scale note on `Placement`.
 */
import type { Point, Polyline } from "./types";

/** Squared distance, for comparisons that never need the square root. */
function dist2(a: Point, b: Point): number {
	const dx = a[0] - b[0];
	const dy = a[1] - b[1];
	return dx * dx + dy * dy;
}

/**
 * Ramer–Douglas–Peucker: drop points that sit within `tolerance` of the chord
 * they lie on.
 *
 * Iterative rather than recursive on purpose. A 200 000-point path out of a
 * densely sampled SVG would blow the stack, and that is exactly the kind of file
 * someone drops in without thinking about it.
 */
export function simplify(points: Array<Point>, tolerance: number): Array<Point> {
	if (points.length < 3 || tolerance <= 0) return points.slice();
	const tol2 = tolerance * tolerance;
	const keep = new Uint8Array(points.length);
	keep[0] = 1;
	keep[points.length - 1] = 1;

	const stack: Array<[number, number]> = [[0, points.length - 1]];
	while (stack.length) {
		const [first, last] = stack.pop()!;
		if (last <= first + 1) continue;

		const a = points[first];
		const b = points[last];
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const len2 = dx * dx + dy * dy;

		let worst = -1;
		let worstIndex = -1;
		for (let i = first + 1; i < last; i++) {
			const p = points[i];
			let d2: number;
			if (len2 === 0) {
				d2 = dist2(p, a);
			} else {
				// Perpendicular distance to the segment, clamped to its ends.
				let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
				t = t < 0 ? 0 : t > 1 ? 1 : t;
				const px = a[0] + t * dx - p[0];
				const py = a[1] + t * dy - p[1];
				d2 = px * px + py * py;
			}
			if (d2 > worst) {
				worst = d2;
				worstIndex = i;
			}
		}

		if (worst > tol2) {
			keep[worstIndex] = 1;
			stack.push([first, worstIndex], [worstIndex, last]);
		}
	}

	const out: Array<Point> = [];
	for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
	return out;
}

/**
 * Join open segments whose ends coincide into longer paths, and mark the ones
 * that come back to their start as closed.
 *
 * A hash grid keyed on the snapped endpoint keeps this near-linear; the naive
 * pairwise version is O(n²) and a 20 000-segment DXF makes that visible.
 */
export function chain(paths: Array<Polyline>, tolerance: number): Array<Polyline> {
	const open: Array<Polyline> = [];
	const done: Array<Polyline> = [];
	for (const p of paths) {
		if (p.closed || p.points.length < 2) done.push(p);
		else open.push({ ...p, points: p.points.slice() });
	}
	if (!open.length) return done;

	const key = (p: Point) =>
		`${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)}`;

	// Endpoint index: cell key → segment indices whose start or end lands there.
	const ends = new Map<string, Array<number>>();
	const add = (k: string, i: number) => {
		const list = ends.get(k);
		if (list) list.push(i);
		else ends.set(k, [i]);
	};
	// Neighbouring cells too, so a pair straddling a cell boundary still meets.
	const cellsAround = (p: Point): Array<string> => {
		const cx = Math.round(p[0] / tolerance);
		const cy = Math.round(p[1] / tolerance);
		const out: Array<string> = [];
		for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(`${cx + dx},${cy + dy}`);
		return out;
	};

	open.forEach((seg, i) => {
		add(key(seg.points[0]), i);
		add(key(seg.points[seg.points.length - 1]), i);
	});

	const used = new Uint8Array(open.length);
	const tol2 = tolerance * tolerance;

	for (let i = 0; i < open.length; i++) {
		if (used[i]) continue;
		used[i] = 1;
		const points = open[i].points.slice();
		const layer = open[i].layer;

		// Grow from the tail, then from the head, until nothing else connects.
		for (const atTail of [true, false]) {
			for (;;) {
				const tip = atTail ? points[points.length - 1] : points[0];
				let found = -1;
				let reversed = false;
				for (const cell of cellsAround(tip)) {
					for (const j of ends.get(cell) ?? []) {
						if (used[j]) continue;
						const other = open[j].points;
						if (dist2(tip, other[0]) <= tol2) {
							found = j;
							reversed = false;
							break;
						}
						if (dist2(tip, other[other.length - 1]) <= tol2) {
							found = j;
							reversed = true;
							break;
						}
					}
					if (found >= 0) break;
				}
				if (found < 0) break;

				used[found] = 1;
				const seg = reversed ? open[found].points.slice().reverse() : open[found].points.slice();
				// Drop the shared endpoint rather than emitting it twice.
				if (atTail) points.push(...seg.slice(1));
				else points.unshift(...seg.slice(0, -1).reverse());
			}
		}

		const closed = points.length > 2 && dist2(points[0], points[points.length - 1]) <= tol2;
		if (closed) points.pop();
		done.push({ points, closed, layer });
	}

	return done;
}

export interface Placement {
	/** Millimetres per source unit. Applied uniformly to both axes - there is no separate X/Y scale.
	 *  If a future UI ever offers one, the cutter-radius offset downstream (offset.ts) is isotropic
	 *  and would need reworking too, since it assumes a single scale factor throughout. */
	scale: number;
	/** Mirror Y. SVG's Y grows downward and a CNC's grows up, so SVG needs this. */
	flipY: boolean;
	/** Added after scaling, in mm. */
	offsetX: number;
	offsetY: number;
}

/**
 * Scales/mirrors/offsets a drawing into work coordinates.
 *
 * MUST run before offsetPaths() (offset.ts), never after. offsetPaths()'s cutter-compensation
 * direction is only correct because a flipped ring's winding is re-derived (not just inherited) by
 * Clipper's even-odd union - but only once, at the point placement and offsetting meet. Memoising an
 * offset computed in drawing space and applying `place()` afterwards would mirror an
 * already-oriented toolpath: same size, same cut side, but every loop's travel direction inverts -
 * climb silently becomes conventional. See offset.ts's own note on `offsetPaths`.
 */
export function place(paths: Array<Polyline>, p: Placement): Array<Polyline> {
	const sy = p.flipY ? -p.scale : p.scale;
	return paths.map((path) => ({
		...path,
		points: path.points.map(([x, y]): Point => [x * p.scale + p.offsetX, y * sy + p.offsetY]),
	}));
}
