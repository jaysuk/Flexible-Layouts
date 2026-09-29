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

import { type GridItemModel, newItemId } from "./document";
import { isCncOrLaserMode } from "../util/machineMode";
import DashboardFallback from "../page/fallbacks/DashboardFallback.vue";
import ConsoleFallback from "../page/fallbacks/ConsoleFallback.vue";
import TemperaturesFallback from "../page/fallbacks/TemperaturesFallback.vue";
import MacrosFallback from "../page/fallbacks/MacrosFallback.vue";

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
}

function panel(component: string, x: number, y: number, w: number, h: number): GridItemModel {
	return { i: newItemId(), x, y, w, h, widget: { type: "builtinPanel", component } };
}

/** Editable equivalent of the stock dashboard, branched on machine mode. */
function dashboardSeed(): Array<GridItemModel> {
	const mode = useMachineStore().model.state.machineMode;
	const isCnc = isCncOrLaserMode(mode);
	if (isCnc) {
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

/**
 * Editable equivalent of the stock persistent status region (Status / Tools / Temperatures, or the
 * CNC equivalents), offered as "use current layout" the first time the status bar is edited.
 */
export function statusBarSeed(): Array<GridItemModel> {
	const mode = useMachineStore().model.state.machineMode;
	const isCnc = isCncOrLaserMode(mode);
	if (isCnc) {
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

export const BUILTIN_PAGES: ReadonlyArray<BuiltinPageDef> = [
	{ paths: ["/", "/Dashboard"], pageId: "/Dashboard", fallback: DashboardFallback, seed: dashboardSeed },
	{ paths: ["/Console"], pageId: "/Console", fallback: ConsoleFallback, lockWhilePrinting: false },
	{ paths: ["/Temperatures"], pageId: "/Temperatures", fallback: TemperaturesFallback, lockWhilePrinting: false },
	{ paths: ["/Macros"], pageId: "/Macros", fallback: MacrosFallback },
	// Jobs and Explorer are intentionally NOT overridden: the Explorer route is DWC's file editor
	// (Monaco) and Jobs is a multi-volume browser — replacing them with a simple fallback breaks
	// editing. They remain native; their browsers are available as the JobFileList/FileList panels.
];
