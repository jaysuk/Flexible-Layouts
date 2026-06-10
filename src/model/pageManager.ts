/**
 * Page + navigation management for the Flexible Layouts plugin.
 *
 * Custom (user-created) pages are real vue-router routes registered via DWC's registerRoute, so
 * they appear in the navigation under either layout. Their definitions live in the persisted
 * document (`pages` entries with kind === "custom"), and are re-registered on every plugin load by
 * registerExistingCustomPages().
 *
 * Hiding reuses DWC's own `settings.hiddenMenuItems` (which the menu store already honours, so it
 * works in both the built-in and custom shells). Reordering is stored in `document.nav.order` and
 * applied by the custom shell's drawer.
 */
import { registerRoute, unregisterRoute } from "@/plugins";
import { useMenuStore } from "@/stores/menu";
import { useSettingsStore } from "@/stores/settings";

import { createEmptyPage, newItemId, type PageLayout } from "./document";
import { isFlLayoutActive } from "./layoutState";
import { useLayoutStore } from "./store";
import CustomPageHost from "../page/CustomPageHost.vue";

/** All custom-page route paths share this prefix. */
export const CUSTOM_PAGE_PREFIX = "/Plugins/FlexibleLayouts/p/";

/** Categories a custom page can be filed under (must match the menu store's category keys). */
export const PAGE_CATEGORIES = ["control", "job", "files", "preferences", "plugins"] as const;
export type PageCategory = (typeof PAGE_CATEGORIES)[number];

const DEFAULT_ICON = "mdi-view-dashboard-outline";

// Guards against double-registering the same route (e.g. on a dev HMR re-run of index.ts).
const _registeredPaths = new Set<string>();

function liveDoc() {
	return useLayoutStore().document.value;
}

