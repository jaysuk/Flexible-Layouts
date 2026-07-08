import { describe, expect, it } from "vitest";

import { createProfile, ensureProfiles } from "../src/model/store";

/**
 * Both paths that hand a user a brand-new document (a fresh install with no profiles yet, and
 * explicitly adding a profile from the UI) must seed the header with the edit-mode toggle - otherwise
 * that profile has no way back into edit mode from the top bar at all. The normal seeding path (the
 * v3->v4 migration step) only runs on documents BELOW the current schema version, and a freshly
 * created document is already stamped at the current one, so it silently never applies there.
 */
describe("new documents get an editable header", () => {
	it("createProfile seeds the header with the edit-mode toggle and the rest of the default chrome", () => {
		const id = createProfile("New profile");
		const { profiles } = ensureProfiles();
		const types = profiles[id].header?.items.map((it) => it.widget.type) ?? [];
		expect(types).toContain("editModeToggle");
		expect(types).toContain("accessChip");
		expect(types).toContain("codeInput");
		expect(types).toContain("uploadButton");
	});

	it("ensureProfiles seeds the header when bootstrapping a fresh install with no profiles at all", () => {
		const { profiles, active } = ensureProfiles();
		const types = profiles[active].header?.items.map((it) => it.widget.type) ?? [];
		expect(types).toContain("editModeToggle");
	});
});
