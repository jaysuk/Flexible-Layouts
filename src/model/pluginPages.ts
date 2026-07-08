/**
 * Discovery of pages registered by OTHER DWC plugins, so they can be embedded as widgets.
 *
 * DWC doesn't expose a page -> owning-plugin map, so the owning plugin id is inferred best-effort
 * from the conventional `/Plugins/<id>/...` route path and validated against the set of loaded
 * plugins. That id is only used for dependency capture on export; embedding works regardless.
 */
import { getJobViewTabs, getLoadedPlugins, getPluginSettingTabs } from "@/plugins";
import i18n from "@/i18n";
import { type MenuItem, useMenuStore } from "@/stores/menu";
import { useUiStore } from "@/stores/ui";

import { CUSTOM_PAGE_PREFIX } from "./pageManager";

export interface EmbeddablePage {
	source: "page" | "settingTab" | "jobTab";
	path?: string;
	tabKey?: string;
	label: string;
	icon: string;
	pluginId?: string;
}

/** Infer the owning plugin id from a `/Plugins/<id>/...` path, validated against loaded plugins. */
export function inferPluginId(path: string): string | undefined {
	const match = path.match(/^\/Plugins\/([^/]+)/);
	if (!match) {
		return undefined;
	}
	const segment = match[1];
	const loaded = getLoadedPlugins();
	// Exact id match first, then case-insensitive, else fall back to the raw path segment.
	if (loaded.has(segment)) {
		return segment;
	}
	for (const id of loaded) {
		if (id.toLowerCase() === segment.toLowerCase() || id.toLowerCase().startsWith(segment.toLowerCase())) {
			return id;
		}
	}
	return segment;
}

function label(item: MenuItem): string {
	return item.translated ? item.caption : i18n.global.t(item.caption);
}

function resolveCaption(caption: string | (() => string), translated: boolean): string {
	const raw = typeof caption === "function" ? caption() : caption;
	return translated ? raw : i18n.global.t(raw);
}

// DWC's own GCodeViewer plugin (@sindarius/gcodeviewer under the hood) only works with a job that's
// actually running/loaded, or with explicit volume+path route params it wasn't given here - opened
// any other way (which is the normal case for a general dashboard page) it hits an unguarded array
// access deep in that library's async render loop and crashes the whole page. That failure happens
// asynchronously, so PluginPageWidget's onErrorCaptured (which only catches synchronous render
// errors) can't contain it - there's no way to embed this safely, so it's excluded from the palette
// rather than offered as something that looks like it should work.
export const GCODE_VIEWER_JOB_TAB_KEY = "gcodeViewer";
export const GCODE_VIEWER_PAGE_PATH = "/Plugins/GCodeViewer";

/** Plugin-registered nav pages + Settings/Job tabs, excluding this plugin's own contributions. */
export function listEmbeddablePages(): Array<EmbeddablePage> {
	const menu = useMenuStore();
	const pages: Array<EmbeddablePage> = menu.pluginItems
		.filter((it) => !it.path.startsWith(CUSTOM_PAGE_PREFIX) && !it.path.startsWith("/Plugins/FlexibleLayouts")
			&& !it.path.startsWith(GCODE_VIEWER_PAGE_PATH))
		.map((it) => ({ source: "page" as const, path: it.path, label: label(it), icon: it.icon, pluginId: inferPluginId(it.path) }));

	const settingTabs: Array<EmbeddablePage> = getPluginSettingTabs()
		.filter((t) => t.key !== "flexibleLayouts")
		.map((t) => ({ source: "settingTab" as const, tabKey: t.key, label: resolveCaption(t.caption, t.translated ?? false), icon: t.icon }));

	const jobTabs: Array<EmbeddablePage> = getJobViewTabs()
		.filter((t) => t.key !== GCODE_VIEWER_JOB_TAB_KEY)
		.map((t) => ({ source: "jobTab" as const, tabKey: t.key, label: resolveCaption(t.caption, t.translated ?? false), icon: t.icon }));

	return [...pages, ...settingTabs, ...jobTabs];
}

/**
 * Palette-friendly view of a component a plugin published for embedding (DWC 3.7.0-alpha.7+
 * `registerEmbeddableComponent`). Captions are resolved through i18n unless the plugin marked them
 * literal, and a default footprint is supplied so the widget lands at a sane size.
 */
export interface EmbeddableComponentInfo {
	id: string;
	pluginId?: string;
	label: string;
	icon: string;
	description?: string;
	defaultSize: { w: number; h: number };
	mode?: "fff" | "cnc" | "any";
}

/** Components other plugins exposed for embedding, read reactively from the UI store. */
export function listEmbeddableComponents(): Array<EmbeddableComponentInfo> {
	const ui = useUiStore();
	return ui.embeddableComponents
		.filter((c) => c.pluginId !== "FlexibleLayouts")
		.map((c) => ({
			id: c.id,
			pluginId: c.pluginId,
			label: resolveCaption(c.caption, c.translated ?? false),
			icon: c.icon || "mdi-puzzle",
			description: c.description,
			defaultSize: c.defaultSize ?? { w: 4, h: 4 },
			mode: c.machineMode,
		}));
}
