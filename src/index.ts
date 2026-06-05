/**
 * Flexible Layouts - entry point.
 *
 * Registers the custom shell (a full replacement layout), a Settings tab, and the plugin's
 * i18n bundle. The shell is registered unlocked with takeover disabled, so installing the
 * plugin changes nothing until the user opts in from Settings (or Settings -> Display). The
 * built-in `/BuiltInLayout` URL always returns to the stock shell.
 *
 * Editable page route-overrides, the widget registry, theming and import/export are layered
 * on in later milestones.
 */
import { type Component, defineComponent, h } from "vue";

import { registerLayout, registerPluginMessages, registerSettingTab } from "@/plugins";
import Events from "@/utils/events";
import i18n from "@/i18n";
import { useCacheStore } from "@/stores/cache";
import { useSettingsStore } from "@/stores/settings";
import { LogLevel, useUiStore } from "@/stores/ui";

import en from "./i18n/en.json";
import { BUILTIN_PAGES } from "./model/builtinPages";
import { PLUGIN_MANIFEST_ID } from "./model/constants";
import { installEscapeGuard, uninstallEscapeGuard } from "./model/lock";
import { migrateGlobalHides, registerExistingCustomPages } from "./model/pageManager";
import { registerDocument } from "./model/store";
import { applyTheme } from "./model/theme";
import FlexPage from "./page/FlexPage.vue";
import FlexShell from "./shell/FlexShell.vue";
import FlexSettingsTab from "./settings/FlexSettingsTab.vue";

const PLUGIN_ID = "flexibleLayouts";
const LAYOUT_ID = "flexible-layouts";

registerPluginMessages(PLUGIN_ID, { en });

// Seed the persisted layout document (no-op if one was already loaded from the board).
registerDocument();

// Browser-local flags: welcome guide (shown in the custom shell) and the one-time prompt offering
// to activate the custom layout (shown in the built-in shell on first load).
const cacheStore = useCacheStore();
cacheStore.registerPluginData(PLUGIN_ID, "seenWelcome", false);
cacheStore.registerPluginData(PLUGIN_ID, "promptedActivate", false);

// On first load, if the user hasn't chosen a layout yet, gently point them at the activation
// toggle via a notification (clicking it opens Settings). Deferred briefly so the UI/connection
// has settled. A notification is used rather than DWC's internal confirm dialog because that
// composable isn't part of the external plugin API surface.
function maybeOfferActivation(): void {
	const settings = useSettingsStore();
	const cache = cacheStore.plugins[PLUGIN_ID] as Record<string, unknown> | undefined;
	if (settings.useCustomLayout || settings.layoutUserSet || cache?.promptedActivate) {
		return;
	}
	cacheStore.setPluginData(PLUGIN_ID, "promptedActivate", true);
	setTimeout(() => {
		useUiStore().makeNotification(
			LogLevel.info,
			i18n.global.t("plugins.flexibleLayouts.activate.title"),
			i18n.global.t("plugins.flexibleLayouts.activate.prompt"),
			null,
			"/Settings",
			"mdi-view-dashboard-edit",
		);
	}, 1200);
}
maybeOfferActivation();

// One-time: pull any hides an earlier build leaked into DWC's global list back into the plugin,
// so the built-in layout is a pristine default again.
migrateGlobalHides();

// Re-register routes for any custom pages the user created in a previous session.
registerExistingCustomPages();

// Re-apply a persisted global theme/palette, if the user had one enabled.
applyTheme();

// Enforce the optional edit/escape password lock (no-op unless the user enabled it).
installEscapeGuard();

// Clean up app-lifetime resources when this plugin is stopped. The escape-guard watcher isn't tied
// to any component, so without this it would leak (and stack a duplicate on the next load). Uses
// DWC's shared event bus (window.DWC.Events) added in 3.7.0-alpha.4.
function onPluginUnloaded(id: string): void {
	if (id === PLUGIN_MANIFEST_ID) {
		uninstallEscapeGuard();
		Events.off("dwcPluginUnloaded", onPluginUnloaded);
	}
}
Events.on("dwcPluginUnloaded", onPluginUnloaded);

// Build per-path route overrides for the editable built-in pages. While the custom layout is
// active each path renders an editable FlexPage (with the stock content as its fallback); when the
// user is on the built-in layout the original component renders untouched. unregisterLayout()
// restores every original automatically.
const routeOverrides: Record<string, Component> = {};
for (const def of BUILTIN_PAGES) {
	const override = defineComponent({
		name: `FlexOverride_${def.pageId.replace(/[^a-zA-Z0-9]/g, "_")}`,
		setup() {
			return () => h(FlexPage, { pageId: def.pageId, kind: "override", fallback: def.fallback, seed: def.seed });
		},
	});
	for (const path of def.paths) {
		routeOverrides[path] = override;
	}
}

// registerLayout is single-slot and throws if a layout is already registered (e.g. on a dev
// HMR re-run of this module). Swallow that so hot reloads don't spam the console; the existing
// registration keeps working
try {
	registerLayout(FlexShell, {
		id: LAYOUT_ID,
		caption: "Flexible Layouts",
		takeoverOnFirstLoad: false,
		routes: routeOverrides,
	});
} catch (e) {
	console.warn("[FlexibleLayouts] layout already registered:", (e as Error).message);
}

registerSettingTab({
	key: PLUGIN_ID,
	icon: "mdi-view-dashboard-edit",
	caption: "plugins.flexibleLayouts.settings.caption",
	component: FlexSettingsTab,
	order: 60,
});
