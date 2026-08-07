import { describe, expect, it } from "vitest";

import type { Widget } from "../model/document";
import { fixedAxesFor, movesAxes } from "../util/motionAxes";

describe("movesAxes", () => {
	it("is true for widgets that send axis motion, including the ones printLock used to miss", () => {
		for (const type of ["jog", "octopusJog", "extruder", "wcs", "wcsTable", "toolSelect",
			"toolAlign", "bedMesh", "bedTram", "xyzProbe", "probeRoutines", "probe", "surfacing", "toolpath"]) {
			expect(movesAxes({ type } as Widget)).toBe(true);
		}
	});
	it("is false for spindle (unsafe mid-print for other reasons, but no axis motion) and preflight (read-only)", () => {
		expect(movesAxes({ type: "spindle" } as Widget)).toBe(false);
		expect(movesAxes({ type: "preflight" } as Widget)).toBe(false);
	});
	it("is false for a plain read-out", () => {
		expect(movesAxes({ type: "value" } as Widget)).toBe(false);
	});
});

describe("fixedAxesFor", () => {
	it("returns null for jog/octopusJog - homed state is shown per-button, not as one widget-level check", () => {
		expect(fixedAxesFor({ type: "jog" } as Widget)).toBeNull();
		expect(fixedAxesFor({ type: "octopusJog" } as Widget)).toBeNull();
	});
	it("returns null for preflight - it has its own homed check over a caller-shaped snapshot", () => {
		expect(fixedAxesFor({ type: "preflight" } as Widget)).toBeNull();
	});
	it("returns E for extruder", () => {
		expect(fixedAxesFor({ type: "extruder" } as Widget)).toEqual(["E"]);
	});
	it("returns X/Y/Z for guided routines with no axis configuration of their own", () => {
		for (const type of ["toolSelect", "toolAlign", "bedMesh", "bedTram", "xyzProbe", "probeRoutines", "probe", "surfacing", "toolpath"]) {
			expect(fixedAxesFor({ type } as Widget)).toEqual(["X", "Y", "Z"]);
		}
	});
	it("uses wcs/wcsTable's own configured axes when set, uppercased", () => {
		expect(fixedAxesFor({ type: "wcs", axes: ["x", "y"] } as Widget)).toEqual(["X", "Y"]);
		expect(fixedAxesFor({ type: "wcsTable", axes: ["x", "y"] } as Widget)).toEqual(["X", "Y"]);
	});
	it("falls back to X/Y/Z for wcs/wcsTable when axes is unset or empty", () => {
		expect(fixedAxesFor({ type: "wcs" } as Widget)).toEqual(["X", "Y", "Z"]);
		expect(fixedAxesFor({ type: "wcsTable", axes: [] } as Widget)).toEqual(["X", "Y", "Z"]);
	});
});
