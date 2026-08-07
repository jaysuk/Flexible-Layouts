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

import { registerLayout, registerPluginMessages, registerRoute, registerSettingTab } from "@/plugins";
import { showConfirmDialog } from "@/composables/useConfirmDialog";
import Events from "@/utils/events";
import i18n from "@/i18n";
import { useCacheStore } from "@/stores/cache";
import { useSettingsStore } from "@/stores/settings";

import { configureHost } from "dwc-config-backup-core";

import en from "./i18n/en.json";
import { BUILTIN_PAGES } from "./model/builtinPages";
import { LAYOUT_ID, PLUGIN_MANIFEST_ID } from "./model/constants";
import { CONFIG_BACKUP_ROUTE_PATH, FL_PROTECTED_SD_FILES } from "./model/configBackup/constants";
import { MAINTENANCE_ROUTE_PATH } from "./model/maintenance/constants";
import { VECTOR_IMPORT_ROUTE_PATH } from "./model/vectorImport/constants";
import { activateFlLayout } from "./model/layoutState";
import { installEscapeGuard, uninstallEscapeGuard } from "./model/access";
import { installAutoBackupNudges, uninstallAutoBackupNudges } from "./model/configBackup/autoBackupNudges";
import { installCertExpiryNudge, uninstallCertExpiryNudge } from "./model/tlsSetup/certExpiryNudge";
import { installErrorCapture } from "dwc-plugin-runtime";
import { migrateGlobalHides, registerExistingCustomPages } from "./model/pageManager";
import { registerDocument } from "./model/store";
import { applyTheme } from "./model/theme";
import FlexPage from "./page/FlexPage.vue";
import FlexShell from "./shell/FlexShell.vue";
import FlexSettingsTab from "./settings/FlexSettingsTab.vue";
import ConfigBackupPage from "./configBackup/ConfigBackupPage.vue";
import MaintenancePage from "./maintenance/MaintenancePage.vue";
import VectorImportPage from "./vectorImport/VectorImportPage.vue";

const PLUGIN_ID = "flexibleLayouts";

registerPluginMessages(PLUGIN_ID, { en });

// Configure the shared backup core before anything can touch stored credentials. The namespace is
// this plugin's historical one and must not change - existing installs have credentials saved under
// it. `protectedFiles` adds our own SD state files to the core's cumulative ALWAYS_PROTECTED set, so
// a Mirror-mode restore can never delete them.
configureHost({
	storageNamespace: "flexibleLayouts.configBackup",
	protectedFiles: FL_PROTECTED_SD_FILES,
});

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
	// DWC 3.7.0-alpha.5 externalises `@/composables/*`, so we can use the proper confirm dialog again
	// (a one-click "switch now?") instead of the previous notification.
	setTimeout(() => {
		showConfirmDialog(
			i18n.global.t("plugins.flexibleLayouts.activate.title"),
			i18n.global.t("plugins.flexibleLayouts.activate.prompt"),
			"mdi-view-dashboard-edit",
		).then((ok) => {
			if (ok) {
				activateFlLayout();
			}
		}).catch(() => { /* dismissed */ });
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

// Buffer uncaught errors / promise rejections so the Diagnostics report (Settings tab) can include
// them. Returns an uninstaller cleaned up on unload below.
const uninstallErrorCapture = installErrorCapture();

// Config-backup reminders: config.g saved, last backup overdue, or an unbacked-up machine connected -
// always a one-click toast, never a silent upload/download. See autoBackupNudges.ts.
installAutoBackupNudges();

// TLS certificate expiry reminder - see certExpiryNudge.ts.
installCertExpiryNudge();

// Clean up app-lifetime resources when this plugin is stopped. The escape-guard watcher and the
// error-capture listeners aren't tied to any component, so without this they would leak (and stack a
// duplicate on the next load). Uses DWC's shared event bus (window.DWC.Events) added in 3.7.0-alpha.4.
function onPluginUnloaded(id: string): void {
	if (id === PLUGIN_MANIFEST_ID) {
		uninstallEscapeGuard();
		uninstallErrorCapture();
		uninstallAutoBackupNudges();
		uninstallCertExpiryNudge();
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

// Config backup/restore is a full page (file tree, cloud lists, machine diff - too big for a
// dialog), reachable from the settings tab's "Backup & restore config" button (gated there) or
// direct navigation to this path. See CONFIG-BACKUP-PLAN.md.
registerRoute(ConfigBackupPage, {
	Plugins: {
		FlexibleLayoutsConfigBackup: {
			icon: "mdi-archive-arrow-down",
			// caption is an i18n KEY here (not literal text), so `translated` must be false/omitted -
			// DWC's menu only runs it through $t() when translated is falsy. Setting this to true (as
			// it was) tells the shell "this is already display text, use it verbatim" - which is
			// exactly why the raw key showed up in the nav drawer instead of "Backup & restore config".
			path: CONFIG_BACKUP_ROUTE_PATH,
			caption: "plugins.flexibleLayouts.configBackup.title",
		},
	},
});

// Maintenance tracking is its own full page (headline stats, an append-only log, the setup wizard) -
// same "too big for a dialog" reasoning as config-backup above.
registerRoute(MaintenancePage, {
	Plugins: {
		FlexibleLayoutsMaintenance: {
			icon: "mdi-wrench-cog-outline",
			path: MAINTENANCE_ROUTE_PATH,
			caption: "plugins.flexibleLayouts.maintenance.navCaption",
		},
	},
});

// Vector import (SVG/DXF -> CAM) is its own full page (drop zone, live preview, a long parameter
// list) - same "too big for a dialog" reasoning as config-backup/maintenance above. Registered
// ungated: viewing the page (loading a drawing, previewing it, downloading the G-code) needs no
// capability at all, so an Operator (who has runJobs but not editLayout/editConfig) can actually
// reach it - only the "Cut it" button, deep inside, gates on can("runJobs").
registerRoute(VectorImportPage, {
	Plugins: {
		FlexibleLayoutsVectorImport: {
			icon: "mdi-content-cut",
			path: VECTOR_IMPORT_ROUTE_PATH,
			caption: "plugins.flexibleLayouts.vectorImport.navCaption",
		},
	},
});
