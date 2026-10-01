import { mountInDwc } from "dwc-plugin-test-kit";
import { describe, expect, it } from "vitest";

import WhatsNewWidgetCard from "../editor/WhatsNewWidgetCard.vue";
import de from "../i18n/de.json";
import en from "../i18n/en.json";
import { WHATS_NEW_WIDGET_HIGHLIGHTS } from "../model/whatsNewWidgets";

const entries = Object.entries(WHATS_NEW_WIDGET_HIGHLIGHTS).flatMap(([version, list]) => list.map((h, i) => ({ version, i, h })));

function lookup(tree: unknown, key: string): unknown {
	return key.replace(/^plugins\.flexibleLayouts\./, "").split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], (tree as { plugins: { flexibleLayouts: unknown } }).plugins?.flexibleLayouts ?? tree);
}

describe("What's New widget highlights", () => {
	it("has a showcase for the current release", () => {
		expect(WHATS_NEW_WIDGET_HIGHLIGHTS["1.12.0"]?.length).toBeGreaterThan(0);
	});

	it.each(entries.map((e) => [`${e.version} #${e.i} ${e.h.widget.type}`, e] as const))("%s: blurb exists in en and de and the preview mounts", (_name, { h }) => {
		expect(typeof lookup(en, h.blurbKey)).toBe("string");
		expect(typeof lookup(de, h.blurbKey)).toBe("string");
		const w = mountInDwc(WhatsNewWidgetCard, { props: { highlight: h } });
		expect(w.find(".wnw-title").text().length).toBeGreaterThan(0);
	});
});
