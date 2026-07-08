/**
 * Reactive access to the persisted LayoutDocument.
 *
 * The document lives under DWC's settings store at `plugins.flexibleLayouts.document`, so every
 * mutation here is automatically observed and persisted with the rest of DWC's settings (and
 * survives settings export/import). `registerDocument()` is called once at plugin init to seed
 * the default; the composable below is the read/write surface for components.
 */
import { computed, type ComputedRef } from "vue";

import { useSettingsStore } from "@/stores/settings";

import {
	type Breakpoint,
	createEmptyDocument,
	createEmptyPage,
	defaultHeaderSeed,
	type GridItemModel,
	type LayoutDocument,
	migrateDocument,
	type PageLayout,
	resolveBreakpointItems,
	sanitizeRuntimeFields,
} from "./document";

const PLUGIN_KEY = "flexibleLayouts";
const DOC_KEY = "document";
const PROFILES_KEY = "profiles";
const ACTIVE_KEY = "activeProfile";

/** Persisted container for this plugin under DWC's settings store. */
function container(): Record<string, unknown> {
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, Record<string, unknown>>;
	if (!plugins[PLUGIN_KEY]) {
		plugins[PLUGIN_KEY] = {};
	}
	return plugins[PLUGIN_KEY];
}

/**
 * Ensure the profiles structure exists (migrating a legacy single `document` into a "default"
 * profile) and that the active pointer is valid. Returns the live, reactive maps.
 */
export function ensureProfiles(): { profiles: Record<string, LayoutDocument>; active: string } {
	const c = container();
	let profiles = c[PROFILES_KEY] as Record<string, LayoutDocument> | undefined;
	if (!profiles) {
		profiles = {};
		const legacy = c[DOC_KEY] as LayoutDocument | undefined;
		if (legacy) {
			// Migrate the old single-document layout into the first profile.
			legacy.meta = legacy.meta ?? { name: "Default" };
			if (!legacy.meta.name) {
				legacy.meta.name = "Default";
			}
			profiles["default"] = legacy;
			c[ACTIVE_KEY] = "default";
			delete c[DOC_KEY];
		}
		c[PROFILES_KEY] = profiles;
	}
	let active = c[ACTIVE_KEY] as string | undefined;
	if (!active || !profiles[active]) {
		active = Object.keys(profiles)[0] ?? "default";
		if (!profiles[active]) {
			const doc = createEmptyDocument();
			doc.meta.name = "Default";
			// Same reasoning as createProfile(): a fresh document is already at the current schema
			// version, so the migration step that normally seeds this never runs on it.
			doc.header = { items: defaultHeaderSeed() };
			profiles[active] = doc;
		}
		c[ACTIVE_KEY] = active;
	}
	return { profiles, active };
}

/** Seed the profiles structure. Called once at plugin init. */
export function registerDocument(): void {
	const { profiles } = ensureProfiles();
	// Bring every saved profile up to the current schema on load: normalise its shape and apply any
	// stepwise migrations it's behind on, so a config saved by an older plugin version keeps working.
	// Write the upgraded document back only when it actually changed, so we don't dirty DWC's settings
	// (and trigger a needless SD-card write) on every load of an already-current config.
	for (const id of Object.keys(profiles)) {
		const before = JSON.stringify(profiles[id]);
		const migrated = migrateDocument(profiles[id]);
		// Also clean out any transient grid-layout-plus fields (e.g. `moved`) that leaked into storage,
		// so stored documents tidy themselves up over time.
		sanitizeRuntimeFields(migrated);
		if (JSON.stringify(migrated) !== before) {
			profiles[id] = migrated;
		}
	}
}

/** Internal: resolve the active profile's live, reactive document. */
function liveDocument(): LayoutDocument {
	const { profiles, active } = ensureProfiles();
	return profiles[active];
}

/** Replace the active profile's document (used by import). */
export function setLiveDocument(doc: LayoutDocument): void {
	const c = container();
	const { active } = ensureProfiles();
	(c[PROFILES_KEY] as Record<string, LayoutDocument>)[active] = doc;
}

/** Deep snapshot of every profile + the active pointer — the payload of the SD-card backup. */
export function snapshotAllProfiles(): { profiles: Record<string, LayoutDocument>; active: string } {
	const { profiles, active } = ensureProfiles();
	const clone = JSON.parse(JSON.stringify(profiles)) as Record<string, LayoutDocument>;
	// Keep the backup tidy: drop transient grid fields that may have been re-added since load.
	for (const doc of Object.values(clone)) {
		sanitizeRuntimeFields(doc);
	}
	return { profiles: clone, active };
}

/** Replace the entire profiles structure (SD restore). Migrates each profile and validates `active`. */
export function replaceAllProfiles(profiles: Record<string, LayoutDocument>, active: string): void {
	const c = container();
	c[PROFILES_KEY] = profiles;
	c[ACTIVE_KEY] = profiles[active] ? active : (Object.keys(profiles)[0] ?? "default");
	registerDocument();
}

// #region Profile management (pure data; route/theme side-effects live in model/profiles.ts)
export function getActiveProfileId(): string {
	return ensureProfiles().active;
}

export function setActiveProfileId(id: string): void {
	const c = container();
	const { profiles } = ensureProfiles();
	if (profiles[id]) {
		c[ACTIVE_KEY] = id;
	}
}

export function listProfiles(): Array<{ id: string; name: string }> {
	const { profiles } = ensureProfiles();
	return Object.entries(profiles).map(([id, doc]) => ({ id, name: doc.meta.name || id }));
}

