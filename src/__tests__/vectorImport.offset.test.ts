import { describe, expect, it } from "vitest";

import { offsetPaths, orderForCut, orientForCut } from "../model/vectorImport/offset";
import { signedArea, type Polyline } from "../model/vectorImport/types";

function square(x0: number, y0: number, size: number, closed = true): Polyline {
	return {
		points: [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]],
		closed,
	};
}

// 100mm outer square with a 40mm square hole (30..70), used across the area-value tests below.
// Areas were verified empirically against real clipper-lib 6.4.2 - see each test's comment for the
// derivation (sharp corners on a shrinking offset, rounded corners costing r^2 - pi*r^2/4 per corner
// on a growing one).
const outer = square(0, 0, 100); // CCW, area +10000
const hole: Polyline = { points: [[30, 30], [30, 70], [70, 70], [70, 30]], closed: true }; // CW, area -1600

describe("offsetPaths", () => {
	it("side: on returns every input unchanged, including open paths, with no warnings", () => {
		const open: Polyline = { points: [[0, 0], [10, 0]], closed: false };
		const result = offsetPaths([outer, open], { side: "on", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		expect(result.warnings).toEqual([]);
		expect(result.loops).toHaveLength(2);
		expect(result.loops[0].points).toEqual(outer.points);
		expect(result.loops[1].points).toEqual(open.points);
	});

	it("side: inside shrinks the outer (sharp corners) and grows the hole (rounded corners)", () => {
		const result = offsetPaths([outer, hole], { side: "inside", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		expect(result.warnings).toEqual([]);
		const areas = result.loops.map((l) => Math.abs(signedArea(l.points))).sort((a, b) => a - b);
		// Hole grows to ~46mm (40 + 2*3mm tool radius). Growing a convex-from-the-hole's-own-side
		// corner rounds it, costing r^2 - pi*r^2/4 per corner (4 corners) off the sharp 46^2=2116.
		expect(areas[0]).toBeGreaterThan(2100);
		expect(areas[0]).toBeLessThan(2116);
		// Outer shrinks to exactly 94mm (100 - 2*3mm). Shrinking a convex corner never needs a round
		// join - it just recedes to a sharp point - so this is exact, not an approximation.
		expect(areas[1]).toBeCloseTo(8836, 0);
	});

	it("side: outside grows the outer (rounded corners) and shrinks the hole (sharp corners)", () => {
		const result = offsetPaths([outer, hole], { side: "outside", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		const areas = result.loops.map((l) => Math.abs(signedArea(l.points))).sort((a, b) => a - b);
		// Hole shrinks to exactly 34mm (40 - 2*3mm) - sharp corners, exact.
		expect(areas[0]).toBeCloseTo(1156, 0);
		// Outer grows to ~106mm (100 + 2*3mm), corners rounded - same r^2 - pi*r^2/4 * 4 loss as above.
		expect(areas[1]).toBeGreaterThan(11220);
		expect(areas[1]).toBeLessThan(11236);
	});

	it("F3 regression: both rings wound clockwise on input still produce a CCW outer after offsetting", () => {
		// normalise()'s even-odd union re-derives outer/hole winding from geometric containment, not
		// from whatever the importer (or a Y-flipped SVG) handed it - this is what makes place()'s
		// flipY safe to run before offsetPaths without inverting the cut direction. See offset.ts's
		// and geometry.ts's own notes on this.
		const cwOuter: Polyline = { points: [...outer.points].reverse(), closed: true };
		const cwHole: Polyline = { points: [...hole.points], closed: true }; // hole was already CW
		const result = offsetPaths([cwOuter, cwHole], { side: "inside", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		const byAbsArea = [...result.loops].sort(
			(a, b) => Math.abs(signedArea(b.points)) - Math.abs(signedArea(a.points)),
		);
		expect(signedArea(byAbsArea[0].points)).toBeGreaterThan(0); // the outer (larger) ring is CCW
	});

	it("a tool larger than the profile leaves nothing to cut", () => {
		const tiny = square(0, 0, 5);
		const result = offsetPaths([tiny], { side: "inside", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		expect(result.loops).toHaveLength(0);
		expect(result.warnings.some((w) => w.includes("too large"))).toBe(true);
	});

	it("when only some profiles are too small, the survivors are kept and the loss is counted", () => {
		const big = square(0, 0, 100);
		const tiny = square(200, 200, 5); // far away, so it stays its own separate ring
		const result = offsetPaths([big, tiny], { side: "inside", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		expect(result.loops).toHaveLength(1);
		expect(result.warnings.some((w) => w.includes("1") && w.includes("disappeared"))).toBe(true);
	});

	it("an open path is excluded from inside/outside offsetting, with a pointer to 'On the line'", () => {
		const open: Polyline = { points: [[0, 0], [10, 0]], closed: false };
		const result = offsetPaths([square(0, 0, 50), open], { side: "outside", toolDiameter: 6, allowance: 0, tolerance: 0.02 });
		expect(result.loops).toHaveLength(1);
		expect(result.warnings.some((w) => w.includes("On the line"))).toBe(true);
	});

	it("F8: two overlapping (not nested) profiles XOR under the even-odd rule - the shared corner is excluded from both", () => {
		// This matches even-odd rendering (the preview and the cut then agree) but is easy to mistake
		// for a bug. Do not "fix" it to pftNonZero - that would silently change what every
		// overlapping-geometry drawing cuts. toolDiameter 0 isolates normalise()'s even-odd union from
		// the tool-radius offset that would otherwise also reshape these areas.
		//
		// The two squares only touch at the overlap's opposite corners (a pinch point), so this comes
		// back as two separate L-shaped loops rather than one hull with a hole - each square minus the
		// shared 25x25 corner it gave up to the other, 2500 - 625 = 1875.
		const a = square(0, 0, 50); // area 2500
		const b = square(25, 25, 50); // area 2500, overlapping a in a 25x25 square
		const result = offsetPaths([a, b], { side: "outside", toolDiameter: 0, allowance: 0, tolerance: 0.02 });
		expect(result.loops).toHaveLength(2);
		const areas = result.loops.map((l) => Math.abs(signedArea(l.points)));
		const total = areas.reduce((sum, x) => sum + x, 0);
		// A plain (non-XOR) union would keep 2500 + 2500 - 625 = 4375 (the overlap counted once). Even
		// odd excludes it from BOTH squares (625mm^2 twice), leaving 4375 - 625 = 3750 - if this were
		// ever "fixed" to pftNonZero, this assertion is exactly where that would start failing.
		expect(total).toBeCloseTo(3750, 0);
		for (const area of areas) expect(area).toBeCloseTo(1875, 0);
	});
});

describe("orientForCut", () => {
	const ccw: Polyline = { points: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true };

	// orientForCut has no separate "is this an outer or a hole" flag - it reads that entirely from
	// the loop's OWN winding (CCW/CW), which is only meaningful because normalise() upstream has
	// already established outer=CCW, hole=CW by containment. So this truth table is for a normalised
	// OUTER ring specifically (CCW in); a hole (CW in) is not "the same table, independent of
	// winding" - it is the mechanism, verified below, that makes a hole always come out opposite.
	it.each([
		["outside", true, 1], // climb ⇒ material (inside the loop, for an outside cut) on the tool's left ⇒ CCW
		["outside", false, -1],
		["inside", true, -1], // an inside cut is an aperture: material is outside the loop, direction inverts
		["inside", false, 1],
	] as const)("outer ring: side=%s climb=%s -> winding sign %i", (side, climb, sign) => {
		const [out] = orientForCut([ccw], climb, side);
		expect(Math.sign(signedArea(out.points))).toBe(sign);
	});

	it("an outer(CCW)+hole(CW) pair - the shape normalise() actually produces - always end up wound oppositely", () => {
		for (const side of ["inside", "outside"] as const) {
			for (const climb of [true, false]) {
				const [o, h] = orientForCut([outer, hole], climb, side);
				expect(Math.sign(signedArea(o.points))).toBe(-Math.sign(signedArea(h.points)));
			}
		}
	});

	it("side 'on' returns every loop completely unchanged", () => {
		const cw: Polyline = { ...ccw, points: [...ccw.points].reverse() };
		expect(orientForCut([ccw, cw], true, "on")).toEqual([ccw, cw]);
	});
});

describe("orderForCut", () => {
	it("sorts smallest area first - a hole always precedes its container", () => {
		const big = square(0, 0, 100);
		const small = square(30, 30, 10);
		expect(orderForCut([big, small])).toEqual([small, big]);
	});

	it("ties break by original index", () => {
		const a = square(0, 0, 10);
		const b = square(20, 20, 10);
		expect(orderForCut([a, b])).toEqual([a, b]);
	});
});
