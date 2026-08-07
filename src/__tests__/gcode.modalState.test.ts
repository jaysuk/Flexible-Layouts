import { describe, expect, it } from "vitest";

import { modalStateAt } from "../model/gcode/modalState";

describe("modalStateAt", () => {
	it("returns firmware defaults when replaying to offset 0 (nothing executed yet)", () => {
		const state = modalStateAt("G21\nG90\nG1 X10\n", 0);
		expect(state).toMatchObject({ units: "mm", absolute: true, wcs: null, tool: null, spindleDirection: "off", x: 0, y: 0, z: 0 });
	});

	it("reflects tool, spindle, coolant, WCS and feed set by prior lines - but not the target line itself", () => {
		const text = "T2\nG54\nM3 S12000\nM8\nG1 X10 Y5 F800\nG1 X20\n";
		const targetOffset = new TextEncoder().encode("T2\nG54\nM3 S12000\nM8\nG1 X10 Y5 F800\n").length;
		const state = modalStateAt(text, targetOffset);
		expect(state).toMatchObject({
			tool: 2, wcs: "G54", spindleDirection: "cw", spindleRpm: 12000,
			coolantFlood: true, coolantMist: false, feed: 800, x: 10, y: 5, z: 0,
		});
	});

	it("clears spindle rpm on M5 and coolant on M9", () => {
		const text = "M3 S10000\nM8\nM5\nM9\nG1 X1\n";
		const targetOffset = new TextEncoder().encode("M3 S10000\nM8\nM5\nM9\n").length;
		const state = modalStateAt(text, targetOffset);
		expect(state).toMatchObject({ spindleDirection: "off", spindleRpm: 0, coolantMist: false, coolantFlood: false });
	});

	it("converts an inch-mode position to mm", () => {
		const text = "G20\nG90\nG1 X2 Y1\nG1 X3\n";
		const targetOffset = new TextEncoder().encode("G20\nG90\nG1 X2 Y1\n").length;
		const state = modalStateAt(text, targetOffset);
		expect(state.units).toBe("inch");
		expect(state.x).toBeCloseTo(50.8, 6);
		expect(state.y).toBeCloseTo(25.4, 6);
	});

	it("tracks incremental (G91) position updates", () => {
		const text = "G90\nG1 X10\nG91\nG1 X5\nG1 X0\n";
		const targetOffset = new TextEncoder().encode("G90\nG1 X10\nG91\nG1 X5\n").length;
		const state = modalStateAt(text, targetOffset);
		expect(state.x).toBe(15);
	});
});
