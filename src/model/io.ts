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

/** Serialise the current document and trigger a browser download. */
export function exportLayout(): void {
	const doc = useLayoutStore().document.value;
	// Make sure captured dependencies are current before sharing.
	recomputeDependencies();

	const file: DwcLayoutFile = {
		kind: FILE_KIND,
		app: "FlexibleLayouts",
		fileVersion: FILE_VERSION,
		exportedAt: new Date().toISOString(),
		document: JSON.parse(JSON.stringify(doc)),
	};

	const safeName = (doc.meta.name || "layout").replace(/[^a-zA-Z0-9 ._-]/g, "_").trim() || "layout";
	const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = window.document.createElement("a");
	a.href = url;
	a.download = `${safeName}.dwclayout.json`;
	a.click();
	URL.revokeObjectURL(url);
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

/** Replace the live document with an imported one and re-wire routes/theme. */
export function applyImportedDocument(document: LayoutDocument): void {
	unregisterAllCustomPages();
	setLiveDocument(document);
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
