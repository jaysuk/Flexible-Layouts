import { describe, expect, it } from "vitest";

import { shouldShowWhatsNew } from "../model/whatsNew";

describe("shouldShowWhatsNew", () => {
	it("is false when lastSeenVersion has never been seeded (true first run, or a pre-feature upgrade)", () => {
		expect(shouldShowWhatsNew("1.8.0", null)).toBe(false);
	});

	it("is true when the installed version is newer than the last-seen one", () => {
		expect(shouldShowWhatsNew("1.8.0", "1.7.0")).toBe(true);
	});

	it("is false when the installed version equals the last-seen one", () => {
		expect(shouldShowWhatsNew("1.7.0", "1.7.0")).toBe(false);
	});

	it("is false when the installed version is somehow older (e.g. a manual downgrade)", () => {
		expect(shouldShowWhatsNew("1.6.0", "1.7.0")).toBe(false);
	});
});