function newProfileId(): string {
	return "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function createProfile(name: string): string {
	const { profiles } = ensureProfiles();
	const id = newProfileId();
	const doc = createEmptyDocument();
	doc.meta.name = name;
	// Without this, a brand-new profile has no way back into edit mode from the top bar at all - the
	// v3->v4 migration step that normally seeds this only runs on documents BELOW the current schema
	// version, and a freshly created one is already stamped at the current version.
	doc.header = { items: defaultHeaderSeed() };
	profiles[id] = doc;
	return id;
}

export function duplicateProfile(id: string, name: string): string {
	const { profiles } = ensureProfiles();
	if (!profiles[id]) {
		return id;
	}
	const newId = newProfileId();
	const doc: LayoutDocument = JSON.parse(JSON.stringify(profiles[id]));
	doc.meta.name = name;
	profiles[newId] = doc;
	return newId;
}

export function renameProfile(id: string, name: string): void {
	const { profiles } = ensureProfiles();
	if (profiles[id]) {
		profiles[id].meta.name = name;
	}
}

/** Delete a profile. Refuses to delete the last one. Returns the (possibly new) active id. */
export function deleteProfile(id: string): string {
	const c = container();
	const { profiles } = ensureProfiles();
	if (Object.keys(profiles).length <= 1 || !profiles[id]) {
		return ensureProfiles().active;
	}
	delete profiles[id];
	if (c[ACTIVE_KEY] === id) {
		c[ACTIVE_KEY] = Object.keys(profiles)[0];
	}
	return c[ACTIVE_KEY] as string;
}
// #endregion

export interface LayoutStore {
	document: ComputedRef<LayoutDocument>;
	getPage: (pageId: string) => PageLayout | undefined;
	ensurePage: (pageId: string, kind: PageLayout["kind"]) => PageLayout;
	getItems: (pageId: string) => Array<GridItemModel>;
	setItems: (pageId: string, items: Array<GridItemModel>, kind?: PageLayout["kind"]) => void;
	getItemsForBp: (pageId: string, bp: Breakpoint) => Array<GridItemModel>;
	setItemsForBp: (pageId: string, items: Array<GridItemModel>, kind: PageLayout["kind"], bp: Breakpoint) => void;
	/** True when the page has a saved layout with at least one item. */
	hasLayout: (pageId: string) => boolean;
	resetPage: (pageId: string) => void;
	clearPageLayout: (pageId: string) => void;
	clearBreakpoint: (pageId: string, bp: Breakpoint) => void;
	setPageBackground: (pageId: string, kind: PageLayout["kind"], background: PageLayout["background"]) => void;
}

export function useLayoutStore(): LayoutStore {
	const document = computed<LayoutDocument>(() => liveDocument());

	function getPage(pageId: string): PageLayout | undefined {
		return liveDocument().pages[pageId];
	}

	function ensurePage(pageId: string, kind: PageLayout["kind"]): PageLayout {
		const doc = liveDocument();
		if (!doc.pages[pageId]) {
			doc.pages[pageId] = createEmptyPage(kind);
		}
		return doc.pages[pageId];
	}

	function getItems(pageId: string): Array<GridItemModel> {
		return liveDocument().pages[pageId]?.items ?? [];
	}

	function setItems(pageId: string, items: Array<GridItemModel>, kind: PageLayout["kind"] = "custom"): void {
		ensurePage(pageId, kind).items = items;
	}

	/** Effective items for a breakpoint (with fallback to larger layouts). */
	function getItemsForBp(pageId: string, bp: Breakpoint): Array<GridItemModel> {
		const page = liveDocument().pages[pageId];
		return page ? resolveBreakpointItems(page, bp) : [];
	}

	/** Write items for a specific breakpoint (`lg` = base, `md`/`sm` = variant overrides). */
	function setItemsForBp(pageId: string, items: Array<GridItemModel>, kind: PageLayout["kind"], bp: Breakpoint): void {
		const page = ensurePage(pageId, kind);
		if (bp === "lg") {
			page.items = items;
		} else {
			if (!page.variants) {
				page.variants = {};
			}
			page.variants[bp] = items;
		}
	}

	function hasLayout(pageId: string): boolean {
		const page = liveDocument().pages[pageId];
		return !!page && page.items.length > 0;
	}

	function resetPage(pageId: string): void {
		delete liveDocument().pages[pageId];
	}

	/**
	 * Clear all layout content of a page (every breakpoint's widgets, background, grid) so it reverts
	 * to its default - the stock fallback for a built-in page, or empty for a custom page. Nav
	 * metadata (title/icon/category/hidden/condition) is kept so custom pages keep their menu entry.
	 */
	function clearPageLayout(pageId: string): void {
		const page = liveDocument().pages[pageId];
		if (!page) {
			return;
		}
		page.items = [];
		delete page.variants;
		delete page.background;
		page.grid = { cols: 12, rowHeight: 30 };
	}

	/** Clear just one breakpoint's widgets: `lg` empties the base; `md`/`sm` drop the override
	 *  (reverting to inheriting the larger layout). */
	function clearBreakpoint(pageId: string, bp: Breakpoint): void {
		const page = liveDocument().pages[pageId];
		if (!page) {
			return;
		}
		if (bp === "lg") {
			page.items = [];
		} else if (page.variants) {
			delete page.variants[bp];
		}
	}

	function setPageBackground(pageId: string, kind: PageLayout["kind"], background: PageLayout["background"]): void {
		ensurePage(pageId, kind).background = background;
	}

	return { document, getPage, ensurePage, getItems, setItems, getItemsForBp, setItemsForBp, hasLayout, resetPage, clearPageLayout, clearBreakpoint, setPageBackground };
}
