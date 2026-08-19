import { describe, expect, it } from "vitest";

import { millimetresPerUnit, parseCssLength, parseViewBox } from "../model/vectorImport/svgUnits";

describe("parseCssLength", () => {
	it.each([
		["25.4mm", 25.4],
		["1in", 25.4],
		["96px", 25.4],
		["96", 25.4], // unitless is px, per the SVG spec's default
		["72pt", 25.4], // 1in = 72pt
		["6pc", 25.4], // 1in = 6pc
	])("%s -> %dmm", (input, expected) => {
		expect(parseCssLength(input)).toBeCloseTo(expected, 6);
	});

	it("Q is a quarter-millimetre, not related to inches", () => {
		expect(parseCssLength("40Q")).toBeCloseTo(10, 6);
	});

	it.each(["50%", "3em", ""])("%s has no fixed physical size -> null", (input) => {
		expect(parseCssLength(input)).toBeNull();
	});

	it("null/undefined -> null", () => {
		expect(parseCssLength(null)).toBeNull();
		expect(parseCssLength(undefined)).toBeNull();
	});
});

describe("parseViewBox", () => {
	it("parses whitespace-separated values", () => {
		expect(parseViewBox("0 0 200 100")).toEqual({ minX: 0, minY: 0, width: 200, height: 100 });
	});
	it("parses comma-separated values", () => {
		expect(parseViewBox("0,0,200,100")).toEqual({ minX: 0, minY: 0, width: 200, height: 100 });
	});
	it("rejects a non-positive width or height", () => {
		expect(parseViewBox("0 0 0 100")).toBeNull();
		expect(parseViewBox("0 0 -200 100")).toBeNull();
	});
	it("rejects malformed input", () => {
		expect(parseViewBox("nope")).toBeNull();
		expect(parseViewBox(null)).toBeNull();
	});
});

describe("millimetresPerUnit", () => {
	it("scales by the viewBox, not the raw width attribute", () => {
		// 200 user units span 100mm - half a millimetre per unit, not 1.
		expect(millimetresPerUnit("100mm", "50mm", "0 0 200 100")).toEqual({ mm: 0.5, declared: true });
	});

	it("falls back to 96px/inch with a warning when nothing is declared at all", () => {
		const result = millimetresPerUnit(null, null, null);
		expect(result.mm).toBeCloseTo(25.4 / 96, 10);
		expect(result.declared).toBe(false);
		expect(result.warning).toBeTruthy();
	});

	it("without a viewBox, one user unit is exactly one px regardless of declared physical size", () => {
		const result = millimetresPerUnit("100mm", "50mm", null);
		expect(result.mm).toBeCloseTo(25.4 / 96, 10);
		expect(result.declared).toBe(true);
	});

	it("a degenerate (zero-width) viewBox falls back cleanly - never NaN or Infinity", () => {
		const result = millimetresPerUnit("100mm", "50mm", "0 0 0 100");
		expect(Number.isFinite(result.mm)).toBe(true);
	});

	// `declared` means "the file stated a PHYSICAL size", and it is what decides whether the panel
	// shows its "this file does not state its size" banner. Both cases below look like a declared size
	// to a naive check but are really the 96px/inch guess, and getting either wrong suppresses the one
	// warning that stands between the operator and a part cut at 25.4x the intended scale.
	it("a percentage width is NOT a declared size - it describes the container, not the part", () => {
		// Annotated as a real tuple type rather than `as const`: spreading a UNION of readonly tuples
		// into a call is something TypeScript refuses outright ("a spread argument must either have a
		// tuple type or be passed to a rest parameter").
		const cases: Array<[string, string, string | null]> = [
			["50%", "30%", null],
			["50%", "30%", "0 0 200 100"],
		];
		for (const args of cases) {
			const result = millimetresPerUnit(...args);
			expect(result.declared).toBe(false);
			expect(result.warning).toBeTruthy();
			expect(Number.isFinite(result.mm)).toBe(true);
		}
	});

	it("a unitless (bare px) width is NOT a declared size either, and warns", () => {
		const noBox = millimetresPerUnit("100", "50", null);
		expect(noBox.declared).toBe(false);
		expect(noBox.warning).toBeTruthy();
		expect(noBox.mm).toBeCloseTo(25.4 / 96, 10);

		// Still scales by the viewBox correctly, it just isn't a *physical* statement.
		const withBox = millimetresPerUnit("200", "100", "0 0 200 100");
		expect(withBox.declared).toBe(false);
		expect(withBox.mm).toBeCloseTo(25.4 / 96, 10);
	});

	it("a real unit suffix IS a declared size, with no warning", () => {
		const result = millimetresPerUnit("100mm", "50mm", "0 0 200 100");
		expect(result.declared).toBe(true);
		expect(result.warning).toBeUndefined();
	});

	it("a negative-width viewBox falls back cleanly - never NaN or Infinity", () => {
		const result = millimetresPerUnit("100mm", "50mm", "0 0 -200 100");
		expect(Number.isFinite(result.mm)).toBe(true);
	});
});
