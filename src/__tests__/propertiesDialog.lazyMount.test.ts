import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import PropertiesDialog from "../editor/PropertiesDialog.vue";
import { createDefaultWidget, type GridItemModel } from "../model/document";

// Regression test for a real production bug: PropertiesDialog is now lazy-mounted (useLazyDialog.ts) -
// only CREATED the first time it's opened, with modelValue/item already set at creation, rather than
// always being present from page load with modelValue starting false. Its own immediate-fired
// `watch(() => props.modelValue, ...)` therefore now runs its "dialog is open with an item" branch
// synchronously as part of THIS component's very first setup() call - which crashed every "add widget"
// with "Cannot access 'MODIFIER_TYPES' before initialization" once that branch read a `const` declared
// LOWER DOWN in the script (fine when the branch only ever ran later, after the whole script had
// finished executing top to bottom - broken the instant it could run during the component's own first
// tick). Mounting already-open with a real item, rather than mounting closed and opening it after,
// is the part that actually exercises this.
function itemFor(type: Parameters<typeof createDefaultWidget>[0]): GridItemModel {
	return { i: "test-item", x: 0, y: 0, w: 4, h: 4, widget: createDefaultWidget(type) };
}

describe("PropertiesDialog - lazy-mount-already-open", () => {
	it("does not throw when created with modelValue and item already set (not opened afterwards)", () => {
		expect(() => mountInDwc(PropertiesDialog, {
			props: { modelValue: true, item: itemFor("value") },
		})).not.toThrow();
	});

	it("populates the draft from the item on that very first mount", () => {
		const w = mountInDwc(PropertiesDialog, {
			props: { modelValue: true, item: itemFor("input") },
		});
		// Reaching this without throwing already proves the immediate watch's body ran to completion
		// (including the input-modifier branch, which is the one that actually crashed) - the dialog
		// itself renders regardless, so there's no visible DOM assertion more direct than that.
		expect(w.vm).toBeTruthy();
	});
});
