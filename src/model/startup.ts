/**
 * "Open this page on startup" support.
 *
 * When the custom shell first mounts we redirect to the layout's configured startup page, but only
 * once per page load and only if the user is still on the default landing route (so it never fights a
 * deep-link or a manual navigation). Guarded against a stale/removed page path.
 */
import type { Router } from "vue-router";

import { useLayoutStore } from "./store";

let applied = false;

/** Navigate to the layout's configured startup page, once, on first shell mount. */
export function applyStartupRoute(router: Router): void {
	if (applied) {
		return;
	}
	applied = true;

	const path = useLayoutStore().document.value.startupPath;
	if (!path) {
		return;
	}
	const current = router.currentRoute.value.path;
	// Only override the default landing page — never a deep link the user arrived on.
	if (current !== "/" && current !== "/Dashboard") {
		return;
	}
	if (current === path) {
		return;
	}
	// Skip if the configured page no longer resolves (deleted custom page, uninstalled plugin, …).
	if (!router.resolve(path).matched.length) {
		return;
	}
	router.replace(path).catch(() => { /* redundant/duplicate navigation — ignore */ });
}
