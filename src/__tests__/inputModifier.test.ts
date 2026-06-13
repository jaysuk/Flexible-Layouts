import { describe, expect, it } from "vitest";

import { applyInputModifier, hasInputModifier, invertLinear } from "../util/inputModifier";

describe("hasInputModifier", () => {
	it("is false for empty / blank-field modifiers", () => {
		expect(hasInputModifier(undefined)).toBe(false);
		expect(hasInputModifier({})).toBe(false);
		expect(hasInputModifier({ scale: undefined, offset: undefined })).toBe(false);
		// Cleared number fields come through as "" via Vue's .number modifier.
		expect(hasInputModifier({ scale: "" as unknown as number })).toBe(false);
		expect(hasInputModifier({ expression: "   " })).toBe(false);
		expect(hasInputModifier({ map: [{ from: "", to: "" }] })).toBe(false);
	});

	it("is true when any part has an effect", () => {
		expect(hasInputModifier({ scale: 2 })).toBe(true);
		expect(hasInputModifier({ offset: 5 })).toBe(true);
		expect(hasInputModifier({ expression: "x*2" })).toBe(true);
		expect(hasInputModifier({ map: [{ from: "hot", to: "200" }] })).toBe(true);
	});
});

describe("applyInputModifier", () => {
	it("returns the value unchanged when there's no modifier", () => {
		expect(applyInputModifier(50)).toBe("50");
		expect(applyInputModifier("hello")).toBe("hello");
		expect(applyInputModifier("50.00", {})).toBe("50.00");
	});

	it("applies scale then offset", () => {
		expect(applyInputModifier(50, { scale: 0.01 })).toBe("0.5");
		expect(applyInputModifier(5, { scale: 2, offset: 1 })).toBe("11");
	});

	it("runs the expression after scale/offset (x = entered*scale+offset)", () => {
		// minutes -> seconds
		expect(applyInputModifier(2, { expression: "x * 60" })).toBe("120");
		// scale first (10*0.1=1) then expression (1+4=5)
		expect(applyInputModifier(10, { scale: 0.1, expression: "x + 4" })).toBe("5");
	});

	it("checks the map first, by exact entered text", () => {
		const mod = { map: [{ from: "hot", to: "200" }, { from: "cold", to: "0" }], scale: 999 };
		expect(applyInputModifier("hot", mod)).toBe("200");
		expect(applyInputModifier("cold", mod)).toBe("0");
		// no map hit -> numeric path still applies
		expect(applyInputModifier(2, mod)).toBe("1998");
	});

	it("passes non-numeric text through when nothing matches", () => {
		expect(applyInputModifier("abc", { scale: 2 })).toBe("abc");
	});

	it("sends the entered value untouched if the expression is malformed", () => {
		expect(applyInputModifier(5, { expression: "x +" })).toBe("5");
	});
});

describe("invertLinear", () => {
	it("inverts scale/offset for prefill", () => {
		expect(invertLinear(0.5, { scale: 0.01 })).toBe(50);
		expect(invertLinear(11, { scale: 2, offset: 1 })).toBe(5);
	});

	it("returns the value unchanged with no modifier", () => {
		expect(invertLinear(42)).toBe(42);
		expect(invertLinear(42, {})).toBe(42);
	});

	it("returns null when it can't be inverted", () => {
		expect(invertLinear(5, { expression: "x*2" })).toBeNull();
		expect(invertLinear(5, { map: [{ from: "a", to: "1" }] })).toBeNull();
		expect(invertLinear(5, { scale: 0 })).toBeNull();
	});
});
