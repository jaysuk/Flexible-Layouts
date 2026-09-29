import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";
import { mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

import ExplorerPanel from "../widgets/ExplorerPanel.vue";
import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";
import { clearViewStates } from "../model/editorViewState";
import {
	activateTab, addTab, canSplit, closeSplitPanes, isShowing, isSplit, moveTabToPane, paneOf, removeTab, splitPanes,
} from "../model/explorerPanes";
import { clearExplorerSessions, explorerSession, releaseExplorerSession } from "../model/explorerSession";
import type { ExplorerTarget } from "../model/explorerRoute";

// Same in-memory localStorage stand-in the other editor tests use (this harness's is a non-function stub).
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

const files: Record<string, string> = { "0:/macros/a.g": "G28\nG1 X10\n", "0:/macros/b.g": "M84\n", "0:/macros/c.g": "M117 \"c\"\n" };
const uploadMock = vi.fn(async () => undefined);
const downloadMock = vi.fn(async (options: { filename: string }) => {
	const text = files[options.filename];
	if (text === undefined) throw new Error("not found"); // also the shared colour-scheme SD file
	return text;
});

vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return { ...actual, useMachineStore: () => ({ ...actual.useMachineStore(), download: downloadMock, upload: uploadMock }) };
});

beforeEach(() => {
	memoryStorage.clear();
	memoryStorage.set("flexibleLayouts.useGcodeEditor", "1");
	clearExplorerSessions();
	clearViewStates();
	resetEditorColorSettingsForTests();
	uploadMock.mockClear();
});

// ---------------------------------------------------------------------------------------------------------
// The pane operations, on a bare session (no component).
// ---------------------------------------------------------------------------------------------------------
describe("explorerPanes", () => {
	function session() {
		const s = explorerSession(null);
		// The fresh session holds one folder tab (id 0). Two editors, like a user with two files open.
		const a = addTab(s, { kind: "editor", filename: "0:/a.g" });
		const b = addTab(s, { kind: "editor", filename: "0:/b.g" });
		return { s, a, b };
	}

	it("starts unsplit, with every tab in the left pane", () => {
		const { s } = session();
		expect(isSplit(s)).toBe(false);
		expect(s.tabs.every((t) => paneOf(t) === 1)).toBe(true);
		expect(s.groups).toHaveLength(1);
		releaseExplorerSession(s);
	});

	it("splitting moves the showing tab into a right pane, keeping each tab's own object and id", () => {
		const { s, a, b } = session();
		const before = new Map(s.tabs.map((t) => [t.id, t]));
		expect(canSplit(s)).toBe(true);
		splitPanes(s);
		expect(isSplit(s)).toBe(true);
		expect(paneOf(s.tabs.find((t) => t.id === b)!)).toBe(2);
		expect(paneOf(s.tabs.find((t) => t.id === a)!)).toBe(1);
		// Same tab objects (the panel writes `dirty`/`draft` on them) and the same ids (they key the DOM).
		for (const t of s.tabs) expect(t).toBe(before.get(t.id));
		expect(s.focusedGroup).toBe(2);
		expect(s.activeTab).toBe(b);
		releaseExplorerSession(s);
	});

	it("shows one tab per pane, not one overall", () => {
		const { s, a, b } = session();
		splitPanes(s);
		expect(isShowing(s, s.tabs.find((t) => t.id === a)!)).toBe(true);
		expect(isShowing(s, s.tabs.find((t) => t.id === b)!)).toBe(true);
		expect(isShowing(s, s.tabs.find((t) => t.id === 0)!)).toBe(false);
		releaseExplorerSession(s);
	});

	it("activating a tab focuses ITS pane, and activeTab follows the focused pane", () => {
		const { s, a, b } = session();
		splitPanes(s);
		activateTab(s, a);
		expect(s.focusedGroup).toBe(1);
		expect(s.activeTab).toBe(a);
		activateTab(s, b);
		expect(s.focusedGroup).toBe(2);
		expect(s.activeTab).toBe(b);
		releaseExplorerSession(s);
	});

	it("a new tab opens in the focused pane", () => {
		const { s, b } = session();
		splitPanes(s); // focus on the right pane
		const c = addTab(s, { kind: "editor", filename: "0:/c.g" });
		expect(paneOf(s.tabs.find((t) => t.id === c)!)).toBe(2);
		expect(paneOf(s.tabs.find((t) => t.id === b)!)).toBe(2);
		releaseExplorerSession(s);
	});

	it("dragging the last tab out of a pane collapses the split and keeps every tab id", () => {
		const { s, a, b } = session();
		splitPanes(s); // left: folder + a, right: b
		const ids = s.tabs.map((t) => t.id).sort();
		moveTabToPane(s, b, 1);
		expect(isSplit(s)).toBe(false);
		expect(s.tabs.every((t) => paneOf(t) === 1)).toBe(true);
		expect(s.tabs.map((t) => t.id).sort()).toEqual(ids);
		expect(s.activeTab).toBe(b);
		expect(a).toBeGreaterThan(0);
		releaseExplorerSession(s);
	});

	it("removing the last tab of the right pane collapses the split", () => {
		const { s, b } = session();
		splitPanes(s);
		removeTab(s, b);
		expect(isSplit(s)).toBe(false);
		expect(s.tabs.map((t) => t.id)).not.toContain(b);
		releaseExplorerSession(s);
	});

	it("close split merges the right pane back", () => {
		const { s } = session();
		splitPanes(s);
		closeSplitPanes(s);
		expect(isSplit(s)).toBe(false);
		expect(s.tabs.every((t) => paneOf(t) === 1)).toBe(true);
		releaseExplorerSession(s);
	});

	it("cannot split a lone tab", () => {
		const s = explorerSession(null);
		expect(canSplit(s)).toBe(false);
		splitPanes(s);
		expect(isSplit(s)).toBe(false);
		releaseExplorerSession(s);
	});
});

