import { describe, expect, it } from "vitest";
import { mountInDwc, setConnected } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import { FREEFORM_WIDGETS } from "../src/widgets/registry";
import WidgetView from "../src/widgets/WidgetView.vue";

/**
 * Self-maintaining smoke test: mount EVERY freeform widget (from the registry) with its default
 * config and assert it renders without throwing. Any widget added to the catalogue is covered
 * automatically. This is the net that would have caught the colour-picker crash and the TDZ.
 */
describe("every widget mounts without throwing", () => {
	for (const entry of FREEFORM_WIDGETS) {
		it(`mounts: ${entry.type}`, () => {
			const widget = createDefaultWidget(entry.type);
			const wrapper = mountInDwc(WidgetView, { props: { widget } });
			expect(wrapper.exists()).toBe(true);
			wrapper.unmount();
		});
	}

	// The same widgets must also survive the "no machine connected" path.
	for (const entry of FREEFORM_WIDGETS) {
		it(`mounts while disconnected: ${entry.type}`, () => {
			setConnected(false);
			const wrapper = mountInDwc(WidgetView, { props: { widget: createDefaultWidget(entry.type) } });
			expect(wrapper.exists()).toBe(true);
			wrapper.unmount();
		});
	}
});
