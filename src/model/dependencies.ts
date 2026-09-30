/**
 * Capture the plugin dependencies of a layout document.
 *
 * Scans every page for widgets that embed another plugin's page and records the owning plugin id.
 * Stored on `document.dependencies` so the export (M6) can warn a recipient about plugins they need
 * to install. Recomputed whenever the layout changes.
 */
import i18n from "@/i18n";

import { forEachItemWidget, forEachWidget, type GridItemModel, type LayoutDependency, type LayoutDocument, type Widget } from "./document";
import { useLayoutStore } from "./store";

function collectDependencies(walk: (visit: (w: Widget) => void) => void): Array<LayoutDependency> {
	const deps = new Map<string, LayoutDependency>();
	walk((w) => {
		if (w.type === "pluginPage" || w.type === "embeddable") {
			const pluginId = w.pluginId;
			if (!pluginId || deps.has(pluginId)) {
				return;
			}
			const name = w.label || (w.type === "pluginPage" ? w.path : w.id) || pluginId;
			deps.set(pluginId, {
				pluginId,
				name: w.label || pluginId,
				reason: i18n.global.t("plugins.flexibleLayouts.dependencies.embedReason", { name }),
			});
		}
	});
	return [...deps.values()];
}

/**
 * Plugin dependencies of a whole document. `forEachWidget` walks page items, responsive variants, the header AND
 * nested container children, so a plugin page tucked inside a group is captured too.
 */
export function computeDependencies(doc: LayoutDocument): Array<LayoutDependency> {
	return collectDependencies((visit) => forEachWidget(doc, visit));
}

/** Plugin dependencies of just these items (a clipboard copy, an exported panel). */
export function computeItemDependencies(items: Array<GridItemModel>): Array<LayoutDependency> {
	return collectDependencies((visit) => forEachItemWidget(items, visit));
}

/** Recompute and store dependencies on the live document. Cheap; safe to call after any edit. */
export function recomputeDependencies(): void {
	const doc = useLayoutStore().document.value;
	doc.dependencies = computeDependencies(doc);
}
