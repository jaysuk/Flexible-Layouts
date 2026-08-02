import { describe, expect, it } from "vitest";

import { heightmapValue, parseProbeReply } from "../model/bedMesh/probeReply";

describe("parseProbeReply", () => {
	it("parses RRF's 'Stopped at height <n> mm' reply", () => {
		expect(parseProbeReply("Stopped at height 2.345 mm")).toEqual({ stopHeight: 2.345 });
	});

	it("parses a negative stop height (typical for an inductive/BLTouch probe near its trigger point)", () => {
		expect(parseProbeReply("Stopped at height -13.245 mm")).toEqual({ stopHeight: -13.245 });
	});

	it("parses an integer stop height with no decimal point", () => {
		expect(parseProbeReply("Stopped at height 0 mm")).toEqual({ stopHeight: 0 });
	});

	it("is tolerant of surrounding text (echoed command, trailing newline)", () => {
		expect(parseProbeReply("G30 S-1\nStopped at height 1.500 mm\n")).toEqual({ stopHeight: 1.5 });
	});

	// The whole point of returning null rather than a fabricated value: a failed trigger must be
	// distinguishable from "triggered at 0.000", and must never silently write a stale reading.
	it("returns null for a probe-not-triggered error reply", () => {
		expect(parseProbeReply("Error: Probe was not triggered during probing move")).toBeNull();
	});

	it("returns null for an unrelated reply", () => {
		expect(parseProbeReply("ok")).toBeNull();
		expect(parseProbeReply("")).toBeNull();
	});
});

describe("heightmapValue", () => {
	// The formula this whole module exists to get right, verified against RRF's own grid-probing
	// arithmetic (GCodes4.cpp: g30zHeightError = g30zStoppedHeight - triggerHeight).
	it("subtracts the trigger height from the raw stop height", () => {
		expect(heightmapValue(-13.2, -13.3)).toBeCloseTo(0.1, 6);
	});

	// The regression this guards against: storing the raw stop height bakes the whole trigger height
	// (commonly ~10-15mm) into the cell instead of a small error. A near-trigger-height stop height
	// must yield a value close to zero, not close to the trigger height itself.
	it("a stop height near the trigger height yields a near-zero map value, not the trigger height itself", () => {
		const value = heightmapValue(-13.245, -13.3);
		expect(Math.abs(value)).toBeLessThan(1);
	});

	it("is symmetric: a stop height further from the bed than the trigger height gives a positive error", () => {
		expect(heightmapValue(-13.0, -13.3)).toBeCloseTo(0.3, 6);
	});
});
