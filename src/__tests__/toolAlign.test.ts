import { describe, expect, it } from "vitest";

import { computeToolOffset, formatG10 } from "../util/toolAlign";

const ZERO = { x: 0, y: 0, z: 0 };

describe("computeToolOffset", () => {
	it("offset = tool − reference for captured axes", () => {
		const off = computeToolOffset({ x: 10, y: 20 }, { x: 11, y: 18 }, ZERO, false);
		expect(off).toEqual({ x: 1, y: -2 });
	});

	it("carries the reference's existing G10 offset", () => {
		const off = computeToolOffset({ x: 10, y: 20 }, { x: 11, y: 18 }, { x: 0.5, y: -0.5, z: 0 }, false);
		expect(off.x).toBeCloseTo(1.5);
		expect(off.y).toBeCloseTo(-2.5);
	});

	it("invert flips the correction term", () => {
		const off = computeToolOffset({ x: 10, y: 20 }, { x: 11, y: 18 }, ZERO, true);
		expect(off).toEqual({ x: -1, y: 2 });
	});

	it("only includes axes captured on BOTH tool and reference", () => {
		// Z captured on the tool but not the reference → no Z in the result.
		expect(computeToolOffset({ x: 0, y: 0 }, { x: 1, y: 1, z: 5 }, ZERO, false)).toEqual({ x: 1, y: 1 });
		// Z captured on both → Z offset present.
		expect(computeToolOffset({ x: 0, y: 0, z: 2 }, { x: 1, y: 1, z: 5 }, ZERO, false)).toEqual({ x: 1, y: 1, z: 3 });
		// Only Z captured on both → just Z.
		expect(computeToolOffset({ z: 2 }, { z: 5 }, ZERO, false)).toEqual({ z: 3 });
	});
});

describe("formatG10", () => {
	it("builds a G10 with only the present axes", () => {
		expect(formatG10(1, { x: 1, y: -2 })).toBe("G10 P1 X1.000 Y-2.000");
		expect(formatG10(2, { x: 1, y: -2, z: 0.5 })).toBe("G10 P2 X1.000 Y-2.000 Z0.500");
		expect(formatG10(3, { z: -0.25 })).toBe("G10 P3 Z-0.250");
	});

	it("returns null when there is nothing to set", () => {
		expect(formatG10(1, {})).toBeNull();
	});
});
