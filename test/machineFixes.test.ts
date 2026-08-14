import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import { describeWidget, FREEFORM_WIDGETS } from "../src/widgets/registry";
import WidgetView from "../src/widgets/WidgetView.vue";

describe("extruder widget - no redundant default label", () => {
	it("has no default label, so the widget's own label span doesn't render", () => {
		const widget = createDefaultWidget("extruder");
		expect(widget.label).toBe("");
		const w = mountInDwc(WidgetView, { props: { widget } });
		expect(w.find(".ex-label").exists()).toBe(false);
	});

	it("the chrome title still falls back to the translated default (not blank)", () => {
		const widget = createDefaultWidget("extruder");
		expect(describeWidget(widget).title).toBe("plugins.flexibleLayouts.widgets.extruder");
	});

	it("a user-set label still renders on the widget itself", () => {
		const widget = { ...createDefaultWidget("extruder"), label: "Extruder 2" };
		const w = mountInDwc(WidgetView, { props: { widget } });
		expect(w.find(".ex-label").text()).toBe("Extruder 2");
	});
});

describe("wcsTable widget - default size fits every WCS row without scrolling", () => {
	it("defaults to a taller cell than before (was h:12, causing a visible scrollbar)", () => {
		const entry = FREEFORM_WIDGETS.find((e) => e.type === "wcsTable");
		expect(entry?.defaultSize.h).toBeGreaterThan(12);
	});

	it("renders all 9 workplace systems (G54..G59.3)", () => {
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("wcsTable") } });
		for (const code of ["G54", "G55", "G56", "G57", "G58", "G59", "G59.1", "G59.2", "G59.3"]) {
			expect(w.text()).toContain(code);
		}
	});
});

describe("toolAlign widget - step-distance select", () => {
	// jsdom/happy-dom don't compute real layout, so the visual truncation itself (the ".ta-step"
	// rule's max-width was too narrow for even the shortest option) can't be asserted here directly -
	// see the CSS comment in ToolAlignWidget.vue. This pins the underlying data the fix has to keep
	// working for: every step distance renders with its full, untruncated "N mm" title.
	it("offers every configured jog step with its full, untruncated label", () => {
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("toolAlign") } });
		const select = w.findComponent({ name: "VSelect" });
		expect(select.props("items")).toEqual([
			{ title: "0.01 mm", value: 0.01 },
			{ title: "0.05 mm", value: 0.05 },
			{ title: "0.1 mm", value: 0.1 },
			{ title: "0.5 mm", value: 0.5 },
			{ title: "1 mm", value: 1 },
		]);
	});
});
