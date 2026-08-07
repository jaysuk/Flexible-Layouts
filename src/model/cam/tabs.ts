/**
 * Holding tabs on a cut-out contour.
 *
 * A part cut all the way through comes loose on the last pass and the tool
 * throws it. Tabs are short bridges of material left under the cutter so the
 * part stays put until it is knifed out by hand.
 *
 * The machinery here is deliberately about a closed polyline rather than about
 * rectangles, so the same code serves a rectangular cut-out and a circle
 * approximated as a fine polygon. Everything is parameterised by arc length
 * along the loop, which is what makes "six tabs, evenly spaced" mean the same
 * thing on both.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/cam/tabs.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: F6 - `pointAt` rescanned from index 0 on every call, inside a per-vertex loop -
 * O(n^2) per loop per depth pass, and `build()` re-runs on every parameter change. Replaced with a
 * cursor that only advances forward (or, on the rare backward jump for the re-levelling pass after
 * an entry ramp, does a single cheap reset) - O(n) total per loop instead. F9 - `cutLoopWithTabs` on
 * a zero-length loop used to emit a rapid + plunge and then no motion, leaving the tool buried at
 * depth; now returns immediately. Corrected the "entry ramps and tabs never collide" comment on
 * `cutLoopWithTabs`, which is false (a single tab on a loop short enough puts its half-spacing
 * inside the ramp) though the resulting depth is still safe - see the corrected comment below.
 * `Point` now imports from `../vectorImport/types` instead of being re-declared locally, so this repo
 * doesn't end up with two same-named, differently-sourced `Point` types. Omitted `circlePolygon` -
 * unused by anything in this port's v1 (profile-cutting) scope; it exists upstream to turn a circular
 * cut-out into a polygon for tabbing, which is out of scope here.
 */
import { Gcode, n } from "./format";
import type { Point } from "../vectorImport/types";

export interface TabSpec {
	/** Number of tabs spaced evenly around the loop. 0 disables tabs entirely. */
	count: number;
	/** Flat length of each tab along the path, mm. */
	width: number;
	/** Material left under the tool at the tab, mm. */
	height: number;
}

/** Cumulative arc length at each vertex, plus the closing edge. */
function arcLengths(pts: Point[]): { at: number[]; total: number } {
	const at = [0];
	let total = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		total += Math.hypot(b[0] - a[0], b[1] - a[1]);
		at.push(total);
	}
	return { at, total };
}

/**
 * A stateful point-at-arc-length sampler. Callers within a single loop walk `s` mostly forwards, so
 * the cursor only advances rather than rescanning from 0 each time (F6) - except when `s` goes
 * backwards (the re-levelling pass in `cutLoopWithTabs`), which resets once and is cheap because it
 * happens O(1) times per loop, not once per vertex.
 */
function makePointCursor(pts: Point[], at: number[], total: number): (s: number) => Point {
	let i = 0;
	return (s: number): Point => {
		const t = ((s % total) + total) % total;
		if (i > 0 && at[i] > t) i = 0;
		while (i < pts.length - 1 && at[i + 1] < t) i++;
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		const segment = at[i + 1] - at[i];
		const f = segment <= 1e-9 ? 0 : (t - at[i]) / segment;
		return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
	};
}

/** Shortest distance from `s` to `centre` going either way round the loop. */
function circularDistance(s: number, centre: number, total: number): number {
	const d = (((s - centre) % total) + total) % total;
	return Math.min(d, total - d);
}

export interface LoopCutOptions {
	/** Full depth for this pass. */
	z: number;
	/** Z to ride at across a tab, or null for no tabs. */
	tabZ: number | null;
	tabs: TabSpec;
	feed: number;
	plungeFeed: number;
	toolDiameter: number;
	/**
	 * Height the descent starts from — the level above, or the stock top. With
	 * `rampLength` this is the top of the ramp.
	 */
	entryZ?: number;
	/**
	 * Descend over this many mm of travel along the loop instead of plunging
	 * straight down. A profile cut enters buried in material on every pass after
	 * the first, and a flat end mill driven vertically into that at plunge feed
	 * is how end mills die. 0 keeps the plunge, for a centre-cutting tool.
	 */
	rampLength?: number;
}

