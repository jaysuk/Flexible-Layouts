/**
 * Export / import of a shareable `.dwclayout.json` file.
 *
 * The file wraps the LayoutDocument with a small header so it's identifiable and version-checked.
 * Import recreates the whole layout (pages, widgets, theme) and reports any plugin dependencies the
 * recipient is missing so the UI can warn before applying.
 */
import { getLoadedPlugins } from "@/plugins";
import { useMachineStore } from "@/stores/machine";

import { type GridItemModel, type LayoutDependency, type LayoutDocument, type PageLayout, migrateDocument, reidItem } from "./document";
import { computeDependencies, recomputeDependencies } from "./dependencies";
import { registerExistingCustomPages, unregisterAllCustomPages } from "./pageManager";
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
}

/**
 * Merge selected parts of an imported document over the current live one and re-wire routes/theme.
 * Unselected parts (and current pages not present in the import) are left untouched, so this works
 * for both a full restore and a "just the theme" / "just these pages" restore.
 */
export function applyImportedDocument(imported: LayoutDocument, opts: RestoreOptions = {}): void {
	const { theme = true, header = true, settings = true, pages = "all" } = opts;
	const target = JSON.parse(JSON.stringify(useLayoutStore().document.value)) as LayoutDocument;

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
	if (settings) {
		target.statusHidden = imported.statusHidden;
		target.nav = JSON.parse(JSON.stringify(imported.nav ?? { order: [], hidden: [] }));
	}
	const keys = pages === "all" ? Object.keys(imported.pages ?? {}) : pages;
	for (const key of keys) {
		if (imported.pages?.[key]) {
			target.pages[key] = JSON.parse(JSON.stringify(imported.pages[key]));
		}
	}

	unregisterAllCustomPages();
	setLiveDocument(target);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
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
