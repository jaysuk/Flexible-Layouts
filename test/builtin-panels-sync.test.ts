import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BUILTIN_PANELS } from "../src/widgets/registry";

/**
 * BuiltInPanelWidget.vue dispatches on `component` with explicit tags rather than a dynamic
 * `<component :is>` (so panels resolve in both the in-tree dev build and the external ZIP's runtime
 * global-registration path - see the comment at the top of that file). That means every catalog
 * entry needs a matching branch there by hand, and a missing one doesn't throw or warn - it just
 * silently falls through to the "panel missing" message. This is the net that would have caught
 * CNCAxesPosition being cataloged but never wired into the dispatch.
 */
describe("BuiltInPanelWidget stays in sync with the BUILTIN_PANELS catalog", () => {
	const source = readFileSync(
		resolve(__dirname, "../src/widgets/BuiltInPanelWidget.vue"),
		"utf8",
	);

	for (const entry of BUILTIN_PANELS) {
		it(`has a render branch for ${entry.component}`, () => {
			expect(source).toContain(`component === '${entry.component}'`);
		});
	}
});
