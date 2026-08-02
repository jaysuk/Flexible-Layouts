import { describe, expect, it } from "vitest";

import { buildProbeCommand, DEFAULT_BED_MESH_PROBE_COMMAND, DEFAULT_PROBE_COMMANDS } from "../util/probe";

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
