import { describe, expect, it } from "vitest";

import { PLUGIN_ASSET_PATTERN } from "../model/updateCheck";

describe("PLUGIN_ASSET_PATTERN", () => {
	it("matches the real installable plugin zip", () => {
		expect(PLUGIN_ASSET_PATTERN.test("FlexibleLayouts-1.8.0.zip")).toBe(true);
	});

	it("rejects DuetWebControl's separate sourcemap zip, so it's never picked as the update asset", () => {
		expect(PLUGIN_ASSET_PATTERN.test("FlexibleLayouts-1.8.0-srcmap.zip")).toBe(false);
	});

	it("still matches a prerelease-tagged version (a dash before the version, not before .zip)", () => {
		expect(PLUGIN_ASSET_PATTERN.test("FlexibleLayouts-1.9.0-beta.1.zip")).toBe(true);
	});

	it("rejects an unrelated asset from another plugin/repo", () => {
		expect(PLUGIN_ASSET_PATTERN.test("SomeOtherPlugin-1.0.0.zip")).toBe(false);
	});

	it("rejects a non-zip asset even if it starts right", () => {
		expect(PLUGIN_ASSET_PATTERN.test("FlexibleLayouts-1.8.0.tar.gz")).toBe(false);
	});

	it("picks the real zip first regardless of which order GitHub lists the two assets in", () => {
		const namesInOrder = ["FlexibleLayouts-1.8.0-srcmap.zip", "FlexibleLayouts-1.8.0.zip"];
		expect(namesInOrder.find((n) => PLUGIN_ASSET_PATTERN.test(n))).toBe("FlexibleLayouts-1.8.0.zip");

		const reversed = ["FlexibleLayouts-1.8.0.zip", "FlexibleLayouts-1.8.0-srcmap.zip"];
		expect(reversed.find((n) => PLUGIN_ASSET_PATTERN.test(n))).toBe("FlexibleLayouts-1.8.0.zip");
	});
});
