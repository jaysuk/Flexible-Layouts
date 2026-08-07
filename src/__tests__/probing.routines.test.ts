import { describe, expect, it } from "vitest";

import {
	buildRotation,
	buildSetWorkOffset,
	buildToolOffset,
	buildTouch,
	computeBoreCentre,
	computeSkewAngle,
	computeToolLengthOffset,
} from "../model/probing/routines";

describe("buildTouch", () => {
	it("emits a fast probe -> backoff -> slow re-probe in the requested direction", () => {
		const cmd = buildTouch({ probeIndex: 1, axis: "Z", direction: -1, searchDistance: 10, backoff: 1, feedFast: 500, feedSlow: 100 });
		expect(cmd).toBe([
			"G91",
			"G38.2 K1 Z-10 F500",
			"G1 Z1 F100",
			"G38.2 K1 Z-2 F100",
			"G90",
		].join("\n"));
	});

	it("flips every signed distance when direction is +1", () => {
		const cmd = buildTouch({ probeIndex: 0, axis: "X", direction: 1, searchDistance: 5, backoff: 0.5, feedFast: 300, feedSlow: 60 });
		expect(cmd).toBe([
			"G91",
			"G38.2 K0 X5 F300",
			"G1 X-0.5 F60",
			"G38.2 K0 X1 F60",
			"G90",
		].join("\n"));
	});
});

describe("buildSetWorkOffset / buildToolOffset / buildRotation", () => {
	it("omits the P parameter for the active WCS", () => {
		expect(buildSetWorkOffset("X", 0)).toBe("G10 L20 X0");
	});
	it("includes a 1-based P parameter for an explicit WCS index", () => {
		expect(buildSetWorkOffset("Y", 12.5, 2)).toBe("G10 L20 P3 Y12.5");
	});
	it("builds a direct (non-L20) tool Z offset", () => {
		expect(buildToolOffset(3, -0.42)).toBe("G10 L1 P3 Z-0.42");
	});
	it("builds a G68 rotation command", () => {
		expect(buildRotation(1.25, 10, 20)).toBe("G68 X10 Y20 R1.25");
	});
});

describe("computeSkewAngle", () => {
	it("is 0 for two touches with the same 'across' reading (edge parallel to the axis)", () => {
		expect(computeSkewAngle({ along: 0, across: 5 }, { along: 50, across: 5 })).toBe(0);
	});
	it("computes a positive angle for a CCW-rotated edge", () => {
		// Edge runs mostly in Y but drifts +1mm in X over 100mm of Y - a small positive skew.
		const angle = computeSkewAngle({ along: 0, across: 5 }, { along: 100, across: 6 });
		expect(angle).toBeCloseTo(Math.atan2(1, 100) * (180 / Math.PI), 6);
	});
	it("is independent of a constant tip-radius error added to both touches", () => {
		const withoutTip = computeSkewAngle({ along: 0, across: 5 }, { along: 100, across: 6 });
		const withTip = computeSkewAngle({ along: 0, across: 5 + 3 }, { along: 100, across: 6 + 3 });
		expect(withTip).toBeCloseTo(withoutTip, 9);
	});
});

describe("computeBoreCentre", () => {
	it("averages opposing touches per axis", () => {
		expect(computeBoreCentre({ xPlus: 10, xMinus: -10, yPlus: 4, yMinus: -6 })).toEqual({ x: 0, y: -1 });
	});
});

describe("computeToolLengthOffset", () => {
	it("is 0 when the tool probes identically to the master (same length)", () => {
		expect(computeToolLengthOffset(50, 50)).toBe(0);
	});
	it("is negative for a tool longer than the master (higher/larger probed Z)", () => {
		expect(computeToolLengthOffset(50, 55)).toBe(-5);
	});
	it("is positive for a tool shorter than the master", () => {
		expect(computeToolLengthOffset(50, 45)).toBe(5);
	});
});
