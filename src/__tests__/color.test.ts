import { describe, expect, it } from "vitest";

import { isCssColor, resolveColor } from "../util/color";

describe("isCssColor", () => {
	it("recognises literal CSS colours", () => {
		expect(isCssColor("#fff")).toBe(true);
		expect(isCssColor("#ff8800")).toBe(true);
		expect(isCssColor("rgb(1,2,3)")).toBe(true);
		expect(isCssColor("hsl(200,50%,50%)")).toBe(true);
		expect(isCssColor("  #abc")).toBe(true);
	});

	it("treats theme-token names as not-literal", () => {
		expect(isCssColor("primary")).toBe(false);
		expect(isCssColor("warning")).toBe(false);
		expect(isCssColor("grey")).toBe(false);
	});
});

describe("resolveColor", () => {
	it("maps theme tokens to the live theme variable", () => {
		expect(resolveColor("primary")).toBe("rgb(var(--v-theme-primary))");
		expect(resolveColor("warning")).toBe("rgb(var(--v-theme-warning))");
	});

	it("returns literal colours unchanged (trimmed)", () => {
		expect(resolveColor("#ff8800")).toBe("#ff8800");
		expect(resolveColor("  #abc ")).toBe("#abc");
		expect(resolveColor("rgb(1,2,3)")).toBe("rgb(1,2,3)");
	});

	it("falls back to the given token when empty", () => {
		expect(resolveColor(undefined)).toBe("rgb(var(--v-theme-primary))");
		expect(resolveColor("")).toBe("rgb(var(--v-theme-primary))");
		expect(resolveColor(undefined, "secondary")).toBe("rgb(var(--v-theme-secondary))");
	});
});
