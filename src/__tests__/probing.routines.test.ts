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
	/**
	 * Simulates two touches on one edge of a workpiece rotated `theta` degrees anticlockwise, for a
	 * given probe axis. Deriving the touches from the rotation (rather than hand-picking numbers)
	 * is what makes the sign assertions below meaningful: the expected answer is the theta that went
	 * in, whichever axis was probed.
	 */
	function touchesFor(theta: number, probedAxis: "X" | "Y", span = 50) {
		const rad = theta * (Math.PI / 180);
		// The edge runs perpendicular to the probed axis: probing X means the edge runs along Y.
		const dir = probedAxis === "X"
			? { x: -Math.sin(rad), y: Math.cos(rad) }   // nominal (0,1) rotated by +theta
			: { x: Math.cos(rad), y: Math.sin(rad) };   // nominal (1,0) rotated by +theta
		const alongOf = (p: { x: number; y: number }) => (probedAxis === "X" ? p.y : p.x);
		const acrossOf = (p: { x: number; y: number }) => (probedAxis === "X" ? p.x : p.y);
		const p1 = { x: 0, y: 0 };
		const p2 = { x: dir.x * span, y: dir.y * span };
		return [
			{ along: alongOf(p1), across: acrossOf(p1) },
			{ along: alongOf(p2), across: acrossOf(p2) },
		] as const;
	}

	// toBeCloseTo, not toBe: negating the X case yields -0, which is === 0 but fails Object.is. It has
	// no effect on the emitted G-code (String(-0) is "0"), so the value is what matters here.
	it("is 0 for two touches with the same 'across' reading (edge parallel to the axis)", () => {
		expect(computeSkewAngle({ along: 0, across: 5 }, { along: 50, across: 5 }, "Y")).toBeCloseTo(0, 10);
		expect(computeSkewAngle({ along: 0, across: 5 }, { along: 50, across: 5 }, "X")).toBeCloseTo(0, 10);
	});

	/**
	 * The regression test for a real sign bug: the raw atan2 of (across, along) reports OPPOSITE
	 * signs for the two probe axes, because probing X measures an edge running along Y (whose
	 * nominal direction vector is (0,1)) while probing Y measures one running along X ((1,0)).
	 * Feeding the unflipped X-axis result to G68 rotated the coordinate system the wrong way,
	 * roughly doubling the misalignment instead of removing it.
	 */
	it("reports the SAME rotation for the same physical skew, whichever axis was probed", () => {
		for (const theta of [3, -3, 0.25, -0.25, 12]) {
			for (const axis of ["X", "Y"] as const) {
				const [t1, t2] = touchesFor(theta, axis);
				expect(computeSkewAngle(t1, t2, axis), `theta=${theta} probing ${axis}`).toBeCloseTo(theta, 6);
			}
		}
	});

	it("is independent of a constant tip-radius error added to both touches", () => {
		const withoutTip = computeSkewAngle({ along: 0, across: 5 }, { along: 100, across: 6 }, "Y");
		const withTip = computeSkewAngle({ along: 0, across: 5 + 3 }, { along: 100, across: 6 + 3 }, "Y");
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
