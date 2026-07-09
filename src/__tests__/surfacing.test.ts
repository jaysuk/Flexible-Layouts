import { describe, expect, it } from "vitest";

import { generateSurfacingGCode, passCount, rowCount, type SurfacingParams } from "../util/surfacing";

function params(overrides: Partial<SurfacingParams> = {}): SurfacingParams {
	return {
		width: 100, height: 50, toolDiameter: 6, stepoverPercent: 50,
		depthPerPass: 0.5, totalDepth: 1, clearance: 5, feed: 1000, direction: "x",
		...overrides,
	};
}

describe("passCount", () => {
	it("splits total depth into passes of at most depthPerPass", () => {
		expect(passCount({ totalDepth: 1, depthPerPass: 0.5 })).toBe(2);
		expect(passCount({ totalDepth: 1.2, depthPerPass: 0.5 })).toBe(3);
	});
	it("is always at least one pass, even for a zero/negative depth", () => {
		expect(passCount({ totalDepth: 0, depthPerPass: 0.5 })).toBe(1);
	});
});

describe("rowCount", () => {
	it("covers the cross-axis span (plus a tool-width margin) at the given stepover", () => {
		// height=50, tool=6 → cross span 56mm, stepover 50% of 6 = 3mm → ceil(56/3)+1 = 20
		expect(rowCount(params())).toBe(20);
	});
	it("uses the other axis as the cross-span when direction is y", () => {
		// width=100, tool=6 → cross span 106mm, stepover 3mm → ceil(106/3)+1 = 37
		expect(rowCount(params({ direction: "y" }))).toBe(37);
	});
});

describe("generateSurfacingGCode", () => {
	it("starts with mm/absolute mode and ends parked at the work origin", () => {
		const { gcode } = generateSurfacingGCode(params());
		const lines = gcode.trim().split("\n");
		expect(lines).toContain("G21 ; mm");
		expect(lines).toContain("G90 ; absolute");
		expect(lines[lines.length - 1]).toBe("G0 X0 Y0");
	});

	it("omits M3/M5 when spindleRpm is 0 (leaves spindle control to the operator)", () => {
		const { gcode } = generateSurfacingGCode(params({ spindleRpm: 0 }));
		expect(gcode).not.toContain("M3");
		expect(gcode).not.toContain("M5");
	});

	it("starts and stops the spindle when a non-zero RPM is given", () => {
		const { gcode } = generateSurfacingGCode(params({ spindleRpm: 12000 }));
		expect(gcode).toContain("M3 S12000");
		expect(gcode).toContain("M5");
		// Spindle starts before any cutting move and stops after the last one.
		expect(gcode.indexOf("M3 S12000")).toBeLessThan(gcode.indexOf("G1 "));
		expect(gcode.lastIndexOf("G1 ")).toBeLessThan(gcode.indexOf("M5"));
	});

	it("caps the last pass at totalDepth even when it doesn't divide evenly by depthPerPass", () => {
		const { gcode, passes } = generateSurfacingGCode(params({ totalDepth: 1.2, depthPerPass: 0.5 }));
		expect(passes).toBe(3);
		expect(gcode).toContain("Z-1.2");
		// No pass should ever cut deeper than totalDepth.
		const depths = [...gcode.matchAll(/^G1 Z(-?[\d.]+)/gm)].map((m) => Number(m[1]));
		for (const d of depths) {
			expect(Math.abs(d)).toBeLessThanOrEqual(1.2 + 1e-9);
		}
	});

	it("plunges at half the cutting feed rate", () => {
		const { gcode } = generateSurfacingGCode(params({ feed: 1000 }));
		expect(gcode).toContain("F500");
	});

	it("clears to the safe height at the end of every pass", () => {
		const { gcode, passes } = generateSurfacingGCode(params());
		const clearanceMoves = gcode.split("\n").filter((l) => l === "G0 Z5").length;
		// Once at the very start, plus once at the end of each pass.
		expect(clearanceMoves).toBe(passes + 1);
	});

	it("never moves along the main axis past a half-tool-width margin outside the surfaced area", () => {
		const { gcode } = generateSurfacingGCode(params({ width: 100, toolDiameter: 6 }));
		const xMoves = [...gcode.matchAll(/X(-?[\d.]+)/g)].map((m) => Number(m[1]));
		for (const x of xMoves) {
			expect(x).toBeGreaterThanOrEqual(-3.001);
			expect(x).toBeLessThanOrEqual(103.001);
		}
	});
});
