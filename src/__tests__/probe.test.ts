import { describe, expect, it } from "vitest";

import { buildProbeCommand, DEFAULT_BED_MESH_PROBE_COMMAND, DEFAULT_PROBE_COMMANDS, isProbeTriggered } from "../util/probe";

describe("buildProbeCommand", () => {
	it("substitutes {dia} and {corner} placeholders", () => {
		expect(buildProbeCommand("M98 P\"probe.g\" D{dia} C{corner}", { dia: 6.35, corner: "FR" }))
			.toBe("M98 P\"probe.g\" D6.35 CFR");
	});

	it("replaces every occurrence of a placeholder", () => {
		expect(buildProbeCommand("{dia} {dia} {corner}", { dia: 3, corner: "BL" })).toBe("3 3 BL");
	});

	it("leaves a template with no placeholders untouched", () => {
		expect(buildProbeCommand(DEFAULT_PROBE_COMMANDS.z, { dia: 6, corner: "FL" })).toBe(DEFAULT_PROBE_COMMANDS.z);
	});

	it("ships a default macro command for every operation", () => {
		for (const op of ["z", "x", "y", "corner", "centre"] as const) {
			expect(DEFAULT_PROBE_COMMANDS[op]).toMatch(/^M98 P".+\.g"$/);
		}
	});

	it("substitutes {x}/{y} placeholders", () => {
		expect(buildProbeCommand("G30 X{x} Y{y} S-1", { x: 22.5, y: 88.25 })).toBe("G30 X22.5 Y88.25 S-1");
	});

	// The gotcha this trimming exists for: a spacing value derived from (max-min)/(n-1) is often a
	// repeating decimal (e.g. 290/15), and floating-point arithmetic on it produces noise like
	// 19.333333333333336 - which must not leak into the G-code sent to the machine.
	it("trims a coordinate to 3dp and drops trailing zeros/float noise", () => {
		expect(buildProbeCommand("X{x}", { x: 290 / 15 })).toBe("X19.333");
		expect(buildProbeCommand("X{x}", { x: 10 })).toBe("X10");
		expect(buildProbeCommand("X{x}", { x: 10.1 })).toBe("X10.1");
	});

	it("ships a default bed-mesh point-probe command using {x}/{y}", () => {
		expect(DEFAULT_BED_MESH_PROBE_COMMAND).toContain("{x}");
		expect(DEFAULT_BED_MESH_PROBE_COMMAND).toContain("{y}");
		expect(buildProbeCommand(DEFAULT_BED_MESH_PROBE_COMMAND, { x: 5, y: 5 })).toBe('M98 P"0:/macros/Probe/probe_point.g" X5 Y5');
	});
});

describe("isProbeTriggered", () => {
	it("returns false for a null/undefined probe", () => {
		expect(isProbeTriggered(null)).toBe(false);
		expect(isProbeTriggered(undefined)).toBe(false);
	});

	it("returns false when there's no value at all", () => {
		expect(isProbeTriggered({ threshold: 500 })).toBe(false);
		expect(isProbeTriggered({ value: [], threshold: 500 })).toBe(false);
	});

	describe("non-load-cell probe (compares raw value[0] against threshold)", () => {
		it("is triggered once value[0] reaches a positive threshold", () => {
			expect(isProbeTriggered({ value: [499], threshold: 500 })).toBe(false);
			expect(isProbeTriggered({ value: [500], threshold: 500 })).toBe(true);
			expect(isProbeTriggered({ value: [900], threshold: 500 })).toBe(true);
		});

		it("defaults a missing threshold to 0, matching the old hardcoded behaviour's spirit", () => {
			expect(isProbeTriggered({ value: [0] })).toBe(true); // 0 >= 0
			expect(isProbeTriggered({ value: [-1] })).toBe(false);
		});
	});

	describe("negative threshold - probe triggers when the value FALLS to it (RRF 3.7)", () => {
		it("is triggered once value[0] falls to or below the threshold", () => {
			expect(isProbeTriggered({ value: [-400], threshold: -500 })).toBe(false);
			expect(isProbeTriggered({ value: [-500], threshold: -500 })).toBe(true);
			expect(isProbeTriggered({ value: [-900], threshold: -500 })).toBe(true);
		});
	});

	describe("load-cell probe (compares force in grams against threshold, NOT value[0] in raw counts)", () => {
		it("uses loadCell.force instead of the raw counts value", () => {
			// value[0] alone would (wrongly) read as triggered against a 500-count-style threshold,
			// but the load cell's actual force is nowhere near its own (much lower) gram threshold.
			expect(isProbeTriggered({ value: [12000], threshold: 50, loadCell: { force: 10 } })).toBe(false);
			expect(isProbeTriggered({ value: [12000], threshold: 50, loadCell: { force: 55 } })).toBe(true);
		});

		it("respects a negative gram threshold too", () => {
			expect(isProbeTriggered({ threshold: -20, loadCell: { force: -25 } })).toBe(true);
			expect(isProbeTriggered({ threshold: -20, loadCell: { force: -10 } })).toBe(false);
		});

		it("falls back to value[0] if loadCell is present but its force is missing", () => {
			expect(isProbeTriggered({ value: [600], threshold: 500, loadCell: {} })).toBe(true);
		});
	});
});
