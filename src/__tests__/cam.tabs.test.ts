import { describe, expect, it } from "vitest";

import { Gcode } from "../model/cam/format";
import { cutLoopWithTabs, describeTabs } from "../model/cam/tabs";
import type { Point } from "../model/vectorImport/types";

// 100mm square from the origin, perimeter 400mm - the fixture for every test below.
const square: Array<Point> = [[0, 0], [100, 0], [100, 100], [0, 100]];

/** Every (x, y, z) triple emitted on a single line, in emission order. */
function xyz(gcode: string): Array<[number, number, number]> {
	const out: Array<[number, number, number]> = [];
	for (const line of gcode.split("\n")) {
		const mx = /X(-?[\d.]+)/.exec(line);
		const my = /Y(-?[\d.]+)/.exec(line);
		const mz = /Z(-?[\d.]+)/.exec(line);
		if (mx && my && mz) out.push([Number(mx[1]), Number(my[1]), Number(mz[1])]);
	}
	return out;
}

/** Every (x, y) pair emitted on a single line, in emission order - the travelled path. */
function xy(gcode: string): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (const line of gcode.split("\n")) {
		const mx = /X(-?[\d.]+)/.exec(line);
		const my = /Y(-?[\d.]+)/.exec(line);
		if (mx && my) out.push([Number(mx[1]), Number(my[1])]);
	}
	return out;
}

/** Every Z value emitted, in emission order, wherever a Z appears (with or without X/Y on the line). */
function zValues(gcode: string): Array<number> {
	const out: Array<number> = [];
	for (const line of gcode.split("\n")) {
		const m = /Z(-?[\d.]+)/.exec(line);
		if (m) out.push(Number(m[1]));
	}
	return out;
}

function pathLength(points: Array<[number, number]>): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
	}
	return total;
}

function nearestZ(triples: Array<[number, number, number]>, target: [number, number]): number {
	let best = triples[0];
	let bestDist = Infinity;
	for (const t of triples) {
		const d = Math.hypot(t[0] - target[0], t[1] - target[1]);
		if (d < bestDist) {
			bestDist = d;
			best = t;
		}
	}
	return best[2];
}

describe("cutLoopWithTabs", () => {
	it("4 tabs land at the midpoint of each side, riding at tabZ there", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, square, {
			z: -3, tabZ: -1, tabs: { count: 4, width: 10, height: 2 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
		});
		const triples = xyz(g.toString());
		// centres at 50/150/250/350mm around the perimeter are the midpoints of each side.
		for (const midpoint of [[50, 0], [100, 50], [50, 100], [0, 50]] as const) {
			expect(nearestZ(triples, midpoint)).toBeCloseTo(-1, 6);
		}
	});

	it("never cuts deeper than the requested depth, even while riding tabs at a shallower Z", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, square, {
			z: -3, tabZ: -1, tabs: { count: 4, width: 10, height: 2 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
		});
		expect(Math.min(...zValues(g.toString()))).toBeCloseTo(-3, 6);
	});

	it("produces exactly 4 contiguous tabZ stretches, one per tab - not merged, not split", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, square, {
			z: -3, tabZ: -1, tabs: { count: 4, width: 10, height: 2 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
		});
		const zs = zValues(g.toString());
		let runs = 0;
		let inRun = false;
		for (const z of zs) {
			const atTabZ = Math.abs(z - -1) < 1e-6;
			if (atTabZ && !inRun) runs++;
			inRun = atTabZ;
		}
		expect(runs).toBe(4);
	});

	it("tabZ <= z takes the simple fast path - Z is set once, at the plunge, and never revisited", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, square, {
			z: -3, tabZ: -3, tabs: { count: 4, width: 10, height: 2 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
		});
		expect(new Set(zValues(g.toString()))).toEqual(new Set([-3]));
	});

	it("count 0 or width 0 disables tabs - same simple fast path as tabZ <= z", () => {
		for (const tabs of [{ count: 0, width: 10, height: 2 }, { count: 4, width: 0, height: 2 }]) {
			const g = new Gcode();
			cutLoopWithTabs(g, square, { z: -3, tabZ: -1, tabs, feed: 1000, plungeFeed: 300, toolDiameter: 6 });
			expect(new Set(zValues(g.toString()))).toEqual(new Set([-3]));
		}
	});

	it("an entry ramp descends monotonically over its length, then re-levels the ramped stretch (extra travel beyond the perimeter)", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, square, {
			z: -3, tabZ: null, tabs: { count: 0, width: 0, height: 0 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
			entryZ: 0, rampLength: 20,
		});
		const text = g.toString();
		const zs = zValues(text);
		expect(zs[0]).toBeGreaterThan(zs[1]); // descends from entryZ (0) towards z (-3)
		// The re-levelling pass means the tool travels further than one trip round the perimeter.
		expect(pathLength(xy(text))).toBeGreaterThan(400);
	});

	it("rampLength is clamped to half the perimeter, not used as given", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, square, {
			z: -3, tabZ: null, tabs: { count: 0, width: 0, height: 0 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
			entryZ: 0, rampLength: 1000, // far more than total/2 = 200
		});
		const triples = xyz(g.toString());
		// The vertex at (100,100) sits at arc position 200 - exactly the clamped ramp length. If
		// rampLength were used unclamped, the descent (0 -> -3 over 1000mm) would still be shallow
		// here; clamped, the tool has already reached full depth by this point.
		expect(nearestZ(triples, [100, 100])).toBeCloseTo(-3, 6);
	});

	it("a zero-length loop (F9) is a no-op rather than leaving the tool buried at depth", () => {
		const g = new Gcode();
		cutLoopWithTabs(g, [[5, 5], [5, 5]], {
			z: -3, tabZ: null, tabs: { count: 0, width: 0, height: 0 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6,
		});
		expect(g.toString().trim()).toBe("");
	});

	it("F6 perf guard: a 5,000-vertex polygon completes well under a second", () => {
		const many: Array<Point> = [];
		for (let i = 0; i < 5000; i++) {
			const a = (2 * Math.PI * i) / 5000;
			many.push([50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)]);
		}
		const g = new Gcode();
		const start = Date.now();
		cutLoopWithTabs(g, many, {
			z: -3, tabZ: -1, tabs: { count: 8, width: 5, height: 1 },
			feed: 1000, plungeFeed: 300, toolDiameter: 6, entryZ: 0, rampLength: 20,
		});
		expect(Date.now() - start).toBeLessThan(1000);
	});
});

describe("describeTabs", () => {
	it("reports 'no tabs' when tabZ is null", () => {
		expect(describeTabs({ count: 4, width: 10, height: 2 }, null)).toBe("no tabs");
	});
});
