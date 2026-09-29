/**
 * The route component Flexible Layouts installs for one path of an editable built-in page
 * (`model/builtinPages.ts`): an editable `FlexPage`, or - for the Dashboard's `/` route while DWC-style phone
 * navigation is on - the phone hub.
 *
 * One component PER PATH, not per page: DWC installs a dispatcher per route record, and Vue's `<Transition>`
 * only animates a swap between two different component types, so the `/` <-> `/Dashboard` slide (the hub's
 * Dashboard tile links to `/Dashboard`) needs those two records to render different components.
 *
 * And the hub decision is made from the record this instance was created for (`path === "/"`), not from the
 * router's current route. While the hub slides out toward a page the route is already the page's; an instance
 * that asked the router would turn into the dashboard mid-slide.
 */
import { defineComponent, h, type Component } from "vue";

import { type BuiltinPageDef } from "../model/builtinPages";
import MobileHub from "../shell/MobileHub.vue";
import { useMobileHubMode } from "../shell/useMobileHub";
import FlexPage from "./FlexPage.vue";

/** The Dashboard route that doubles as the phone hub. */
export const HUB_ROUTE_PATH = "/";

export function createPageOverride(def: BuiltinPageDef, path: string): Component {
	return defineComponent({
		name: `FlexOverride_${def.pageId.replace(/[^a-zA-Z0-9]/g, "_")}`,
		setup() {
			const hubMode = def.pageId === "/Dashboard" && path === HUB_ROUTE_PATH ? useMobileHubMode() : null;
			return () => hubMode?.value
				? h(MobileHub)
				: h(FlexPage, {
					pageId: def.pageId, kind: "override", fallback: def.fallback, seed: def.seed,
					lockFallbackWhilePrinting: def.lockWhilePrinting !== false, defaultFullPage: def.fullPage === true,
				});
		},
	});
}
