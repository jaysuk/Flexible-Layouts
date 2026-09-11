import { describe, expect, it } from "vitest";
import { MachineMode } from "@duet3d/objectmodel";

import { isCncOrLaserMode } from "../util/machineMode";

// Compares against the MachineMode enum's own values (not hardcoded "CNC"/"Laser" literals) - same
// convention as test/builtinPages.test.ts's setMachineMode(). dwc-plugin-test-kit's stub for
// @duet3d/objectmodel gives MachineMode lowercase values ("cnc"/"laser"/"fff"), unlike the real
// package (uppercase "CNC"/"Laser"/"FFF") - isCncOrLaserMode() itself always compares against
// whatever the real enum resolves to at runtime, so testing via the enum symbol (not a literal)
// is what actually exercises that comparison correctly under either casing.
describe("isCncOrLaserMode", () => {
	it("is true for CNC", () => {
		expect(isCncOrLaserMode(MachineMode.cnc)).toBe(true);
	});
	it("is true for Laser", () => {
		expect(isCncOrLaserMode(MachineMode.laser)).toBe(true);
	});
	it("is false for FFF", () => {
		expect(isCncOrLaserMode(MachineMode.fff)).toBe(false);
	});
	it("is false for undefined (no machine connected / mode not yet known)", () => {
		expect(isCncOrLaserMode(undefined)).toBe(false);
	});
	it("is false for an unrecognised string rather than throwing", () => {
		expect(isCncOrLaserMode("something else")).toBe(false);
	});
});
