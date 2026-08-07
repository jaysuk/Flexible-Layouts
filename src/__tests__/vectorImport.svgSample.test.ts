import { describe, expect, it } from "vitest";

import { closeIfMeeting, splitRuns } from "../model/vectorImport/svgSample";
import type { Point } from "../model/vectorImport/types";

describe("splitRuns", () => {
	it("a jump well past the threshold starts a new run", () => {
		const samples: Array<Point> = [[0, 0], [1, 0], [2, 0], [2 + 3 * 1, 0], [2 + 3 * 1 + 1, 0], [2 + 3 * 1 + 2, 0]];
		// spacing 1: steps of 1 within each run, one jump of 3x spacing between them.
		const runs = splitRuns(samples, 1);
		expect(runs).toHaveLength(2);
		expect(runs[0]).toEqual([[0, 0], [1, 0], [2, 0]]);
		expect(runs[1]).toEqual([[5, 0], [6, 0], [7, 0]]);
	});

	it("uniform spacing with no jump stays one run", () => {
		const samples: Array<Point> = [[0, 0], [1, 0], [2, 0], [3, 0]];
		expect(splitRuns(samples, 1)).toEqual([samples]);
	});

	it("a run left with a single point is discarded", () => {
		const samples: Array<Point> = [
			[0, 0], // lone point - orphaned after the jump below
			[100, 0], // jump
			[101, 0], [102, 0], [103, 0], // a real run
		];
		const runs = splitRuns(samples, 1);
		expect(runs).toHaveLength(1);
		expect(runs[0]).toEqual([[100, 0], [101, 0], [102, 0], [103, 0]]);
	});

	it("a gap of exactly spacing * 1.5 does not split - the boundary is strictly greater-than", () => {
		const samples: Array<Point> = [[0, 0], [1.5, 0], [3, 0]];
		expect(splitRuns(samples, 1)).toEqual([samples]);
	});

	it("empty input yields no runs", () => {
		expect(splitRuns([], 1)).toEqual([]);
	});
});

describe("closeIfMeeting", () => {
	it("pops the duplicate closing point and reports closed when ends coincide", () => {
		const points: Array<Point> = [[0, 0], [10, 0], [10, 10], [0.001, 0.001]];
		const result = closeIfMeeting(points, 0.01);
		expect(result.closed).toBe(true);
		expect(result.points).toEqual([[0, 0], [10, 0], [10, 10]]);
	});

	it("leaves the run open and unchanged when the ends don't meet", () => {
		const points: Array<Point> = [[0, 0], [10, 0], [10, 10]];
		const result = closeIfMeeting(points, 0.01);
		expect(result.closed).toBe(false);
		expect(result.points).toEqual(points);
	});

	it("a run shorter than 3 points is never considered closed", () => {
		const points: Array<Point> = [[0, 0], [0, 0]];
		expect(closeIfMeeting(points, 0.01).closed).toBe(false);
	});
});
