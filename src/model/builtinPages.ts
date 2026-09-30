/**
 * Built-in pages that the custom layout makes editable by overriding their route component.
 *
 * Each entry maps one or more canonical route paths to a single shared document page-id (so e.g.
 * `/` and `/Dashboard` edit the same layout) plus a `fallback` - the original page content shown
 * while that page has no custom layout and the user isn't editing.
 *
 * `seed()` returns an editable grid that approximates the page's stock content, offered as
 * "start from the current layout" the first time the user edits the page (vs. starting blank).
 *
 * Adding another editable built-in page is just another entry here (with a suitable fallback).
 */
import type { Component } from "vue";

import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";

import { type GridItemModel, newItemId } from "./document";
import { wantsCncLayout } from "../util/machineMode";
import DashboardFallback from "../page/fallbacks/DashboardFallback.vue";
import ConsoleFallback from "../page/fallbacks/ConsoleFallback.vue";
import TemperaturesFallback from "../page/fallbacks/TemperaturesFallback.vue";
import MacrosFallback from "../page/fallbacks/MacrosFallback.vue";
import JobStatusFallback from "../page/fallbacks/JobStatusFallback.vue";
import JobWebcamFallback from "../page/fallbacks/JobWebcamFallback.vue";
import ExplorerFallback from "../page/fallbacks/ExplorerFallback.vue";
import { shouldReplaceExplorerPage } from "./editorPreference";

export interface BuiltinPageDef {
	/** Canonical vue-router paths to override (as seen in router.getRoutes().map(r => r.path)). */
	paths: Array<string>;
	/** Shared document key for this page's layout. */
	pageId: string;
	/** Original page content, shown until the user customises this page. */
	fallback: Component;
	/** Editable approximation of the stock content, offered as "use current layout". */
	seed?: () => Array<GridItemModel>;
	/**
	 * Whether the stock fallback is interaction-locked during a print. Defaults to true because the
	 * fallback is one opaque panel set that may contain motion controls (Dashboard's Movement panel,
	 * macros). Set false for pages with nothing that can move the machine - the console must stay
	 * usable mid-print (M25/M226/M291 replies, diagnostics, live tuning), as it is in stock DWC.
	 */
	lockWhilePrinting?: boolean;
	/** "Full page" default for this page (see PageLayout.fullPage); the user's own choice wins. */
	fullPage?: boolean;
}

/** CNC or FFF starter layout? Honours DWC's "Dashboard mode" override, like the stock status region does. */
function seedIsCnc(): boolean {
	return wantsCncLayout(
		useMachineStore().model.state.machineMode,
		(useSettingsStore() as { dashboardMode?: string }).dashboardMode,
	);
}

function panel(component: string, x: number, y: number, w: number, h: number): GridItemModel {
	return { i: newItemId(), x, y, w, h, widget: { type: "builtinPanel", component } };
}

/** Editable equivalent of the stock dashboard, branched on machine mode. */
function dashboardSeed(): Array<GridItemModel> {
	if (seedIsCnc()) {
		return [
			panel("MovementPanel", 0, 0, 8, 9),
			panel("SpindleSpeedPanel", 8, 0, 4, 5),
			panel("MacroList", 8, 5, 4, 9),
		];
	}
	return [
		panel("MovementPanel", 0, 0, 8, 9),
		panel("MacroList", 8, 0, 4, 18),
		panel("ExtrudePanel", 0, 9, 8, 6),
		panel("FanPanel", 0, 15, 8, 4),
	];
}

/** Editable equivalent of the stock Job > Status page, branched on FFF vs CNC (no extrusion factors on CNC). */
function jobStatusSeed(): Array<GridItemModel> {
	const isCnc = seedIsCnc();
	return [
		panel("JobProgress", 0, 0, 12, 3),
		panel("JobControlPanel", 0, 3, 3, 6),
		panel("BabystepPanel", 0, 9, 3, 4),
		panel("JobInfoPanel", 0, 13, 3, 7),
		panel("JobViewPanel", 3, 3, 5, 14),
		panel("JobTimesPanel", 3, 17, 5, 5),
		panel("SpeedFactorPanel", 8, 3, 4, 4),
		panel("FansPanel", 8, 7, 4, 7),
		...(isCnc ? [] : [panel("ExtrusionFactorsPanel", 8, 14, 4, 5)]),
	];
}

