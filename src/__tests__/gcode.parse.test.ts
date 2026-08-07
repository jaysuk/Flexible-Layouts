import { describe, expect, it } from "vitest";

import { parseGcode } from "../model/gcode/parse";

describe("parseGcode - straight moves", () => {
	it("computes a cutting move's distance/time and byte offset", () => {
		const text = "G21\nG90\nG1 X10 Y10 F600\n";
		const result = parseGcode(text);
		const last = result.vertices.at(-1)!;
		expect(last).toMatchObject({ x: 10, y: 10, z: 0, kind: "cut" });
		// Offset must land on the G1 line's own start, not mid-line or on an earlier modal-only line.
		expect(last.offset).toBe(new TextEncoder().encode("G21\nG90\n").length);
		const dist = Math.hypot(10, 10);
		expect(result.cutSeconds).toBeCloseTo((dist / 600) * 60, 6);
		expect(result.maxFeed).toBe(600);
	});

	it("continues the last motion mode across lines with only axis words", () => {
		const text = "G90\nG1 X10 F500\nY20\n";
		const result = parseGcode(text);
		expect(result.vertices.map((v) => [v.x, v.y, v.kind])).toEqual([
			[0, 0, "rapid"], [10, 0, "cut"], [10, 20, "cut"],
		]);
	});

	it("does not move on a pure modal-setting line even while a motion mode is active", () => {
		const text = "G90\nG1 X10 F500\nG91\nG1 X0\n";
		const result = parseGcode(text);
		// G91 alone has no axis word, so it must not add a vertex; the final G1 X0 is a real
		// (zero-length in this case) incremental move and is also skipped since dist === 0.
		expect(result.vertices).toHaveLength(2); // implicit start + the one real X10 move
	});

	it("tracks a rapid's length untimed and extends the bounding box", () => {
		const result = parseGcode("G90\nG0 X50 Y0 Z10\n");
		expect(result.rapidLength).toBeCloseTo(Math.hypot(50, 0, 10), 6);
		expect(result.cutSeconds).toBe(0);
		expect(result.max).toMatchObject({ x: 50, y: 0, z: 10 });
	});

	it("converts G20 inch values to mm internally, including the feed rate", () => {
		const result = parseGcode("G20\nG90\nG1 X1 F10\n");
		const last = result.vertices.at(-1)!;
		expect(last.x).toBeCloseTo(25.4, 6);
		expect(result.maxFeed).toBeCloseTo(254, 6);
	});

	it("applies G91 relative moves on top of the current position", () => {
		const result = parseGcode("G90\nG1 X10 F500\nG91\nG1 X5\n");
		expect(result.vertices.at(-1)).toMatchObject({ x: 15 });
	});

	it("warns once (not per line) when cutting moves have no feed rate set", () => {
		const result = parseGcode("G90\nG1 X10\nG1 X20\n");
		expect(result.warnings).toHaveLength(1);
		expect(result.cutSeconds).toBe(0);
	});

	it("dedupes tool and spindle-speed selections in first-seen order", () => {
		const result = parseGcode("T1\nM3 S12000\nG90\nG1 X10 F500\nM3 S12000\nM4 S8000\nT2\nT1\n");
		expect(result.tools).toEqual([1, 2]);
		expect(result.spindleSpeeds).toEqual([12000, 8000]);
	});
});

describe("parseGcode - rapids and minRapidZ", () => {
	it("ignores a vertical-only rapid retract", () => {
		const result = parseGcode("G90\nG0 Z10\n"); // pure Z lift, no XY travel
		expect(result.minRapidZ).toBeNull();
	});

	it("records the lower Z of a rapid that also travels in XY", () => {
		const result = parseGcode("G90\nG0 Z10\nG0 X10 Z-5\n");
		expect(result.minRapidZ).toBe(-5);
	});
});

describe("parseGcode - arcs (G2/G3)", () => {
	it("tessellates a CW quarter circle onto the true radius within a tight tolerance", () => {
		// Start (10,0), centre (0,0) via I-10 J0, end (0,-10) - a clockwise quarter turn.
		const result = parseGcode("G90\nG1 X10 Y0 F600\nG2 X0 Y-10 I-10 J0 F600\n");
		const arcVerts = result.vertices.slice(2); // implicit start + the G1 setup move
		expect(arcVerts.length).toBeGreaterThan(5);
		for (const v of arcVerts) {
			expect(Math.hypot(v.x, v.y)).toBeCloseTo(10, 6);
		}
		const last = arcVerts.at(-1)!;
		expect(last.x).toBeCloseTo(0, 6);
		expect(last.y).toBeCloseTo(-10, 6);
	});

	it("tessellates a full circle (I/J form, start === end) all the way around", () => {
		const result = parseGcode("G90\nG1 X10 Y0 F600\nG2 I-10 J0 F600\n");
		const arcVerts = result.vertices.slice(2);
		expect(arcVerts.length).toBeGreaterThan(30);
		expect(arcVerts.at(-1)!.x).toBeCloseTo(10, 4);
		expect(arcVerts.at(-1)!.y).toBeCloseTo(0, 4);
	});

	it("supports R-form arcs and helical Z motion in the same move", () => {
		// Same CW quarter as above, expressed with R10 instead of I/J, ramping Z from 0 to -2.
		const result = parseGcode("G90\nG1 X10 Y0 F600\nG2 X0 Y-10 Z-2 R10 F600\n");
		const arcVerts = result.vertices.slice(2);
		for (const v of arcVerts) {
			expect(Math.hypot(v.x, v.y)).toBeCloseTo(10, 3);
		}
		expect(arcVerts.at(-1)!.z).toBeCloseTo(-2, 6);
	});
});
