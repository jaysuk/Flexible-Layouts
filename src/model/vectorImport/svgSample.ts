/**
 * Splits a flat run of path-length samples back into subpaths, and detects when a subpath's ends
 * meet.
 *
 * New module — no direct AxisControl equivalent, but the logic it replaces is real: sampling an SVG
 * `<path>` at a fixed step via `getPointAtLength` walks straight through subpath boundaries (`M`
 * commands), since path *length* only ever increases. A boundary shows up not as a length
 * discontinuity but as a spatial one — the sampled point jumps from the end of one subpath to the
 * start of the next while only `spacing` worth of length has elapsed. That jump is the only signal
 * this module has to work with.
 *
 * Compare *untransformed* points (the path's own local coordinates, sampled before any `<g
 * transform>`/CTM is applied) — `spacing` is chosen in that same untransformed space, so comparing
 * post-transform points would scale the jump distances without scaling `spacing` to match, silently
 * breaking the threshold for any scaled or skewed group.
 */
import type { Point } from "./types";

/**
 * Splits a flat sequence of consecutive path samples into subpaths. A gap strictly greater than
 * `spacing * 1.5` between consecutive samples marks a subpath boundary; `1.5x` is loose enough to
 * absorb a curve's normal step-length wobble while still catching a real jump. Runs of fewer than 2
 * points (a subpath sampled away to nothing) are dropped.
 */
export function splitRuns(samples: Array<Point>, spacing: number): Array<Array<Point>> {
	const runs: Array<Array<Point>> = [];
	let current: Array<Point> = [];
	let prev: Point | null = null;

	for (const p of samples) {
		if (prev) {
			const dist = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
			if (dist > spacing * 1.5) {
				if (current.length >= 2) runs.push(current);
				current = [];
			}
		}
		current.push(p);
		prev = p;
	}
	if (current.length >= 2) runs.push(current);
	return runs;
}

export interface ClosedRun {
	points: Array<Point>;
	closed: boolean;
}

/**
 * If a run's last sample landed back within `epsilon` of its first (an explicit `Z`, or a curve that
 * simply ends where it started), drops the duplicate closing point and reports it as closed.
 * Otherwise returns the run unchanged and open.
 */
export function closeIfMeeting(points: Array<Point>, epsilon: number): ClosedRun {
	if (points.length < 3) return { points, closed: false };
	const first = points[0];
	const last = points[points.length - 1];
	if (Math.hypot(last[0] - first[0], last[1] - first[1]) <= epsilon) {
		return { points: points.slice(0, -1), closed: true };
	}
	return { points, closed: false };
}
