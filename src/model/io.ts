/**
 * Export / import of a shareable `.dwclayout.json` file.
 *
 * The file wraps the LayoutDocument with a small header so it's identifiable and version-checked.
 * Import recreates the whole layout (pages, widgets, theme) and reports any plugin dependencies the
 * recipient is missing so the UI can warn before applying.
 */
import { getLoadedPlugins } from "@/plugins";
import { useMachineStore } from "@/stores/machine";

import { createEmptyDocument, type GridItemModel, type LayoutDependency, type LayoutDocument, type PageLayout, migrateDocument, newItemId, reidItem } from "./document";
import { computeDependencies, recomputeDependencies } from "./dependencies";
import { CUSTOM_PAGE_PREFIX, registerExistingCustomPages, unregisterAllCustomPages } from "./pageManager";
import { setLiveDocument, useLayoutStore } from "./store";
import { applyTheme } from "./theme";

const FILE_KIND = "dwclayout";
const FILE_VERSION = 1;

export interface DwcLayoutFile {
	kind: typeof FILE_KIND;
	app: "FlexibleLayouts";
	fileVersion: number;
	exportedAt: string;
	document: LayoutDocument;
}

/** Which parts of the layout to include in a backup. Omitted parts default to included. */
export interface ExportOptions {
	theme?: boolean;
	/** Top app-bar (pinned widgets + styling). */
	header?: boolean;
	pages?: boolean;
	/** Status-bar visibility + nav order/hides. */
	settings?: boolean;
}

/** Serialise the current document (optionally a subset) and trigger a browser download. */
export function exportLayout(opts: ExportOptions = {}): void {
	const { theme = true, header = true, pages = true, settings = true } = opts;
	const live = useLayoutStore().document.value;
	// Make sure captured dependencies are current before sharing.
	recomputeDependencies();

	const doc = JSON.parse(JSON.stringify(live)) as LayoutDocument;
	if (!theme) {
		doc.theme = { enabled: false, colors: {} };
	}
	if (!header) {
		delete doc.header;
	}
	if (!pages) {
		doc.pages = {};
	}
	if (!settings) {
		doc.statusHidden = undefined;
		doc.nav = { order: [], hidden: [] };
	}
	// Dependencies follow whatever pages survived the trim.
	doc.dependencies = computeDependencies(doc);

	const file: DwcLayoutFile = {
		kind: FILE_KIND,
		app: "FlexibleLayouts",
		fileVersion: FILE_VERSION,
		exportedAt: new Date().toISOString(),
		document: doc,
	};
	const suffix = !pages && theme && !header && !settings ? "-theme" : "";
	triggerDownload(`${safeName(live.meta.name, "layout")}${suffix}.dwclayout.json`, JSON.stringify(file, null, 2));
}

/** Human label + kind for each page in a document (for the restore picker / page export dropdown). */
export interface PageEntry { path: string; label: string; isCustom: boolean }
const BUILTIN_PAGE_LABELS: Record<string, string> = {
	"/": "Dashboard", "/Dashboard": "Dashboard", "/Console": "Console", "/Temperatures": "Temperatures",
	"/Macros": "Macros", "/Jobs": "Jobs", "/Explorer": "Explorer", "__status__": "Status bar",
};
export function listDocumentPages(doc: LayoutDocument): Array<PageEntry> {
	return Object.entries(doc.pages ?? {}).map(([path, page]) => ({
		path,
		label: page.title || BUILTIN_PAGE_LABELS[path] || path.replace(/^\//, "") || path,
		isCustom: page.kind === "custom",
	}));
}

export interface ParsedImport {
	document: LayoutDocument;
	/** Dependencies the recipient does not currently have loaded/installed. */
	missing: Array<LayoutDependency>;
}

/** Plugins this machine doesn't have loaded or installed. */
export function computeMissing(deps: Array<LayoutDependency>): Array<LayoutDependency> {
	const loaded = getLoadedPlugins();
	const installed = new Set<string>();
	try {
		const plugins = useMachineStore().model.plugins as unknown as { keys?: () => Iterable<string> };
		if (plugins?.keys) {
			for (const id of plugins.keys()) {
				installed.add(id);
			}
		}
	} catch {
		// no machine / no plugins collection - treat as none installed
	}
	return deps.filter((d) => !loaded.has(d.pluginId) && !installed.has(d.pluginId));
}

/** Parse + validate a `.dwclayout.json` text blob. Throws on an unrecognised file. */
export function parseLayoutFile(text: string): ParsedImport {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("invalidJson");
	}
	const file = raw as Partial<DwcLayoutFile>;
	if (!file || file.kind !== FILE_KIND || !file.document) {
		throw new Error("notALayout");
	}
	const document = migrateDocument(file.document);
	// Recompute from the document itself so the warning reflects what's actually embedded, not a
	// stale dependency list the exporter may have shipped.
	const deps = computeDependencies(document);
	document.dependencies = deps;
	return { document, missing: computeMissing(deps) };
}

