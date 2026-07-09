import { describe, expect, it } from "vitest";
import { dwc } from "dwc-plugin-test-kit";

import { resetToDefaults } from "../src/model/reset";

describe("resetToDefaults", () => {
	it("wipes the entire flexibleLayouts settings container, including the access-lock config", async () => {
		const plugins = dwc.settings.plugins as Record<string, unknown>;
		plugins.flexibleLayouts = {
			profiles: { a: { meta: { name: "A" } } },
			activeProfile: "a",
			access: { observerEnabled: true, adminHash: "deadbeef" },
		};
		await resetToDefaults();
		expect(plugins.flexibleLayouts).toBeUndefined();
	});

	// The localStorage-wiping loop itself isn't covered here: this test environment's `localStorage`
	// (both the bare global and window.localStorage) is non-functional - it collides with Node's own
	// native implementation, which needs a --localstorage-file flag this project doesn't set. The
	// settings-container wipe above and the cache-flag reset below exercise the higher-risk logic;
	// the localStorage loop itself is a simple filter-by-prefix-and-remove reviewed by hand.
	it("suppresses the welcome dialog but resets the activate-prompt flag", async () => {
		await resetToDefaults();
		expect(dwc.cache.flexibleLayouts.seenWelcome).toBe(true);
		expect(dwc.cache.flexibleLayouts.promptedActivate).toBe(false);
	});

	// The test stubs for useSettingsStore()/useCacheStore() don't implement save() (a real DWC-only
	// concern - debounced board persistence), so this only proves resetToDefaults() doesn't throw or
	// hang when save is absent (the exact scenario the optional-chaining is for), not that a real
	// save() actually gets awaited. That part is covered by manual review: model/reset.ts's two
	// `await (...).save?.()` calls, straight after the mutations, before the function returns.
	it("resolves cleanly even when the store has no save() to call (matches the test stub)", async () => {
		await expect(resetToDefaults()).resolves.toBeUndefined();
	});
});
