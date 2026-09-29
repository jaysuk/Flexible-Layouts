/**
 * Turning the opt-in Explorer replacement (`model/builtinPages.ts`'s `EXPLORER_PAGE`) on and off while the
 * app runs.
 *
 * The replacement can't simply be always registered: a route record with any override renders through DWC's
 * `RouteOverrideDispatcher`, which hides the stock page's component name from `keep-alive` - so the stock
 * Explorer would stop keeping its open editors alive even when the override just renders it again. So the
 * override is installed only while it is wanted. Installing it used to happen once, with `registerLayout`'s
 * `routes`, which is why a change needed a page reload.
 *
 * DWC builds that have `addLayoutRoutes` / `removeLayoutRoutes` (`@/plugins/layout`, also on `window.DWC`) can
 * change a registered layout's overrides in place; this uses them when present, and otherwise reports that a
 * reload is still needed - the behaviour on every older build. The plugin manifest only pins a DWC MAJOR, so
 * the functions are looked up on `window.DWC` at run time, never imported: a static import of a name an older
 * DWC lacks would either fail the type check against it or, in a bundle, read `undefined`.
 */
import { ref } from "vue";

import { EXPLORER_PAGE, EXPLORER_REPLACED_AT_LOAD } from "../model/builtinPages";
import { LAYOUT_ID } from "../model/constants";
import { shouldReplaceExplorerPage } from "../model/editorPreference";
import { existingRoutePaths } from "../model/routeRecords";
import { createPageOverride } from "./pageOverride";

/** The two DWC functions this needs. */
export interface LayoutRouteApi {
	addLayoutRoutes(layoutId: string, routes: Record<string, unknown>): void;
	removeLayoutRoutes(layoutId: string, paths: ReadonlyArray<string>): void;
}

/** DWC's runtime route-override API, or `null` on a build that doesn't have it. */
export function layoutRouteApi(): LayoutRouteApi | null {
	const dwc = (globalThis as { DWC?: Partial<LayoutRouteApi> }).DWC;
	if (dwc && typeof dwc.addLayoutRoutes === "function" && typeof dwc.removeLayoutRoutes === "function") {
		return dwc as LayoutRouteApi;
	}
	return null;
}

/** Whether the Explorer override is installed right now (starts as what plugin load installed). Reactive. */
export const explorerReplaced = ref(EXPLORER_REPLACED_AT_LOAD);

/**
 * Bring the installed Explorer override in line with what the settings ask for. Returns whether it now is;
 * `false` means DWC can't change overrides at run time and the page has to be reloaded to apply the setting.
 */
export function syncExplorerReplacement(api: LayoutRouteApi | null = layoutRouteApi()): boolean {
	const wanted = shouldReplaceExplorerPage();
	if (wanted === explorerReplaced.value) return true;
	if (api === null) return false;
	try {
		const paths = existingRoutePaths(EXPLORER_PAGE.paths);
		if (wanted) {
			api.addLayoutRoutes(LAYOUT_ID, Object.fromEntries(paths.map((path) => [path, createPageOverride(EXPLORER_PAGE, path)])));
		} else {
			api.removeLayoutRoutes(LAYOUT_ID, paths);
		}
		explorerReplaced.value = wanted;
		return true;
	} catch (e) {
		// Layout not registered (a dev hot reload that kept an older registration): same as "can't do it live".
		console.warn("[FlexibleLayouts] could not change the Explorer override at run time:", (e as Error).message);
		return false;
	}
}