/** Which parts of an imported backup to restore over the current layout. */
export interface RestoreOptions {
	theme?: boolean;
	header?: boolean;
	settings?: boolean;
	/** Page paths to restore, or "all". Selected pages overwrite; others are left as they are. */
	pages?: Array<string> | "all";
	/**
	 * Delete the current pages before applying the import (a clean replace). Default false: the import
	 * is ADDITIVE - existing pages are kept and the imported ones are added alongside them.
	 */
	replaceExisting?: boolean;
}

/**
 * Pure merge of selected parts of an imported document over `current`, returning a NEW document.
 * Additive by default: current pages are never deleted (only same-keyed pages are overwritten), and
 * the nav order/hidden lists are MERGED so existing pages keep their place and imported pages are
 * appended. Set `replaceExisting` to wipe the current pages first (an explicit clean replace).
 */
export function mergeImported(current: LayoutDocument, imported: LayoutDocument, opts: RestoreOptions = {}): LayoutDocument {
	const { theme = true, header = true, settings = true, pages = "all", replaceExisting = false } = opts;
	const target = JSON.parse(JSON.stringify(current)) as LayoutDocument;

	if (replaceExisting) {
		// Explicit delete: start from a clean slate (built-in pages fall back to their native views).
		target.pages = {};
		target.nav = { order: [], hidden: [] };
	}

	if (theme) {
		target.theme = JSON.parse(JSON.stringify(imported.theme));
	}
	if (header) {
		if (imported.header) {
			target.header = JSON.parse(JSON.stringify(imported.header));
		} else {
			delete target.header;
		}
	}

	const existingTitles = new Set(
		Object.values(target.pages).map((p) => (p?.title ?? "").trim().toLowerCase()).filter(Boolean),
	);
	const keys = pages === "all" ? Object.keys(imported.pages ?? {}) : pages;
	for (const key of keys) {
		const src = imported.pages?.[key];
		if (!src) {
			continue;
		}
		const page = JSON.parse(JSON.stringify(src)) as PageLayout;
		// A page arriving under a NEW key (not overwriting an existing one) gets a unique title, so you
		// don't end up with two identically-named pages in the navigation.
		if (!(key in target.pages) && page.title) {
			let title = page.title;
			let n = 2;
			while (existingTitles.has(title.trim().toLowerCase())) {
				title = `${page.title} (${n++})`;
			}
			page.title = title;
		}
		if (page.title) {
			existingTitles.add(page.title.trim().toLowerCase());
		}
		target.pages[key] = page;
	}

	if (settings) {
		const importedNav = imported.nav ?? { order: [], hidden: [] };
		if (replaceExisting) {
			target.statusHidden = imported.statusHidden;
			target.nav = JSON.parse(JSON.stringify(importedNav));
		} else {
			// Additive: keep the current order, append imported page paths not already present, and
			// union the hidden lists - so importing never reorders away or unhides existing pages.
			const order = [...(target.nav?.order ?? [])];
			for (const path of importedNav.order ?? []) {
				if (!order.includes(path)) {
					order.push(path);
				}
			}
			target.nav = { order, hidden: [...new Set([...(target.nav?.hidden ?? []), ...(importedNav.hidden ?? [])])] };
		}
	}

	return target;
}

// --- pre-import safety backup (browser-local; a one-click undo of the last import) ----------------
const PREIMPORT_KEY = "flexibleLayouts.preImportBackup";

export interface PreImportBackup {
	at: number;
	name: string;
	document: LayoutDocument;
}

/** The snapshot taken just before the most recent import, if any. */
export function getPreImportBackup(): PreImportBackup | null {
	try {
		const s = localStorage.getItem(PREIMPORT_KEY);
		return s ? (JSON.parse(s) as PreImportBackup) : null;
	} catch {
		return null;
	}
}
function setPreImportBackup(doc: LayoutDocument): void {
	try {
		localStorage.setItem(PREIMPORT_KEY, JSON.stringify({ at: Date.now(), name: doc.meta?.name ?? "", document: doc }));
	} catch {
		/* storage disabled / over quota - skip the safety net rather than block the import */
	}
}

