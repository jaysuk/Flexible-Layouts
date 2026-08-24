import { describe, expect, it } from "vitest";

import { labelFlexClass } from "../composables/useLabelPosition";

describe("labelFlexClass", () => {
	it("maps each explicit position to the flex-direction class that puts the FIRST child there", () => {
		expect(labelFlexClass("top", "bottom")).toBe("flex-column");
		expect(labelFlexClass("bottom", "top")).toBe("flex-column-reverse");
		expect(labelFlexClass("left", "top")).toBe("flex-row");
		expect(labelFlexClass("right", "top")).toBe("flex-row-reverse");
	});

	it("falls back to the caller's default when position is unset, so existing layouts don't move", () => {
		expect(labelFlexClass(undefined, "bottom")).toBe("flex-column-reverse");
		expect(labelFlexClass(undefined, "top")).toBe("flex-column");
	});
});
