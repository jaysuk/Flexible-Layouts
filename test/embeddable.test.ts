import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import type { Widget } from "../src/model/document";
import EmbeddableWidget from "../src/widgets/EmbeddableWidget.vue";
import WidgetView from "../src/widgets/WidgetView.vue";

/**
 * The embeddable-component widget renders a component another plugin published via
 * registerEmbeddableComponent. With no such plugin loaded (the case in tests — the UI-store stub
 * has no registry) it must fall back to the "needs plugin" placeholder rather than throwing.
 */
describe("EmbeddableWidget", () => {
	const widget = { type: "embeddable", id: "Demo.Card", pluginId: "Demo", label: "Demo card" } as Extract<Widget, { type: "embeddable" }>;

	it("renders the missing-plugin placeholder when the component isn't registered", () => {
		const wrapper = mountInDwc(EmbeddableWidget, { props: { widget } });
		expect(wrapper.exists()).toBe(true);
		expect(wrapper.find(".v-alert").exists()).toBe(true);
		wrapper.unmount();
	});

	it("dispatches via WidgetView without throwing", () => {
		const wrapper = mountInDwc(WidgetView, { props: { widget } });
		expect(wrapper.exists()).toBe(true);
		wrapper.unmount();
	});
});
