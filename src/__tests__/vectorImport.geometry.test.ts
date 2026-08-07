import { describe, expect, it } from "vitest";

import { chain, place, simplify } from "../model/vectorImport/geometry";
import { signedArea, type Point, type Polyline } from "../model/vectorImport/types";

describe("simplify", () => {
	it("drops a point that sits within tolerance of the chord", () => {
		// The middle point is 0.001mm off the straight line from (0,0) to (10,0).
		const pts: Array<Point> = [[0, 0], [5, 0.001], [10, 0]];
		expect(simplify(pts, 0.01)).toEqual([[0, 0], [10, 0]]);
	});
	it("keeps a point that exceeds tolerance", () => {
		const pts: Array<Point> = [[0, 0], [5, 0.001], [10, 0]];
		expect(simplify(pts, 0.0001)).toEqual(pts);
	});
	it("always keeps the first and last point", () => {
		const pts: Array<Point> = [[0, 0], [1, 100], [2, -100], [3, 0]];
		const out = simplify(pts, 1000);
		expect(out[0]).toEqual([0, 0]);
		expect(out[out.length - 1]).toEqual([3, 0]);
	});
	it("returns a copy, not the same array reference, when tolerance is 0", () => {
		const pts: Array<Point> = [[0, 0], [1, 1]];
		const out = simplify(pts, 0);
		expect(out).toEqual(pts);
		expect(out).not.toBe(pts);
	});
	it("never blows the stack on a very long path (the whole reason this is iterative)", () => {
		const pts: Array<Point> = [];
		for (let i = 0; i < 200_000; i++) {
			pts.push([i, Math.sin(i / 100)]);
		}
		expect(() => simplify(pts, 0.1)).not.toThrow();
		// v8 coverage instrumentation slows this well past the default 5s timeout even though it
		// completes in ~150ms uninstrumented - the extended budget below is for that, not for the
		// algorithm itself, which is asserted stack-safe by the fact this runs at all.
	}, 20_000);
});

describe("chain", () => {
	it("joins four scrambled, partly-reversed segments into one closed square", () => {
		// A 10x10 square's four edges, supplied out of order and with two reversed - nothing here
		// says they form a loop except shared endpoints.
		const segments: Array<Polyline> = [
			{ points: [[10, 0], [10, 10]], closed: false }, // right edge
			{ points: [[0, 0], [10, 0]], closed: false }, // bottom edge
			{ points: [[0, 10], [10, 10]], closed: false }, // top edge, reversed
			{ points: [[0, 0], [0, 10]], closed: false }, // left edge, reversed
		];
		const out = chain(segments, 0.01);
		expect(out).toHaveLength(1);
		expect(out[0].closed).toBe(true);
		expect(out[0].points).toHaveLength(4);
	});

	it("leaves an already-closed path untouched", () => {
		const closed: Polyline = { points: [[0, 0], [1, 0], [1, 1]], closed: true };
		expect(chain([closed], 0.01)).toEqual([closed]);
	});

	it("leaves two segments separate when the gap exceeds tolerance", () => {
		const segments: Array<Polyline> = [
			{ points: [[0, 0], [1, 0]], closed: false },
			{ points: [[5, 0], [6, 0]], closed: false },
		];
		const out = chain(segments, 0.01);
		expect(out).toHaveLength(2);
		expect(out.every((p) => !p.closed)).toBe(true);
	});
});

describe("place", () => {
	it("scales then offsets", () => {
		const out = place([{ points: [[2, 3]], closed: false }], { scale: 2, flipY: false, offsetX: 1, offsetY: 1 });
		expect(out[0].points[0]).toEqual([5, 7]);
	});

	it("flipY mirrors Y about zero before the offset is added", () => {
		const out = place([{ points: [[2, 3]], closed: false }], { scale: 2, flipY: true, offsetX: 0, offsetY: 0 });
		expect(out[0].points[0]).toEqual([4, -6]);
	});

	it("flipY negates signedArea - this is the fact that makes offset.ts's normalise() load-bearing: " +
		"a mirrored ring's winding is inverted on input, but Clipper's even-odd union re-derives outer/hole " +
		"winding from containment rather than trusting it, so the mirror doesn't survive into a wrong cut side", () => {
		const ccwSquare: Polyline = { points: [[0, 0], [1, 0], [1, 1], [0, 1]], closed: true };
		const before = signedArea(ccwSquare.points);
		const after = place([ccwSquare], { scale: 1, flipY: true, offsetX: 0, offsetY: 0 })[0];
		expect(Math.sign(signedArea(after.points))).toBe(-Math.sign(before));
	});
});