function capitalise(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Custom pages currently in the document, in document order. */
export function listCustomPages(): Array<{ path: string; page: PageLayout }> {
	// Only real user-created pages get registered as routes. Internal FlexPage page-ids that happen
	// to use kind "custom" but aren't routes (e.g. the status bar's "__status__") must be excluded -
	// registering them would call router.addRoute() with an invalid path like "__status__".
	return Object.entries(liveDoc().pages)
		.filter(([path, page]) => page.kind === "custom" && path.startsWith(CUSTOM_PAGE_PREFIX))
		.map(([path, page]) => ({ path, page }));
}

/** Nav entries for custom pages only appear while the Flexible Layouts shell is the ACTIVE layout
 *  (not the built-in shell, nor another plugin's layout), so neither stays cluttered. The route
 *  itself always exists (URL-navigable). */
function customPageVisible(): boolean {
	return isFlLayoutActive();
}

function addRoute(path: string, page: PageLayout): void {
	if (_registeredPaths.has(path)) {
		return;
	}
	const category = page.category ?? "control";
	const routeName = "Flex_" + path.slice(CUSTOM_PAGE_PREFIX.length);
	registerRoute(CustomPageHost, {
		[capitalise(category)]: {
			[routeName]: {
				icon: page.icon ?? DEFAULT_ICON,
				caption: page.title ?? "Page",
				path,
				translated: true,
				condition: customPageVisible,
			},
		},
	});
	_registeredPaths.add(path);
}

/** Create a new custom page, persist it, and register its route. Returns the new page's path. */
export function createCustomPage(opts: { title: string; icon?: string; category?: PageCategory }): string {
	const path = CUSTOM_PAGE_PREFIX + newItemId();
	const page: PageLayout = {
		...createEmptyPage("custom"),
		title: opts.title,
		icon: opts.icon ?? DEFAULT_ICON,
		category: opts.category ?? "control",
	};
	liveDoc().pages[path] = page;
	addRoute(path, page);
	return path;
}

/** Remove a custom page: tear down its route, drop it from the document and any nav state. */
export function deleteCustomPage(path: string): void {
	unregisterRoute(path);
	_registeredPaths.delete(path);
	delete liveDoc().pages[path];

	const settings = useSettingsStore();
	settings.hiddenMenuItems = settings.hiddenMenuItems.filter((p) => p !== path);
	const nav = liveDoc().nav;
	nav.hidden = nav.hidden.filter((p) => p !== path);
	const idx = nav.order.indexOf(path);
	if (idx >= 0) {
		nav.order.splice(idx, 1);
	}
}

/** Rename / re-icon a custom page (updates the document and the live menu entry). */
export function renameCustomPage(path: string, title: string, icon?: string): void {
	const page = liveDoc().pages[path];
	if (!page) {
		return;
	}
	page.title = title;
	if (icon) {
		page.icon = icon;
	}
	const menu = useMenuStore();
	menu.unregisterItem(path);
	menu.registerItem({
		category: page.category ?? "control",
		icon: page.icon ?? DEFAULT_ICON,
		caption: title,
		translated: true,
		path,
		condition: customPageVisible,
	});
}

/**
 * One-time cleanup of hides that an earlier build wrote into DWC's GLOBAL hidden list (which
 * leaked into the built-in layout). Moves them into the plugin's own document.nav.hidden and
 * clears the global list, so the built-in layout returns to showing every page. Guarded by a
 * document flag so it runs once and never fights DWC's native hide feature afterwards.
 */
export function migrateGlobalHides(): void {
	const doc = liveDoc();
	if (doc.migratedGlobalHides) {
		return;
	}
	const settings = useSettingsStore();
	if (settings.hiddenMenuItems.length > 0) {
		doc.nav.hidden = [...new Set([...doc.nav.hidden, ...settings.hiddenMenuItems])];
		settings.hiddenMenuItems = [];
	}
	doc.migratedGlobalHides = true;
}

/** Re-register every persisted custom page. Called once at plugin load. */
export function registerExistingCustomPages(): void {
	for (const { path, page } of listCustomPages()) {
		addRoute(path, page);
	}
}

/** Tear down all currently-registered custom-page routes (used before an import swaps documents). */
export function unregisterAllCustomPages(): void {
	for (const path of [..._registeredPaths]) {
		unregisterRoute(path);
	}
	_registeredPaths.clear();
}

// #region Navigation visibility + ordering

/**
 * Hiding is plugin-scoped: it is stored in the layout document and only applied by the custom
 * shell, so it never affects the built-in DWC layout. `isHidden` also reports DWC's own global
 * hide so the toggle reflects a page hidden by either mechanism; unhiding clears BOTH, which lets
 * a page that was previously (incorrectly) hidden globally return in both layouts.
 */
export function isHidden(path: string): boolean {
	const nav = useLayoutStore().document.value.nav;
	return nav.hidden.includes(path) || useSettingsStore().hiddenMenuItems.includes(path);
}

export function setHidden(path: string, hidden: boolean): void {
	const nav = useLayoutStore().document.value.nav;
	if (hidden) {
		if (!nav.hidden.includes(path)) {
			nav.hidden = [...nav.hidden, path];
		}
		return;
	}
	nav.hidden = nav.hidden.filter((p) => p !== path);
	const settings = useSettingsStore();
	if (settings.hiddenMenuItems.includes(path)) {
		settings.hiddenMenuItems = settings.hiddenMenuItems.filter((p) => p !== path);
	}
}

/** Persisted explicit nav ordering (list of paths). Empty means "use default order". */
export function getNavOrder(): Array<string> {
	return liveDoc().nav.order;
}

export function setNavOrder(paths: Array<string>): void {
	liveDoc().nav.order = [...paths];
}

/**
 * Sort a list of nav paths by the persisted nav order. Paths present in `document.nav.order` come
 * first in that order; everything else keeps its incoming (menu-default) order at the end.
 */
export function applyNavOrder(paths: Array<string>): Array<string> {
	const order = getNavOrder();
	if (order.length === 0) {
		return paths;
	}
	const rank = new Map(order.map((p, i) => [p, i]));
	return [...paths].sort((a, b) => {
		const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
		const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
		return ra - rb;
	});
}

// #endregion
