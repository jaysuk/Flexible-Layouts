/**
 * Split-pane operations for an Explorer session: two files (or a file and a folder) side by side.
 *
 * The state machine is `dwc-gcode-editor`'s `workspace.ts` - the same one the G-code postprocessor uses - and
 * this module is only the adapter between it and the session's mutable tab objects. It builds a
 * `WorkspaceState` around the session's own tab objects (`data` is the SAME object, not a copy, so the
 * `dirty`/`draft` fields the panel already writes stay live), applies one pure operation, and writes the result
 * back. Tab ids never change, so the panel can render every tab flat and keep each editor mounted while it
 * changes pane - see `ExplorerPanel.vue` and the rendering rule at the top of `workspace.ts`.
 */
import {
	canSplit as wsCanSplit, closeSplit, closeTab, collapseEmptyGroup, moveTab, PRIMARY_GROUP, setActiveTab,
	setSplitRatio, splitRight, type GroupId, type WorkspaceState,
} from "dwc-gcode-editor";

import type { ExplorerSession, ExplorerTab } from "./explorerSession";

function toWorkspace(session: ExplorerSession): WorkspaceState<ExplorerTab> {
	return {
		tabs: session.tabs.map((tab) => ({ id: tab.id, groupId: tab.groupId ?? PRIMARY_GROUP, dirty: !!tab.dirty, data: tab })),
		groups: session.groups.map((g) => ({ id: g.id, activeTabId: g.activeTabId })),
		focusedGroupId: session.focusedGroup,
		splitRatio: session.splitRatio,
		nextId: session.nextId,
	};
}

function commit(session: ExplorerSession, next: WorkspaceState<ExplorerTab>): void {
	session.tabs.splice(0, session.tabs.length, ...next.tabs.map((t) => {
		t.data.groupId = t.groupId;
		return t.data;
	}));
	session.groups = next.groups.map((g) => ({ id: g.id, activeTabId: g.activeTabId }));
	session.focusedGroup = next.focusedGroupId;
	session.splitRatio = next.splitRatio;
	session.activeTab = session.groups.find((g) => g.id === next.focusedGroupId)?.activeTabId ?? session.activeTab;
}

/** Whether the panel is showing two panes. */
export function isSplit(session: ExplorerSession): boolean {
	return session.groups.length > 1;
}

/** The pane a tab is in. */
export function paneOf(tab: ExplorerTab): GroupId {
	return tab.groupId ?? PRIMARY_GROUP;
}

/** Whether a tab is the one its own pane is showing (in a split, that is one tab per pane, not one overall). */
export function isShowing(session: ExplorerSession, tab: ExplorerTab): boolean {
	return session.groups.find((g) => g.id === paneOf(tab))?.activeTabId === tab.id;
}

/** Show a tab and focus its pane. */
export function activateTab(session: ExplorerSession, id: number): void {
	commit(session, setActiveTab(toWorkspace(session), id));
}

/** Add a tab to the focused pane and show it. Returns its id. */
export function addTab(session: ExplorerSession, tab: Omit<ExplorerTab, "id" | "groupId">): number {
	const id = session.nextId++;
	session.tabs.push({ ...tab, id, groupId: session.focusedGroup });
	activateTab(session, id);
	return id;
}

/** Remove a tab; a pane left with no tabs goes away (the split collapses). Confirmation and the "last folder
 *  tab" rule are the panel's business, not this function's. */
export function removeTab(session: ExplorerSession, id: number): void {
	commit(session, collapseEmptyGroup(closeTab(toWorkspace(session), id)));
}

/** Move a tab into a pane (drag a tab across), optionally before another tab of that pane. */
export function moveTabToPane(session: ExplorerSession, id: number, groupId: GroupId, beforeTabId: number | null = null): void {
	commit(session, collapseEmptyGroup(moveTab(toWorkspace(session), id, groupId, beforeTabId)));
}

export function canSplit(session: ExplorerSession): boolean {
	return wsCanSplit(toWorkspace(session));
}

/** Put the showing tab of the left pane into a new right pane. */
export function splitPanes(session: ExplorerSession): void {
	commit(session, splitRight(toWorkspace(session)));
}

/** Merge the right pane's tabs back into the left one. */
export function closeSplitPanes(session: ExplorerSession): void {
	commit(session, closeSplit(toWorkspace(session)));
}

export function setPaneRatio(session: ExplorerSession, ratio: number): void {
	commit(session, setSplitRatio(toWorkspace(session), ratio));
}