/** Roll back to the snapshot taken before the last import. Returns false if there is none. */
export function restorePreImportBackup(): boolean {
	const backup = getPreImportBackup();
	if (!backup) {
		return false;
	}
	unregisterAllCustomPages();
	setLiveDocument(JSON.parse(JSON.stringify(backup.document)));
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
	try {
		localStorage.removeItem(PREIMPORT_KEY);
	} catch {
		/* ignore */
	}
	return true;
}

/** Apply mergeImported() to the live document and re-wire routes/theme/dependencies. */
export function applyImportedDocument(imported: LayoutDocument, opts: RestoreOptions = {}): void {
	// Snapshot the current layout first so an import can always be undone.
	setPreImportBackup(useLayoutStore().document.value);
	const target = mergeImported(useLayoutStore().document.value, imported, opts);
	unregisterAllCustomPages();
	setLiveDocument(target);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
}

/** Wrap a parsed page into a one-page import document (so single pages flow through the same merge). */
export function pageToImportDocument(parsed: { page: PageLayout; title?: string; icon?: string }): LayoutDocument {
	const doc = createEmptyDocument();
	const path = CUSTOM_PAGE_PREFIX + newItemId();
	const page: PageLayout = JSON.parse(JSON.stringify(parsed.page));
	page.kind = "custom";
	if (parsed.title) {
		page.title = parsed.title;
	}
	if (parsed.icon) {
		page.icon = parsed.icon;
	}
	doc.pages[path] = page;
	doc.nav.order.push(path);
	return doc;
}

/** Wrap a single imported panel into a one-page import document. */
export function panelToImportDocument(item: GridItemModel, title: string): LayoutDocument {
	const doc = createEmptyDocument();
	const path = CUSTOM_PAGE_PREFIX + newItemId();
	doc.pages[path] = {
		kind: "custom",
		title,
		icon: "mdi-card-outline",
		category: "control",
		grid: { cols: 12, rowHeight: 30 },
		items: [{ ...JSON.parse(JSON.stringify(item)), x: 0, y: 0 }],
	};
	doc.nav.order.push(path);
	return doc;
}

// #region Single-panel and single-page export/import

function triggerDownload(filename: string, text: string): void {
	const blob = new Blob([text], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = window.document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function safeName(name: string, fallback: string): string {
	return (name || fallback).replace(/[^a-zA-Z0-9 ._-]/g, "_").trim() || fallback;
}

export interface DwcPanelFile {
	kind: "dwcpanel";
	app: "FlexibleLayouts";
	exportedAt: string;
	item: GridItemModel;
}

export interface DwcPageFile {
	kind: "dwcpage";
	app: "FlexibleLayouts";
	exportedAt: string;
	title?: string;
	icon?: string;
	page: PageLayout;
}

/** Download a single grid item (panel or group) as a `.dwcpanel.json`. */
export function exportPanel(item: GridItemModel, label: string): void {
	const file: DwcPanelFile = {
		kind: "dwcpanel",
		app: "FlexibleLayouts",
		exportedAt: new Date().toISOString(),
		item: JSON.parse(JSON.stringify(item)),
	};
	triggerDownload(`${safeName(label, "panel")}.dwcpanel.json`, JSON.stringify(file, null, 2));
}

/** Parse a `.dwcpanel.json`; returns a ready-to-drop item with fresh ids. Throws on a bad file. */
export function parsePanelFile(text: string): GridItemModel {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("invalidJson");
	}
	const file = raw as Partial<DwcPanelFile>;
	if (!file || file.kind !== "dwcpanel" || !file.item) {
		throw new Error("notAPanel");
	}
	return reidItem(file.item);
}

/** Download a single page (its title/icon + grid) as a `.dwcpage.json`. */
export function exportPage(pageId: string, label: string): void {
	const page = useLayoutStore().getPage(pageId);
	if (!page) {
		return;
	}
	const file: DwcPageFile = {
		kind: "dwcpage",
		app: "FlexibleLayouts",
		exportedAt: new Date().toISOString(),
		title: page.title ?? label,
		icon: page.icon,
		page: JSON.parse(JSON.stringify(page)),
	};
	triggerDownload(`${safeName(page.title ?? label, "page")}.dwcpage.json`, JSON.stringify(file, null, 2));
}

/** Parse a `.dwcpage.json`; returns the page (items re-ided). Throws on a bad file. */
export function parsePageFile(text: string): { page: PageLayout; title?: string; icon?: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("invalidJson");
	}
	const file = raw as Partial<DwcPageFile>;
	if (!file || file.kind !== "dwcpage" || !file.page) {
		throw new Error("notAPage");
	}
	const page: PageLayout = JSON.parse(JSON.stringify(file.page));
	page.items = page.items.map(reidItem);
	return { page, title: file.title, icon: file.icon };
}

// #endregion
