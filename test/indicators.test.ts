import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";
import { describe, expect, it } from "vitest";

import WidgetView from "../src/widgets/WidgetView.vue";
import type { Widget } from "../src/model/document";

function indicatorsWidget(items: NonNullable<Extract<Widget, { type: "indicators" }>["items"]>): Widget {
	return { type: "indicators", items };
}

describe("Indicators comparison operators", () => {
	it("with no operator set, keeps the original truthy/falsy behaviour (regression)", () => {
		setModel(loadObjectModel(undefined, { overrides: { sensors: { probes: [{ value: [0] }] } } }));
		const w = mountInDwc(WidgetView, {
			props: { widget: indicatorsWidget([{ label: "Probe", omPath: "sensors.probes[0].value[0]" }]) },
		});
		// 0 is falsy -> off (grey), matching truthy()'s number > 0 rule. Both on/off render a solid
		// dot; colour is what distinguishes the states (see IndicatorsWidget.vue).
		expect(w.html()).toContain("text-grey");
	});

	it("with an operator set, compares against `value` instead of using plain truthy/falsy", () => {
		setModel(loadObjectModel(undefined, { overrides: { sensors: { probes: [{ value: [0] }] } } }));
		const w = mountInDwc(WidgetView, {
			props: {
				widget: indicatorsWidget([
					{ label: "Probe", omPath: "sensors.probes[0].value[0]", operator: "eq", value: 0 },
				]),
			},
		});
		// 0 is falsy, but operator "eq" 0 matches -> on, proving the operator path is actually used
		// instead of falling through to truthy().
		expect(w.html()).toContain("mdi-circle");
		expect(w.html()).not.toContain("text-grey");
	});
});
