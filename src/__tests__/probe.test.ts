import { describe, expect, it } from "vitest";

import { buildProbeCommand, DEFAULT_PROBE_COMMANDS } from "../util/probe";

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
});
