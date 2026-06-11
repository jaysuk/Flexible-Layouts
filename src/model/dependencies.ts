/**
 * Capture the plugin dependencies of a layout document.
 *
 * Scans every page for widgets that embed another plugin's page and records the owning plugin id.
 * Stored on `document.dependencies` so the export (M6) can warn a recipient about plugins they need
 * to install. Recomputed whenever the layout changes.
 */
import i18n from "@/i18n";

import type { LayoutDependency, LayoutDocument } from "./document";
import { useLayoutStore } from "./store";

export function computeDependencies(doc: LayoutDocument): Array<LayoutDependency> {
	const deps = new Map<string, LayoutDependency>();
	for (const page of Object.values(doc.pages)) {
		for (const item of page.items) {
			const w = item.widget;
			if (w.type === "pluginPage" || w.type === "embeddable") {
				const pluginId = w.pluginId;
				if (!pluginId || deps.has(pluginId)) {
					continue;
				}
				const name = w.label || (w.type === "pluginPage" ? w.path : w.id) || pluginId;
				deps.set(pluginId, {
					pluginId,
					name: w.label || pluginId,
					reason: i18n.global.t("plugins.flexibleLayouts.dependencies.embedReason", { name }),
				});
			}
		}
	}
	return [...deps.values()];
}

/** Recompute and store dependencies on the live document. Cheap; safe to call after any edit. */
export function recomputeDependencies(): void {
	const doc = useLayoutStore().document.value;
	doc.dependencies = computeDependencies(doc);
}
