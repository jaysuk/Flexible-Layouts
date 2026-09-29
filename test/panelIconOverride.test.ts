import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import FlexGridItem from "../src/page/FlexGridItem.vue";
import { createDefaultWidget, type GridItemModel } from "../src/model/document";
import { describeWidget } from "../src/widgets/registry";

function item(extra: Partial<GridItemModel> = {}): GridItemModel {
	return { i: "a", x: 0, y: 0, w: 4, h: 4, widget: createDefaultWidget("value"), ...extra };
}

// The header bar (edit mode) shows drag handle + the panel icon; the icon override must replace the
// widget type's default so several panels of one type can be told apart.
function headerIcons(icon?: string): Array<string> {
	const w = mountInDwc(FlexGridItem, { props: { item: item({ icon }), editMode: true } });
	return w.findAll(".flex-item-header .v-icon").map((n) => n.classes().find((c) => c.startsWith("mdi-")) ?? "");
}

describe("per-panel icon override", () => {
	it("shows the widget type's default icon when no override is set", () => {
		expect(headerIcons()).toContain(describeWidget(createDefaultWidget("value")).icon);
	});

	it("shows the override instead of the default", () => {
		const icons = headerIcons("mdi-rocket-launch");
		expect(icons).toContain("mdi-rocket-launch");
		expect(icons).not.toContain(describeWidget(createDefaultWidget("value")).icon);
	});
});
