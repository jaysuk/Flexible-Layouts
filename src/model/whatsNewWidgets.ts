/**
 * "New widgets in this release" showcase for the What's New dialog. There's no reliable way to
 * detect "this commit added a new widget type" from freeform commit messages, so this is a small,
 * opt-in map maintained by hand at release time — the maintainer already knows exactly which
 * widgets shipped when tagging a release. An absent version just means no showcase row for that
 * release (today's plain-bullets-only rendering); nothing needs backfilling for old releases.
 */
import type { Widget } from "./document";

export interface WhatsNewWidgetHighlight {
	/** Live preview instance, e.g. createDefaultWidget("xyzProbe") - or a hand-tuned config with
	 *  richer sample values (a gauge cluster with a few gauges configured, say) than the bare
	 *  default would show. Rendered exactly like WidgetPalette's own hover preview. */
	widget: Widget;
	/** i18n key for a one-line blurb under the preview. */
	blurbKey: string;
}

/** Keyed by release version, matching ReleaseHistoryEntry.version exactly (e.g. "1.9.0"). */
export const WHATS_NEW_WIDGET_HIGHLIGHTS: Record<string, Array<WhatsNewWidgetHighlight>> = {};
