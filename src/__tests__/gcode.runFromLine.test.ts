import { describe, expect, it } from "vitest";

import { buildResumePreamble } from "../model/gcode/runFromLine";
import { modalStateAt } from "../model/gcode/modalState";

function state(patch: Partial<Parameters<typeof buildResumePreamble>[0]> = {}) {
	return {
		units: "mm" as const, plane: 17 as const, absolute: true, wcs: null, tool: null,
		spindleDirection: "off" as const, spindleRpm: 0, feed: 0,
		coolantMist: false, coolantFlood: false, x: 0, y: 0, z: 0,
		...patch,
	};
}

describe("buildResumePreamble", () => {
	it("builds a minimal preamble with sane defaults (nothing selected, spindle off, no coolant)", () => {
		const cmd = buildResumePreamble(state(), { offset: 1234, safeZ: 10, currentTool: null });
		expect(cmd).toBe([
			"G21", "G17", "M5", "M9", "G90", "G0 Z10", "G0 X0 Y0", "G90", "M26 S1234", "M24",
		].join("\n"));
	});

	it("restores G91 (not G90) before M24 when the file was in incremental mode at the resume point", () => {
		const cmd = buildResumePreamble(state({ absolute: false }), { offset: 0, safeZ: 5, currentTool: null });
		const lines = cmd.split("\n");
		// The forced G90 for the safety moves must appear, but the LAST distance-mode word before
		// M26/M24 must be G91, matching the file's actual state at the resume point.
		expect(lines.indexOf("G90")).toBeGreaterThanOrEqual(0);
		expect(lines[lines.indexOf("M26 S0") - 1]).toBe("G91");
	});

	it("reissues T<n> when it differs from the currently-selected tool", () => {
		const cmd = buildResumePreamble(state({ tool: 2 }), { offset: 0, safeZ: 5, currentTool: 1 });
		expect(cmd).toContain("T2");
	});

	it("does NOT reissue T<n> when it matches the currently-selected tool (avoids a pointless tool change)", () => {
		const cmd = buildResumePreamble(state({ tool: 2 }), { offset: 0, safeZ: 5, currentTool: 2 });
		expect(cmd).not.toMatch(/\bT2\b/);
	});

	it("reissues T<n> when the current tool is unknown, erring toward correctness over convenience", () => {
		const cmd = buildResumePreamble(state({ tool: 2 }), { offset: 0, safeZ: 5, currentTool: null });
		expect(cmd).toContain("T2");
	});

	it("selects the WCS before the safety moves, and restores it ahead of everything coordinate-dependent", () => {
		const cmd = buildResumePreamble(state({ wcs: "G56" }), { offset: 0, safeZ: 5, currentTool: null });
		const lines = cmd.split("\n");
		expect(lines[0]).toBe("G21");
		expect(lines.indexOf("G56")).toBeLessThan(lines.indexOf("G0 Z5"));
	});

	it("emits M3/M4 with the commanded RPM, matching direction", () => {
		expect(buildResumePreamble(state({ spindleDirection: "cw", spindleRpm: 12000 }), { offset: 0, safeZ: 5, currentTool: null })).toContain("M3 S12000");
		expect(buildResumePreamble(state({ spindleDirection: "ccw", spindleRpm: 8000 }), { offset: 0, safeZ: 5, currentTool: null })).toContain("M4 S8000");
	});

	it("emits M8 over M7 when flood coolant is on (flood takes priority in the mutually-exclusive check)", () => {
		const cmd = buildResumePreamble(state({ coolantFlood: true, coolantMist: true }), { offset: 0, safeZ: 5, currentTool: null });
		expect(cmd).toContain("M8");
		expect(cmd).not.toContain("M7");
	});

	it("restores the modal feed (no move word) only when a feed was ever set", () => {
		const withFeed = buildResumePreamble(state({ feed: 800 }), { offset: 0, safeZ: 5, currentTool: null });
		expect(withFeed).toContain("G1 F800");
		const withoutFeed = buildResumePreamble(state({ feed: 0 }), { offset: 0, safeZ: 5, currentTool: null });
		expect(withoutFeed).not.toMatch(/\bF\d/);
	});

	it("moves to the safe Z and the resume point's X/Y, in that order (Z first)", () => {
		const cmd = buildResumePreamble(state({ x: 12, y: -5 }), { offset: 0, safeZ: 20, currentTool: null });
		const lines = cmd.split("\n");
		const zIdx = lines.indexOf("G0 Z20");
		const xyIdx = lines.indexOf("G0 X12 Y-5");
		expect(zIdx).toBeGreaterThanOrEqual(0);
		expect(xyIdx).toBeGreaterThan(zIdx);
	});

	it("seeks to the exact requested offset", () => {
		const cmd = buildResumePreamble(state(), { offset: 98765, safeZ: 5, currentTool: null });
		expect(cmd).toContain("M26 S98765");
	});
});

describe("buildResumePreamble + modalStateAt integration - a realistic multi-tool, multi-coolant file", () => {
	const file = [
		"G21", "G90", "G54",
		"T1", "M3 S15000", "M8",
		"G1 X10 Y10 F1000",
		"G1 X20 Y20", // resume point: byte offset of this line
		"G1 X30 Y30",
		"M5", "M9",
	].join("\n") + "\n";

	it("reconstructs a preamble that would put the machine back exactly where the file expects, mid-job", () => {
		const marker = "G1 X20 Y20";
		const offset = new TextEncoder().encode(file.slice(0, file.indexOf(marker))).length;
		const st = modalStateAt(file, offset);
		const cmd = buildResumePreamble(st, { offset, safeZ: 15, currentTool: null });

		expect(cmd).toContain("G54");
		expect(cmd).toContain("T1");
		expect(cmd).toContain("M3 S15000");
		expect(cmd).toContain("M8");
		expect(cmd).toContain("G1 F1000");
		expect(cmd).toContain("G0 X10 Y10"); // position after the FIRST move, before the resume line
		expect(cmd).toContain(`M26 S${offset}`);
	});

	it("skips the tool change when the resuming operator already has T1 loaded", () => {
		const marker = "G1 X20 Y20";
		const offset = new TextEncoder().encode(file.slice(0, file.indexOf(marker))).length;
		const st = modalStateAt(file, offset);
		const cmd = buildResumePreamble(st, { offset, safeZ: 15, currentTool: 1 });
		expect(cmd).not.toMatch(/\bT1\b/);
	});
});