// ---------------------------------------------------------------------------------------------------------
// The panel: two files side by side, and the review of Duet3D/DuetWebControl#517 - an editor must not be
// unmounted (losing unsaved edits, undo history, scroll) when its tab changes pane.
// ---------------------------------------------------------------------------------------------------------
type Mounted = ReturnType<typeof mountInDwc>;
type ExposedVm = { editorInstance: { view: EditorView }; save: () => Promise<boolean> };
const edit = (path: string): ExplorerTarget => ({ kind: "editor", path });
const slot = (w: Mounted, id: number) => w.find(`[data-tab-id="${id}"]`);
const editorAt = (w: Mounted, id: number): ExposedVm =>
	w.findAllComponents(GcodeCmEditor).find((c) => slot(w, id).element.contains(c.element))!.vm as unknown as ExposedVm;
const docOf = (w: Mounted, id: number): string => editorAt(w, id).editorInstance.view.state.doc.toString();
const splitBtn = (w: Mounted) => w.find("[data-explorer-split]");
const closeSplitBtn = (w: Mounted) => w.find("[data-explorer-close-split]");
const drop = (w: Mounted, paneIndex: number, tabId: number) =>
	w.findAll(".exp-body")[paneIndex].trigger("drop", { dataTransfer: { getData: () => String(tabId) } });
const column = (w: Mounted, id: number) => (slot(w, id).element as HTMLElement).style.gridColumn;

async function mountPanel(props: Record<string, unknown>): Promise<Mounted> {
	const w = mountInDwc(ExplorerPanel, { props: { sessionKey: "split", ...props } });
	await nextTick();
	return w;
}

/**
 * The folder tab (0), a.g (1) with an UNSAVED edit, b.g (2) showing. a stays mounted because it is dirty -
 * exactly the state a user is in when they reach for "split right" to look at another file next to it.
 */
async function withUnsavedA() {
	const w = await mountPanel({ target: edit("0:/macros/a.g") });
	await vi.waitFor(() => expect(w.text()).toContain("G1 X10"));
	editorAt(w, 1).editorInstance.view.dispatch({ changes: { from: 0, insert: "; mine\n" } });
	await w.setProps({ target: edit("0:/macros/b.g") });
	await vi.waitFor(() => expect(w.text()).toContain("M84"));
	return w;
}

