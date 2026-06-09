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
import { MachineMode } from "@duet3d/objectmodel";
import type { Component } from "vue";

import { useMachineStore } from "@/stores/machine";

import { type GridItemModel, newItemId } from "./document";
import DashboardFallback from "../page/fallbacks/DashboardFallback.vue";
import ConsoleFallback from "../page/fallbacks/ConsoleFallback.vue";
import TemperaturesFallback from "../page/fallbacks/TemperaturesFallback.vue";
import MacrosFallback from "../page/fallbacks/MacrosFallback.vue";
import JobsFallback from "../page/fallbacks/JobsFallback.vue";
import ExplorerFallback from "../page/fallbacks/ExplorerFallback.vue";

export interface BuiltinPageDef {
	/** Canonical vue-router paths to override (as seen in router.getRoutes().map(r => r.path)). */
	paths: Array<string>;
	/** Shared document key for this page's layout. */
	pageId: string;
	/** Original page content, shown until the user customises this page. */
	fallback: Component;
	/** Editable approximation of the stock content, offered as "use current layout". */
	seed?: () => Array<GridItemModel>;
}

function panel(component: string, x: number, y: number, w: number, h: number): GridItemModel {
	return { i: newItemId(), x, y, w, h, widget: { type: "builtinPanel", component } };
}

/** Editable equivalent of the stock dashboard, branched on machine mode. */
function dashboardSeed(): Array<GridItemModel> {
	const mode = useMachineStore().model.state.machineMode;
	const isCnc = mode === MachineMode.cnc || mode === MachineMode.laser;
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

export const BUILTIN_PAGES: ReadonlyArray<BuiltinPageDef> = [
	{ paths: ["/", "/Dashboard"], pageId: "/Dashboard", fallback: DashboardFallback, seed: dashboardSeed },
	{ paths: ["/Console"], pageId: "/Console", fallback: ConsoleFallback },
	{ paths: ["/Temperatures"], pageId: "/Temperatures", fallback: TemperaturesFallback },
	{ paths: ["/Macros"], pageId: "/Macros", fallback: MacrosFallback },
	// Jobs/Explorer are parameterised routes; the path strings must match vue-router's compiled
	// record paths exactly (see DWC typed-router.d.ts) for the override to attach.
	{ paths: ["/Jobs/:volume?/:path(.*)?"], pageId: "/Jobs", fallback: JobsFallback },
	{ paths: ["/Explorer/:tab?/:volume?/:path(.*)?"], pageId: "/Explorer", fallback: ExplorerFallback },
];
