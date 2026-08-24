import { flushPromises } from "@vue/test-utils";
import { mountInDwc } from "dwc-plugin-test-kit";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultWidget } from "../model/document";
import { WHATS_NEW_WIDGET_HIGHLIGHTS } from "../model/whatsNewWidgets";
import WhatsNewDialog from "../editor/WhatsNewDialog.vue";

const HIGHLIGHTED_VERSION = "9.9.9-test";

afterEach(() => {
	delete WHATS_NEW_WIDGET_HIGHLIGHTS[HIGHLIGHTED_VERSION];
});

// attach: true keeps v-dialog's content in the local DOM tree instead of teleporting to <body> - see
// GcodeFilePickerDialog.vue's own tests/comment for why VTU can't otherwise see it.
async function mountDialog(entries: Array<{ version: string; name: string; notes: string }>) {
	const w = mountInDwc(WhatsNewDialog, { props: { attach: true, modelValue: false, entries } });
	await w.setProps({ modelValue: true });
	await flushPromises();
	return w;
}

describe("WhatsNewDialog", () => {
	it("renders a version chip and name per entry, with linkified release-note links", async () => {
		const w = await mountDialog([
			{ version: "1.8.0", name: '1.8.0 — "Fold and Hold"', notes: "- did a thing ([abc1234](https://github.com/x/y/commit/abc1234))" },
		]);
		expect(w.find(".wn-version").text()).toBe("v1.8.0");
		expect(w.find(".wn-name").text()).toBe('1.8.0 — "Fold and Hold"');
		const link = w.find("a.wn-ref");
		expect(link.exists()).toBe(true);
		expect(link.attributes("href")).toBe("https://github.com/x/y/commit/abc1234");
	});

	it("shows no widget-showcase row for a version absent from the highlight map (regression - today's default)", async () => {
		const w = await mountDialog([{ version: "1.0.0", name: "1.0.0", notes: "- a fix" }]);
		expect(w.find(".wn-widgets-row").exists()).toBe(false);
	});

	it("shows a widget-showcase row of cards for a version present in the highlight map", async () => {
		WHATS_NEW_WIDGET_HIGHLIGHTS[HIGHLIGHTED_VERSION] = [
			{ widget: createDefaultWidget("gaugeCluster"), blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.__test__" },
			{ widget: createDefaultWidget("note"), blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.__test__" },
		];
		const w = await mountDialog([{ version: HIGHLIGHTED_VERSION, name: "Test release", notes: "- something new" }]);
		expect(w.find(".wn-widgets-row").exists()).toBe(true);
		expect(w.findAll(".wnw-card")).toHaveLength(2);
	});
});
