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
import { watch } from "vue";

import { registerRoute, unregisterRoute } from "@/plugins";
import i18n from "@/i18n";
import { useMenuStore } from "@/stores/menu";
import { useSettingsStore } from "@/stores/settings";

import { createEmptyPage, type PageLayout } from "./document";
import { isFlLayoutActive } from "./layoutState";
import { CUSTOM_PAGE_PREFIX, migrateOpaquePageIds, uniqueCustomPagePath } from "./pageSlug";
import { useLayoutStore } from "./store";
import CustomPageAlias from "../page/CustomPageAlias.vue";
import CustomPageHost from "../page/CustomPageHost.vue";

/** All custom-page route paths share this prefix. */
export { CUSTOM_PAGE_PREFIX };

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
	for (const legacy of page.legacyPaths ?? []) {
		addAliasRoute(legacy, page);
	}
}

/**
 * An earlier address of a page (see `PageLayout.legacyPaths`): a route that sends whoever lands on it to the page's
 * current one. It is a route only - `registerRoute` also adds a navigation entry, which is taken straight back out,
 * so nothing shows in the drawer, the hub or the page manager.
 */
function addAliasRoute(alias: string, page: PageLayout): void {
	if (_registeredPaths.has(alias)) {
		return;
	}
	registerRoute(CustomPageAlias, {
		[capitalise(page.category ?? "control")]: {
			["FlexOld_" + alias.slice(CUSTOM_PAGE_PREFIX.length)]: {
				icon: page.icon ?? DEFAULT_ICON,
				caption: page.title ?? "Page",
				path: alias,
				translated: true,
				condition: () => false,
			},
		},
	});
	useMenuStore().unregisterItem(alias);
	_registeredPaths.add(alias);
}

/** Create a new custom page, persist it, and register its route. Returns the new page's path. */
export function createCustomPage(opts: { title: string; icon?: string; category?: string }): string {
	const path = uniqueCustomPagePath(opts.title, Object.keys(liveDoc().pages));
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
	for (const alias of liveDoc().pages[path]?.legacyPaths ?? []) {
		unregisterRoute(alias);
		_registeredPaths.delete(alias);
	}
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

/**
 * Rename / re-icon / re-section a custom page (updates the document and the live menu entry). Passing
 * `category` moves the page to another navigation section (built-in or custom).
 */
export function renameCustomPage(path: string, title: string, icon?: string, category?: string): void {
	const page = liveDoc().pages[path];
	if (!page) {
		return;
	}
	page.title = title;
	if (icon) {
		page.icon = icon;
	}
	if (category) {
		page.category = category;
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

// #region Custom navigation sections

const CUSTOM_CAT_ORDER_BASE = 60; // after the built-ins (plugins = 50)

function captionKeyFor(key: string): string {
	return `plugins.flexibleLayouts.customCat.${key}`;
}

/** Built-in + user-defined sections, for the section picker (key + display name). */
export function listCategories(): Array<{ key: string; name: string }> {
	const builtin = PAGE_CATEGORIES.map((k) => ({ key: k, name: i18n.global.t(`menu.${k}.caption`) }));
	const custom = (liveDoc().nav.customCategories ?? []).map((c) => ({ key: c.key, name: c.name }));
	return [...builtin, ...custom];
}

/** Push every persisted custom section into the menu store (idempotent). Called at load + on change. */
export function ensureCustomCategories(): void {
	const menu = useMenuStore();
	const cats = liveDoc().nav.customCategories ?? [];
	let order = CUSTOM_CAT_ORDER_BASE;
	for (const c of cats) {
		// Register the caption so $t(captionKey) returns the user's name (no missing-key warning).
		i18n.global.mergeLocaleMessage(i18n.global.locale.value, { plugins: { flexibleLayouts: { customCat: { [c.key]: c.name } } } });
		if (!menu.categories.some((x) => x.key === c.key)) {
			menu.categories.push({ key: c.key, icon: c.icon ?? "mdi-folder-outline", captionKey: captionKeyFor(c.key), order: order++ });
		}
	}
}

/** Create a new navigation section, persist it, register it with the menu store, and return its key. */
export function addCustomCategory(name: string, icon?: string): string {
	const trimmed = name.trim();
	const base = "flx-" + (trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section");
	const doc = liveDoc();
	const existing = new Set([...PAGE_CATEGORIES as ReadonlyArray<string>, ...(doc.nav.customCategories ?? []).map((c) => c.key)]);
	let key = base;
	let n = 2;
	while (existing.has(key)) {
		key = `${base}-${n++}`;
	}
	doc.nav.customCategories = [...(doc.nav.customCategories ?? []), { key, name: trimmed || key, icon }];
	ensureCustomCategories();
	return key;
}

// #endregion

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

/**
 * Whatever DWC saved under a page's old path (a built-in panel's settings are keyed `<route path>::<panel>`) is
 * moved to the page's current one, so renaming a page's address does not reset the panels on it. Safe to repeat,
 * and repeated on purpose: DWC loads its settings after plugins, so at load there may be nothing to move yet.
 */
export function moveLegacyComponentSettings(): void {
	const settings = useSettingsStore() as unknown as { componentSettings?: Record<string, unknown> };
	const saved = settings.componentSettings;
	if (!saved) {
		return;
	}
	const ids = Object.keys(saved);
	for (const { path, page } of listCustomPages()) {
		for (const legacy of page.legacyPaths ?? []) {
			for (const id of ids) {
				if (id.startsWith(legacy + "::") && id in saved) {
					saved[path + id.slice(legacy.length)] = saved[id];
					delete saved[id];
				}
			}
		}
	}
}

let _stopSettingsWatch: (() => void) | null = null;

/** Re-register every persisted custom page. Called once at plugin load. */
export function registerExistingCustomPages(): void {
	// A document that still names pages by random ids gets readable ones first (see model/pageSlug.ts).
	migrateOpaquePageIds(liveDoc());
	moveLegacyComponentSettings();
	if (_stopSettingsWatch === null) {
		_stopSettingsWatch = watch(
			() => Object.keys((useSettingsStore() as unknown as { componentSettings?: Record<string, unknown> }).componentSettings ?? {}).length,
			moveLegacyComponentSettings,
		);
	}
	ensureCustomCategories(); // sections must exist before pages register under them
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
