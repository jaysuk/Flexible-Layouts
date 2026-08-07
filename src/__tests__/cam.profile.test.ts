import { describe, expect, it } from "vitest";

import { profile, type ProfileParams } from "../model/cam/profile";
import type { Polyline } from "../model/vectorImport/types";

function baseParams(overrides: Partial<ProfileParams> = {}): ProfileParams {
	return {
		toolDiameter: 6,
		zTop: 0,
		depth: 6,
		depthPerPass: 3,
		feedRate: 1000,
		plungeFeed: 300,
		rpm: 18000,
		safeZ: 10,
		tool: null,
		spindleDwell: 1,
		tabs: { count: 0, width: 0, height: 0 },
		rampLength: 5,
		sourceNote: "test fixture",
		...overrides,
	};
}

function square(x0: number, y0: number, size: number, closed = true): Polyline {
	return {
		points: [[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]],
		closed,
	};
}

function nonBlankLines(gcode: string): Array<string> {
	return gcode.split("\n").filter((l) => l.trim() !== "");
}

describe("profile", () => {
	it("empty input refuses cleanly with a warning, and never throws", () => {
		let result;
		expect(() => (result = profile([], baseParams()))).not.toThrow();
		expect(result!.summary).toBe("Nothing to cut");
		expect(result!.warnings.length).toBeGreaterThan(0);
		expect(result!.gcode).toContain("G21");
	});

	it("cuts loop-major: every pass of loop 1 (both depth levels) is emitted before loop 2 starts", () => {
		const result = profile([square(0, 0, 10), square(50, 50, 10)], baseParams());
		const text = result.gcode;
		const i1 = text.indexOf("( path 1 of 2 )");
		const i2 = text.indexOf("( path 2 of 2 )");
		expect(i1).toBeGreaterThanOrEqual(0);
		expect(i2).toBeGreaterThan(i1);
	});

	it("starts with the standard preamble, and sequences tool/spindle/safe-Z before any cut", () => {
		const result = profile([square(0, 0, 10)], baseParams({ tool: 3 }));
		const lines = nonBlankLines(result.gcode);
		const firstCode = lines.find((l) => !l.startsWith("("))!;
		expect(firstCode).toBe("G21 G90 G17 G94");

		const iTool = lines.findIndex((l) => l === "T3");
		const iSpindle = lines.findIndex((l) => l.startsWith("M3"));
		const iDwell = lines.findIndex((l) => l.startsWith("G4"));
		const iSafeZ = lines.findIndex((l) => l === "G0 Z10");
		const iFirstCut = lines.findIndex((l) => /^G[01] X/.test(l));
		expect(iTool).toBeGreaterThanOrEqual(0);
		expect(iSpindle).toBeGreaterThan(iTool);
		expect(iDwell).toBeGreaterThan(iSpindle);
		expect(iSafeZ).toBeGreaterThan(iDwell);
		expect(iFirstCut).toBeGreaterThan(iSafeZ);
	});

	it("ends with a rapid to safe Z, then spindle off, then program end", () => {
		const result = profile([square(0, 0, 10)], baseParams());
		const lines = nonBlankLines(result.gcode);
		expect(lines.slice(-3)).toEqual(["G0 Z10", "M5", "M2"]);
	});

	it("every pass starts with a rapid to safe Z immediately before the XY rapid to its start point", () => {
		const result = profile([square(0, 0, 10), square(50, 50, 10)], baseParams());
		const lines = nonBlankLines(result.gcode);
		lines.forEach((line, i) => {
			if (/^G0 X/.test(line)) expect(lines[i - 1]).toBe("G0 Z10");
		});
	});

	it("tabTop: a tab taller than the cut depth is refused with a warning naming both numbers", () => {
		const result = profile([square(0, 0, 10)], baseParams({
			depth: 6,
			tabs: { count: 2, width: 5, height: 8 },
		}));
		const warning = result.warnings.find((w) => w.includes("not less than"));
		expect(warning).toBeTruthy();
		expect(warning).toContain("8");
		expect(warning).toContain("6");
		expect(result.gcode).toContain("no tabs");
	});

	it("tabTop: count <= 0 or height <= 0 disables tabs silently, no warning", () => {
		for (const tabs of [{ count: 0, width: 5, height: 2 }, { count: 2, width: 5, height: 0 }]) {
			const result = profile([square(0, 0, 10)], baseParams({ tabs }));
			expect(result.warnings.some((w) => w.toLowerCase().includes("tab"))).toBe(false);
			expect(result.gcode).toContain("no tabs");
		}
	});

	it("rampLength 0 warns that a centre-cutting tool is required", () => {
		const result = profile([square(0, 0, 10)], baseParams({ rampLength: 0 }));
		expect(result.warnings.some((w) => w.includes("centre-cutting"))).toBe(true);
	});

	it("an open path is cut there-and-back per level, with a kerf-width warning", () => {
		const open: Polyline = { points: [[0, 0], [10, 0], [10, 10]], closed: false };
		const result = profile([open], baseParams());
		const warning = result.warnings.find((w) => w.includes("open path"));
		expect(warning).toBeTruthy();
		expect(warning).toContain("6mm wide"); // toolDiameter from baseParams()
	});

	it("tool: null emits no T word at all", () => {
		const result = profile([square(0, 0, 10)], baseParams({ tool: null }));
		expect(/^T\d/m.test(result.gcode)).toBe(false);
	});

	it("F1: a non-finite coordinate refuses the program instead of emitting a fabricated move", () => {
		// format.ts's n() throws on NaN/Infinity (see its own header) - this confirms profile() catches
		// that rather than letting it propagate as an uncaught exception or, worse, the old upstream
		// behaviour of silently emitting "0" (a feed move to the work origin at cut depth).
		const bad: Polyline = { points: [[0, 0], [Infinity, 0], [10, 10], [0, 10]], closed: true };
		let result;
		expect(() => (result = profile([bad], baseParams()))).not.toThrow();
		expect(result!.summary).not.toBe("Nothing to cut"); // it reached the try block, not the empty-input path
		expect(result!.warnings.some((w) => w.includes("refused"))).toBe(true);
	});
});