describe("ExplorerPanel split view", () => {
	it("shows two files side by side, each in its own pane", async () => {
		const w = await withUnsavedA();
		await splitBtn(w).trigger("click");
		await nextTick();

		await vi.waitFor(() => expect(w.findAllComponents(GcodeCmEditor)).toHaveLength(2));
		expect(docOf(w, 1)).toBe("; mine\nG28\nG1 X10\n");
		expect(docOf(w, 2)).toBe("M84\n");
		expect(column(w, 1)).toBe("1");
		expect(column(w, 2)).toBe("3");
		expect((w.find(".exp-panes").element as HTMLElement).style.gridTemplateColumns).toContain("7px");
		expect(w.find(".exp-divider").exists()).toBe(true);
		// a strip per pane, each with its own tabs
		expect(w.findAll(".exp-strip .v-tabs")).toHaveLength(2);
		w.unmount();
	});

	it("does not offer a split with only one tab, and offers Close split only on the right pane", async () => {
		const only = await mountPanel({ target: edit("0:/macros/c.g") }); // folder + c
		await vi.waitFor(() => expect(only.text()).toContain("M117"));
		expect(splitBtn(only).exists()).toBe(true); // 2 tabs: allowed
		expect(closeSplitBtn(only).exists()).toBe(false);
		await splitBtn(only).trigger("click");
		await nextTick();
		expect(splitBtn(only).exists()).toBe(false);
		expect(only.findAll("[data-explorer-close-split]")).toHaveLength(1);
		only.unmount();

		clearExplorerSessions();
		const lone = await mountPanel({ sessionKey: "lone" });
		expect(splitBtn(lone).exists()).toBe(false); // one tab: no strip, no split button
		lone.unmount();
	});

	describe("an editor survives every pane transition (PR #517: no remount, unsaved text kept)", () => {
		function snapshot(w: Mounted, ids: number[] = [1, 2]) {
			return ids.map((id) => ({ id, el: slot(w, id).element, cm: slot(w, id).find(".cm-editor").element }));
		}
		function expectSurvived(w: Mounted, snap: ReturnType<typeof snapshot>) {
			for (const { id, el, cm } of snap) {
				expect(slot(w, id).element, `slot ${id}`).toBe(el);
				expect(slot(w, id).find(".cm-editor").element, `editor ${id}`).toBe(cm);
			}
			expect(docOf(w, 1)).toBe("; mine\nG28\nG1 X10\n"); // the unsaved edit is still there, still unsaved
			expect(uploadMock).not.toHaveBeenCalled();
		}

		it("through Split right and Close split", async () => {
			const w = await withUnsavedA();
			await vi.waitFor(() => expect(slot(w, 2).find(".cm-editor").exists()).toBe(true));
			const snap = snapshot(w);
			await splitBtn(w).trigger("click"); // b moves to the right pane
			await nextTick();
			expectSurvived(w, snap);
			await closeSplitBtn(w).trigger("click");
			await nextTick();
			expectSurvived(w, snap);
			w.unmount();
		});

		it("when its tab is dragged across, and back", async () => {
			const w = await withUnsavedA();
			await vi.waitFor(() => expect(slot(w, 2).find(".cm-editor").exists()).toBe(true));
			// Only a is tracked: dropping it on the right pane makes it that pane's showing tab, so b (clean, hidden)
			// is unmounted on demand as before - nothing to lose there. a is dirty, so it must never be.
			const snap = snapshot(w, [1]);
			await splitBtn(w).trigger("click"); // left: folder + a, right: b
			await nextTick();
			await drop(w, 1, 1); // a -> right pane
			await nextTick();
			expectSurvived(w, snap);
			expect(column(w, 1)).toBe("3"); // it really moved
			await drop(w, 0, 1); // ...and back
			await nextTick();
			expectSurvived(w, snap);
			expect(column(w, 1)).toBe("1");
			w.unmount();
		});

		it("when a pane empties and the split collapses (the group-id rename that remounted in the PR)", async () => {
			const w = await withUnsavedA();
			await vi.waitFor(() => expect(slot(w, 2).find(".cm-editor").exists()).toBe(true));
			const snap = snapshot(w);
			await splitBtn(w).trigger("click");
			await nextTick();
			await drop(w, 0, 2); // b out of the right pane: it is empty, so the split collapses
			await nextTick();
			expect(w.find(".exp-divider").exists()).toBe(false);
			expectSurvived(w, snap);
			w.unmount();
		});

		it("keeps the editors in a fixed DOM order however tabs move (a moved DOM node loses its scroll)", async () => {
			const w = await withUnsavedA();
			const order = () => w.findAll(".exp-slot").map((s) => s.attributes("data-tab-id"));
			expect(order()).toEqual(["0", "1", "2"]);
			await splitBtn(w).trigger("click");
			await drop(w, 1, 1);
			await nextTick();
			expect(order()).toEqual(["0", "1", "2"]);
			w.unmount();
		});
	});

	describe("the URL (what #517 got wrong: it carried no pane)", () => {
		const lastLocation = (w: Mounted) => {
			const events = w.emitted("location") as Array<[ExplorerTarget]>;
			return events[events.length - 1][0];
		};

		it("reports the focused pane's file, whichever pane that is", async () => {
			const w = await withUnsavedA();
			await splitBtn(w).trigger("click"); // focus: right pane, b
			await nextTick();
			expect(lastLocation(w)).toEqual(edit("0:/macros/b.g"));
			await w.findAll(".exp-strip .v-tab").find((t) => t.text().includes("a.g"))!.trigger("click");
			await nextTick();
			await nextTick();
			expect(lastLocation(w)).toEqual(edit("0:/macros/a.g"));
			w.unmount();
		});

		it("focusing an editor moves the focus (and so the URL) to its pane", async () => {
			const w = await withUnsavedA();
			await splitBtn(w).trigger("click"); // focus: right pane, b
			await nextTick();
			expect(lastLocation(w)).toEqual(edit("0:/macros/b.g"));
			slot(w, 1).find(".cm-content").element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
			await nextTick();
			expect(lastLocation(w)).toEqual(edit("0:/macros/a.g"));
			w.unmount();
		});

		it("resolves a deep link to a file open in the OTHER pane by focusing it - no duplicate tab, no overwrite", async () => {
			const w = await withUnsavedA();
			await splitBtn(w).trigger("click"); // a: left, b: right (focused)
			await nextTick();
			const tabCount = () => (w.vm as unknown as { tabs: unknown[] }).tabs.length;
			expect(tabCount()).toBe(3);

			await w.setProps({ target: edit("0:/macros/a.g") }); // e.g. browser Back to the first file
			await nextTick();
			expect(tabCount()).toBe(3);
			expect(lastLocation(w)).toEqual(edit("0:/macros/a.g"));
			expect(docOf(w, 1)).toBe("; mine\nG28\nG1 X10\n");
			expect(docOf(w, 2)).toBe("M84\n"); // the other pane was left alone
			w.unmount();
		});
	});

	it("keeps the split, and the unsaved edit, across the panel being unmounted (a trip to another page)", async () => {
		const first = await withUnsavedA();
		await splitBtn(first).trigger("click");
		await nextTick();
		first.unmount();

		const second = await mountPanel({});
		await vi.waitFor(() => expect(second.findAllComponents(GcodeCmEditor)).toHaveLength(2));
		expect(column(second, 1)).toBe("1");
		expect(column(second, 2)).toBe("3");
		await vi.waitFor(() => expect(docOf(second, 1)).toBe("; mine\nG28\nG1 X10\n"));
		second.unmount();
	});

	it("closing the last tab of the right pane collapses the split", async () => {
		const w = await withUnsavedA();
		await splitBtn(w).trigger("click");
		await nextTick();
		await w.findAll(".exp-strip .v-tab").find((t) => t.text().includes("b.g"))!.find("button").trigger("click");
		await nextTick();
		expect(w.find(".exp-divider").exists()).toBe(false);
		expect(closeSplitBtn(w).exists()).toBe(false);
		expect(docOf(w, 1)).toBe("; mine\nG28\nG1 X10\n");
		w.unmount();
	});
});
