/**
 * "New widgets in this release" showcase for the What's New dialog. There's no reliable way to
 * detect "this commit added a new widget type" from freeform commit messages, so this is a small,
 * opt-in map maintained by hand at release time — the maintainer already knows exactly which
 * widgets shipped when tagging a release. An absent version just means no showcase row for that
 * release (today's plain-bullets-only rendering); nothing needs backfilling for old releases.
 */
import { createDefaultWidget, type Widget } from "./document";

export interface WhatsNewWidgetHighlight {
	/** Live preview instance, e.g. createDefaultWidget("xyzProbe") - or a hand-tuned config with
	 *  richer sample values (a gauge cluster with a few gauges configured, say) than the bare
	 *  default would show. Rendered exactly like WidgetPalette's own hover preview. */
	widget: Widget;
	/** i18n key for a one-line blurb under the preview. */
	blurbKey: string;
}

/** The bare default has two empty tabs, which previews as a blank box - give each tab a heading. */
function tabsSample(): Widget {
	const w = createDefaultWidget("tabs");
	if (w.type !== "tabs") return w;
	const titles = ["Move", "Heat"];
	w.tabs.forEach((tab, i) => {
		const label = createDefaultWidget("label");
		if (label.type === "label") {
			label.variant = "heading";
			label.content = titles[i] ?? tab.title;
		}
		tab.title = titles[i] ?? tab.title;
		tab.items = [{ i: `whatsnew-tab-${i}`, x: 0, y: 0, w: 12, h: 2, widget: label }];
	});
	return w;
}

/** Keyed by release version, matching ReleaseHistoryEntry.version exactly (e.g. "1.9.0"). */
export const WHATS_NEW_WIDGET_HIGHLIGHTS: Record<string, Array<WhatsNewWidgetHighlight>> = {
	"1.12.0": [
		{ widget: tabsSample(), blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.tabs" },
		{ widget: createDefaultWidget("filamentMonitor"), blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.filamentMonitor" },
		{ widget: createDefaultWidget("emergencyStop"), blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.emergencyStop" },
		{ widget: createDefaultWidget("fullscreen"), blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.fullscreen" },
		{ widget: { type: "builtinPanel", component: "JobProgress" }, blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.jobProgress" },
		{ widget: { type: "builtinPanel", component: "JobViewPanel" }, blurbKey: "plugins.flexibleLayouts.whatsNew.widgetBlurb.jobView" },
	],
};