/**
 * Cut one closed loop at depth `z`, lifting to `tabZ` across each tab.
 *
 * The loop is emitted as moves between "marks": every vertex, plus the four
 * boundaries of every tab (ramp start, flat start, flat end, ramp end). Because
 * Z is linear in arc length between consecutive marks, emitting the exact Z at
 * each mark and letting the controller interpolate gives ramps in and out of
 * the tab for free — no sampling, no stepped approximation.
 *
 * The tab ramp is what stops the tool from being asked to climb vertically out
 * of the cut at feed rate. It is one tool diameter long, or half the tab if the
 * tab is narrower than that.
 *
 * An entry ramp, when asked for, rides the same machinery: the first
 * `rampLength` of the walk interpolates from `entryZ` down to the depth that
 * position calls for, and the loop then continues past its start to level that
 * stretch off. A tab can still fall inside the entry ramp's span (a single tab
 * on a short loop puts its half-spacing well within a half-loop-long ramp) —
 * that's fine, not a collision: the depth at any arc position is always
 * whichever of the ramp and the tab asks to be shallower (`zAt`/`zEntry` below
 * both fold the tab in, so the re-levelling pass still honours it correctly).
 */
export function cutLoopWithTabs(g: Gcode, pts: Point[], o: LoopCutOptions): void {
	const { z, tabZ, tabs, feed, plungeFeed, toolDiameter } = o;
	const { at, total } = arcLengths(pts);
	if (!(total > 0)) return;
	const useTabs = tabZ !== null && tabs.count > 0 && tabs.width > 0 && tabZ > z + 1e-6;
	const entryZ = o.entryZ ?? z;
	const ramp = Math.min(Math.max(0, o.rampLength ?? 0), total / 2);
	const descending = ramp > 0 && entryZ > z + 1e-6;

	if (!useTabs && !descending) {
		g.rapid({ x: pts[0][0], y: pts[0][1] });
		g.feed({ z, f: plungeFeed });
		for (let i = 1; i <= pts.length; i++) {
			const p = pts[i % pts.length];
			g.feed({ x: p[0], y: p[1], f: feed });
		}
		return;
	}

	const half = Math.min(tabs.width, total / Math.max(1, tabs.count) / 2) / 2;
	const tabRamp = Math.min(Math.max(toolDiameter, 0.5), half * 2);
	// Half a spacing in, not on the seam: on a rectangle that lands one tab in
	// the middle of each side instead of straddling the corners, and it keeps the
	// entry plunge off a tab, where it would only reach tab depth.
	const centres = Array.from({ length: tabs.count }, (_, i) => (total * (i + 0.5)) / tabs.count);

	/** Depth at arc position `s`, ignoring the entry ramp. */
	const zAt = (s: number): number => {
		let best = z;
		if (!useTabs) return best;
		for (const c of centres) {
			const d = circularDistance(s, c, total);
			if (d <= half) best = Math.max(best, tabZ!);
			else if (d <= half + tabRamp) {
				const f = 1 - (d - half) / tabRamp;
				best = Math.max(best, z + (tabZ! - z) * f);
			}
		}
		return best;
	};

	/** Depth including the entry ramp, which only affects the first pass round. */
	const zEntry = (s: number): number =>
		descending && s < ramp ? entryZ + (zAt(s) - entryZ) * (s / ramp) : zAt(s);

	const marks = new Set<number>(at.map((v) => Math.min(v, total)));
	if (useTabs) {
		for (const c of centres) {
			for (const offset of [-half - tabRamp, -half, half, half + tabRamp]) {
				marks.add((((c + offset) % total) + total) % total);
			}
		}
	}
	if (descending) marks.add(ramp);
	const ordered = [...marks]
		.sort((a, b) => a - b)
		.filter((s, i, arr) => i === 0 || s - arr[i - 1] > 1e-6);

	const pointAt = makePointCursor(pts, at, total);
	const start = pointAt(0);
	g.rapid({ x: start[0], y: start[1] });
	g.feed({ z: zEntry(0), f: plungeFeed });

	const stops = ordered.filter((v) => v > 1e-6);
	if (stops[stops.length - 1] < total - 1e-6) stops.push(total);
	for (const s of stops) {
		const p = pointAt(s);
		g.feed({ x: p[0], y: p[1], z: zEntry(s >= total - 1e-6 ? 0 : s), f: feed });
	}

	// The stretch we ramped down over is still high. Go round it once more at the
	// depth it should have been, so the pass closes at a uniform height.
	if (descending) {
		for (const s of [...stops.filter((v) => v < ramp - 1e-6), ramp]) {
			const p = pointAt(s);
			g.feed({ x: p[0], y: p[1], z: zAt(s), f: feed });
		}
	}
}

/**
 * Human-readable note about what the tabs will leave behind.
 *
 * Takes the resolved `tabZ` rather than recomputing it, so a tab spec that was
 * rejected as impossible cannot still be described as if it were going to
 * happen.
 */
export function describeTabs(tabs: TabSpec, tabZ: number | null): string {
	if (tabZ === null) return "no tabs";
	return `${tabs.count} tabs, ${n(tabs.width)}mm wide, leaving ${n(tabs.height)}mm at Z${n(tabZ)}`;
}
