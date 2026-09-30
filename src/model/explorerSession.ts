/**
 * What an Explorer panel has open - its tabs, which one is showing, where each file browser is - kept
 * OUTSIDE the panel component so it survives the component being unmounted.
 *
 * DWC's own Explorer page is kept alive while you browse elsewhere (`meta.keepAlive`), so its open editors
 * are simply still there when you come back. Flexible Layouts can't get the same for free: a plugin route
 * can't set `keepAlive` (`registerRoute` only takes `pageFill`/`scrollToBottom`, and DwcRouterView reads the
 * include list once at setup), and an overridden page renders through `RouteOverrideDispatcher`, which hides
 * the page's own component name from `keep-alive` anyway. So the panel is unmounted on every trip to another
 * page or tab, and everything it held in its own `ref`s went with it.
 *
 * Sessions are keyed: the replacement Explorer page has one (`EXPLORER_PAGE_SESSION`), and each Explorer panel
 * placed on a dashboard page has its own (its grid item id), so two panels never share tabs. A session lasts
 * until the browser page is reloaded - it holds unsaved text, which is not something to write to storage
 * behind the user's back.
 */
import { reactive } from "vue";
import type { GroupId } from "dwc-gcode-editor";

import { childItemLists, type GridItemModel, type LayoutDocument } from "./document";

export interface ExplorerTab {
	id: number;
	/** Which pane the tab is in (1 = left/only, 2 = right). Unset means 1. Only `model/explorerPanes.ts` writes it. */
	groupId?: GroupId;
	kind: "directory" | "editor";
	filename?: string;
	directory?: string;
	dirty?: boolean;
	/** Menu files: whether the 12864 preview is showing, and how many times the file has been saved (re-reads the preview). */
	preview?: boolean;
	saves?: number;
	/** Menu files open in the new editor: the unsaved buffer as last reported (`live-text`); undefined until edited. */
	liveText?: string;
	/**
	 * The unsaved text of an editor that was unmounted while dirty, handed back to the next editor for this
	 * tab so the edits come back with it. Only the new editor can do this (DWC's Monaco exposes no text).
	 */
	draft?: string;
}

export interface ExplorerSession {
	tabs: Array<ExplorerTab>;
	/** The active tab of the FOCUSED pane - the one a host mirrors in the URL. Kept in step by `model/explorerPanes.ts`. */
	activeTab: number;
	nextId: number;
	/** Length 1, or 2 while the panel is split (two files side by side). Each pane's own showing tab. */
	groups: Array<{ id: GroupId; activeTabId: number | null }>;
	/** The pane that last had focus: where a new tab opens, and whose tab `activeTab` is. */
	focusedGroup: GroupId;
	/** Width of the left pane as a fraction of the panel, meaningful only while split. */
	splitRatio: number;
	/** True once the session has been handed out before, i.e. this is a return visit and not a first open. */
	returning: boolean;
}

/** The key of the replacement Explorer page's session. */
export const EXPLORER_PAGE_SESSION = "page:/Explorer";

const sessions = new Map<string, ExplorerSession>();
/** Sessions of panels that can't be told apart (no key): not remembered, but still counted by the unload guard while mounted. */
const privateSessions = new Set<ExplorerSession>();

/** The session key of an Explorer panel placed on a page: its grid item id (see `ExplorerPanel.vue`). */
const PANEL_KEY_PREFIX = "panel:";

function freshSession(): ExplorerSession {
	return reactive({
		tabs: [{ id: 0, kind: "directory", directory: "0:/" }] as Array<ExplorerTab>,
		activeTab: 0,
		nextId: 1,
		groups: [{ id: 1, activeTabId: 0 }],
		focusedGroup: 1,
		splitRatio: 0.5,
		returning: false,
	});
}

/**
 * The session for `key`, created on first use. A `null` key is a panel that can't be told apart from another
 * (no grid item around it): it gets a private session that is not remembered - hand it back with
 * `releaseExplorerSession` when the panel goes.
 */
export function explorerSession(key: string | null): ExplorerSession {
	installUnloadGuard();
	if (key === null) {
		const session = freshSession();
		privateSessions.add(session);
		return session;
	}
	let session = sessions.get(key);
	if (session === undefined) {
		session = freshSession();
		sessions.set(key, session);
	} else {
		session.returning = true;
	}
	return session;
}

/** A panel with a private (unkeyed) session is going away; a keyed session is kept and this does nothing. */
export function releaseExplorerSession(session: ExplorerSession): void {
	privateSessions.delete(session);
}

/** Forget every session (tests, and anything that swaps the whole document). */
export function clearExplorerSessions(): void {
	sessions.clear();
	privateSessions.clear();
}

/**
 * Forget the sessions of Explorer panels that are no longer in `doc` (it was swapped for another layout, or the
 * panel was deleted), so their tabs and unsaved drafts don't sit in memory - and hold the unload guard up -
 * for a panel nobody can reach. The replacement Explorer page's own session is not tied to the document and stays.
 */
export function pruneExplorerSessions(doc: LayoutDocument): void {
	const live = new Set<string>();
	const visit = (items?: Array<GridItemModel>): void => {
		for (const item of items ?? []) {
			if (!item) continue;
			live.add(item.i);
			for (const children of childItemLists(item.widget)) visit(children);
		}
	};
	for (const page of Object.values(doc.pages ?? {})) {
		visit(page?.items);
		visit(page?.variants?.md);
		visit(page?.variants?.sm);
	}
	visit(doc.header?.items);
	for (const key of [...sessions.keys()]) {
		// A nested scope can add segments after the grid item's id, so any live id among them keeps the session.
		if (key.startsWith(PANEL_KEY_PREFIX) && !key.slice(PANEL_KEY_PREFIX.length).split("/").some((id) => live.has(id))) {
			sessions.delete(key);
		}
	}
}

/** Whether any remembered or mounted Explorer session holds an editor tab with unsaved edits. */
export function hasUnsavedExplorerEdits(): boolean {
	const unsaved = (session: ExplorerSession): boolean => session.tabs.some((tab) => tab.kind === "editor" && tab.dirty);
	return [...sessions.values()].some(unsaved) || [...privateSessions].some(unsaved);
}

// The same browser-level guard DWC's own Explorer page keeps while an editor has unsaved changes. It has to
// live here, not in the panel: leaving the page unmounts the panel but keeps the stashed drafts, and a reload
// then would drop them just the same.
function onBeforeUnload(e: BeforeUnloadEvent): void {
	if (hasUnsavedExplorerEdits()) {
		e.preventDefault();
		e.returnValue = "";
	}
}

let unloadGuardInstalled = false;
function installUnloadGuard(): void {
	if (unloadGuardInstalled || typeof window === "undefined") return;
	window.addEventListener("beforeunload", onBeforeUnload);
	unloadGuardInstalled = true;
}
