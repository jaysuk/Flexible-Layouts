import { mountInDwc } from "dwc-plugin-test-kit";
import { describe, expect, it } from "vitest";

import { createDefaultWidget } from "../model/document";
import type { WhatsNewWidgetHighlight } from "../model/whatsNewWidgets";
import WhatsNewWidgetCard from "../editor/WhatsNewWidgetCard.vue";

describe("WhatsNewWidgetCard", () => {
	it("renders the widget's icon/title from describeWidget(), the blurb key, and a live preview", () => {
		const highlight: WhatsNewWidgetHighlight = {
			widget: createDefaultWidget("gaugeCluster"),
			blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.__test__",
		};
		const w = mountInDwc(WhatsNewWidgetCard, { props: { highlight } });

		expect(w.find(".wnw-icon").exists()).toBe(true);
		expect(w.find(".wnw-title").text().length).toBeGreaterThan(0);
		// No translation seeded for the test key - vue-i18n falls back to the key itself, which is
		// enough to prove the blurb slot is actually wired to highlight.blurbKey.
		expect(w.text()).toContain("whatsNew.widgetBlurb.__test__");
		// The live preview stage renders the actual widget component (GaugeClusterWidget's own root
		// class), not a placeholder.
		expect(w.find(".gc-root").exists()).toBe(true);
	});

	it("scales the preview stage from the widget's real catalog size (gaugeCluster), not an arbitrary default", () => {
		const highlight: WhatsNewWidgetHighlight = {
			widget: createDefaultWidget("gaugeCluster"),
			blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.__test__",
		};
		const w = mountInDwc(WhatsNewWidgetCard, { props: { highlight } });
		const stage = w.find(".wnw-stage");
		expect(stage.exists()).toBe(true);
		expect(stage.attributes("style")).toContain("transform");
	});
});