/**
 * Editable equivalent of the stock persistent status region (Status / Tools / Temperatures, or the
 * CNC equivalents), offered as "use current layout" the first time the status bar is edited.
 */
export function statusBarSeed(): Array<GridItemModel> {
	if (seedIsCnc()) {
		// DWC's stock CNC/Laser status bar (CNCContainerPanel) is just these two side by side - no
		// MovementPanel/SpindleSpeedPanel here, those belong to the Dashboard page, not the status bar.
		return [
			panel("StatusPanel", 0, 0, 4, 6),
			panel("CNCAxesPosition", 4, 0, 8, 6),
		];
	}
	return [
		panel("StatusPanel", 0, 0, 3, 6),
		panel("ToolsPanel", 3, 0, 5, 6),
		panel("TemperatureChart", 8, 0, 4, 6),
	];
}

const BASE_PAGES: ReadonlyArray<BuiltinPageDef> = [
	{ paths: ["/", "/Dashboard"], pageId: "/Dashboard", fallback: DashboardFallback, seed: dashboardSeed },
	{ paths: ["/Console"], pageId: "/Console", fallback: ConsoleFallback, lockWhilePrinting: false },
	{ paths: ["/Temperatures"], pageId: "/Temperatures", fallback: TemperaturesFallback, lockWhilePrinting: false },
	{ paths: ["/Macros"], pageId: "/Macros", fallback: MacrosFallback },
	// The print-time pages. The stock Status page is mostly controls (pause/resume/cancel, babystep, speed
	// and fan factors) that must stay usable mid-print, so the fallback is never locked; individual widgets
	// still lock by their own type (see util/printLock.ts).
	{ paths: ["/Job/Status"], pageId: "/Job/Status", fallback: JobStatusFallback, seed: jobStatusSeed, lockWhilePrinting: false },
	{ paths: ["/Job/Webcam"], pageId: "/Job/Webcam", fallback: JobWebcamFallback, seed: () => [panel("WebcamPanel", 0, 0, 12, 16)], lockWhilePrinting: false },
	// Jobs is intentionally NOT overridden: it's a multi-volume browser that a simple fallback would
	// break. It remains native; its browser is available as the JobFileList panel. The Explorer is
	// native too unless the user opts into the replacement below (EXPLORER_PAGE).
];

/**
 * DWC's Explorer route: `/Explorer/:tab?/:volume?/:path*` as vue-router normalises it on 3.7.0-rc.2, and
 * `/Explorer/:tab?/:volume?/:path(.*)?` as DWC's generated route types (and earlier builds) spell it. Both are
 * listed; `existingRoutePaths` (model/routeRecords.ts) installs whichever the running DWC actually has.
 * A pattern DWC has no record for is skipped by it with a warning, and the override just isn't there - the
 * replacement was silently inert on rc.2 until this listed the right one. Opt-in (Settings > G-code editor), and
 * only when the new editor is on: it replaces the stock page, which always uses Monaco, with one that
 * opens G-code in the new editor. Off by default because the stock page is kept alive by DWC (open
 * editors survive navigating away) and this one isn't - see ExplorerFallback.vue. Full page by
 * default, like the page it replaces.
 */
export const EXPLORER_PAGE: BuiltinPageDef = {
	paths: ["/Explorer/:tab?/:volume?/:path*", "/Explorer/:tab?/:volume?/:path(.*)?"],
	pageId: "/Explorer",
	fallback: ExplorerFallback,
	seed: () => [panel("FileList", 0, 0, 12, 16)],
	lockWhilePrinting: false,
	fullPage: true,
};

/** The editable built-in pages; the Explorer joins them only when it's being replaced. */
export function builtinPages(replaceExplorer: boolean): ReadonlyArray<BuiltinPageDef> {
	return replaceExplorer ? [...BASE_PAGES, EXPLORER_PAGE] : BASE_PAGES;
}

/**
 * Whether the Explorer replacement was active when the plugin loaded. Route overrides are installed
 * once with the layout, so this can only change on a reload - Settings compares it against the stored
 * choice to say when a reload is needed.
 */
export const EXPLORER_REPLACED_AT_LOAD = shouldReplaceExplorerPage();

export const BUILTIN_PAGES: ReadonlyArray<BuiltinPageDef> = builtinPages(EXPLORER_REPLACED_AT_LOAD);
