import { describe, expect, it } from "vitest";

import { boundsOf, pathLength, signedArea, type Polyline } from "../model/vectorImport/types";

const ccwUnitSquare = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;

describe("signedArea", () => {
	it("is positive for a CCW-wound ring", () => {
		expect(signedArea(ccwUnitSquare.map((p) => [...p] as [number, number]))).toBe(1);
	});
	it("is negative for the same ring reversed (CW)", () => {
		const cw = [...ccwUnitSquare].reverse().map((p) => [...p] as [number, number]);
		expect(signedArea(cw)).toBe(-1);
	});
	it("is zero for a degenerate ring", () => {
		expect(signedArea([[0, 0], [1, 1]])).toBe(0);
	});
});

describe("boundsOf", () => {
	it("is null for no paths at all", () => {
		expect(boundsOf([])).toBeNull();
	});
	it("is the union box across every path", () => {
		const paths: Array<Polyline> = [
			{ points: [[0, 0], [5, 5]], closed: false },
			{ points: [[-2, 10], [3, -1]], closed: false },
		];
		expect(boundsOf(paths)).toEqual({ min: [-2, -1], max: [5, 10] });
	});
});

describe("pathLength", () => {
	const square: Polyline = { points: ccwUnitSquare.map((p) => [...p] as [number, number]), closed: true };

	it("includes the closing edge for a closed path", () => {
		expect(pathLength(square)).toBe(4);
	});
	it("excludes the closing edge for an open path with the same points", () => {
		expect(pathLength({ ...square, closed: false })).toBe(3);
	});
});
