import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import HeaterWidget from "../widgets/HeaterWidget.vue";
import type { Widget } from "../model/document";

// Regression: a grid item's Conditional behaviour rule (FlexGridItem.vue's evaluateConditions ->
// WidgetView's `overrideColor` prop) had zero visible effect on this widget - WidgetView.vue never
// passed the prop through at all, and even the widget's own static `color` setting only ever tinted
// the preset buttons, never the live temperature reading a "recolour when overheating" rule is
// actually meant to highlight.
function baseWidget(overrides: Partial<Extract<Widget, { type: "heater" }>> = {}): Extract<Widget, { type: "heater" }> {
	return { type: "heater", label: "Bed", omPath: "heat.heaters[0]", presets: [60, 100], ...overrides };
}

function readingColor(wrapper: ReturnType<typeof mountInDwc>): string {
	return (wrapper.find(".ht-cur").element as HTMLElement).style.color;
}

describe("HeaterWidget - conditional-behaviour colour override", () => {
	it("the reading has no inline colour when neither widget.color nor overrideColor is set", () => {
		const wrapper = mountInDwc(HeaterWidget, { props: { widget: baseWidget() } });
		expect(readingColor(wrapper)).toBe("");
	});

	it("falls back to the widget's own configured colour for the reading", () => {
		const wrapper = mountInDwc(HeaterWidget, { props: { widget: baseWidget({ color: "#ff0000" }) } });
		expect(readingColor(wrapper)).toBe("#ff0000");
	});

	it("overrideColor (a matching Conditional behaviour rule) takes precedence over widget.color", () => {
		const wrapper = mountInDwc(HeaterWidget, {
			props: { widget: baseWidget({ color: "#ff0000" }), overrideColor: "#00ff00" },
		});
		expect(readingColor(wrapper)).toBe("#00ff00");
	});

	it("overrideColor alone (no widget.color set) still recolours the reading", () => {
		const wrapper = mountInDwc(HeaterWidget, { props: { widget: baseWidget(), overrideColor: "warning" } });
		expect(readingColor(wrapper)).toBe("rgb(var(--v-theme-warning))");
	});

	it("also drives the preset buttons, same as widget.color did before (no regression there)", () => {
		const wrapper = mountInDwc(HeaterWidget, { props: { widget: baseWidget(), overrideColor: "#00ff00" } });
		const presetBtn = wrapper.findAll("button").find((b) => b.text().includes("60"));
		expect((presetBtn?.element as HTMLElement).style.color).toBe("#00ff00");
	});
});
