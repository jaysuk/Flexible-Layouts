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

export interface ExplorerTab {
	id: number;
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
	activeTab: number;
	nextId: number;
	/** True once the session has been handed out before, i.e. this is a return visit and not a first open. */
	returning: boolean;
}

/** The key of the replacement Explorer page's session. */
export const EXPLORER_PAGE_SESSION = "page:/Explorer";

const sessions = new Map<string, ExplorerSession>();

function freshSession(): ExplorerSession {
	return reactive({
		tabs: [{ id: 0, kind: "directory", directory: "0:/" }] as Array<ExplorerTab>,
		activeTab: 0,
		nextId: 1,
		returning: false,
	});
}

/**
 * The session for `key`, created on first use. A `null` key is a panel that can't be told apart from another
 * (no grid item around it): it gets a private session that is not remembered.
 */
export function explorerSession(key: string | null): ExplorerSession {
	if (key === null) return freshSession();
	let session = sessions.get(key);
	if (session === undefined) {
		session = freshSession();
		sessions.set(key, session);
	} else {
		session.returning = true;
	}
	return session;
}

/** Forget every session (tests, and anything that swaps the whole document). */
export function clearExplorerSessions(): void {
	sessions.clear();
}
