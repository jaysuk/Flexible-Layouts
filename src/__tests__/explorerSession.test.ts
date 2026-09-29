import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";
import { mountInDwc } from "dwc-plugin-test-kit";

import { SETTINGS_SCOPE_KEY } from "@/composables/useComponentSettings";
import { nextTick } from "vue";

import ExplorerPanel from "../widgets/ExplorerPanel.vue";
import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";
import { clearViewStates } from "../model/editorViewState";
import { clearExplorerSessions } from "../model/explorerSession";
import type { ExplorerTarget } from "../model/explorerRoute";

// Same in-memory localStorage stand-in the other editor tests use (this harness's is a non-function stub).
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

const files: Record<string, string> = { "0:/macros/a.g": "G28\nG1 X10\n", "0:/macros/b.g": "M84\n" };
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

type Mounted = ReturnType<typeof mountInDwc>;
type ExposedVm = { editorInstance: { view: EditorView }; save: () => Promise<boolean> };
const editorVm = (w: Mounted) => w.findComponent(GcodeCmEditor).vm as unknown as ExposedVm;
const view = (w: Mounted): EditorView => editorVm(w).editorInstance.view;
const type = (w: Mounted, insert: string): void => view(w).dispatch({ changes: { from: 0, insert } });
const edit = (path: string): ExplorerTarget => ({ kind: "editor", path });
const dir = (path: string): ExplorerTarget => ({ kind: "directory", path });
const panelTabs = (w: Mounted) => (w.vm as unknown as { tabs: Array<{ dirty?: boolean; saves?: number; filename?: string }> }).tabs;

beforeEach(() => {
	memoryStorage.clear();
	memoryStorage.set("flexibleLayouts.useGcodeEditor", "1");
	clearExplorerSessions();
	clearViewStates();
	resetEditorColorSettingsForTests();
	uploadMock.mockClear();
});

async function mountPanel(props: Record<string, unknown>): Promise<Mounted> {
	const w = mountInDwc(ExplorerPanel, { props: { sessionKey: "test", ...props } });
	await nextTick();
	return w;
}

describe("ExplorerPanel keeps its tabs across being unmounted", () => {
	it("brings back the open file, and the tab that was showing", async () => {
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.text()).toContain("G1 X10"));
		first.unmount();

		// Back with no deep link at all - the page was reached from the nav drawer.
		const second = await mountPanel({});
		await vi.waitFor(() => expect(second.findComponent(GcodeCmEditor).exists()).toBe(true));
		expect(second.findComponent(GcodeCmEditor).props("filename")).toBe("0:/macros/a.g");
		await vi.waitFor(() => expect(second.text()).toContain("G1 X10"));
		expect(panelTabs(second)).toHaveLength(2); // the file browser and the file
		second.unmount();
	});

	it("does not share tabs between different keys - real teeth: the key is what separates two panels", async () => {
		const first = await mountPanel({ sessionKey: "one", target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.findComponent(GcodeCmEditor).exists()).toBe(true));
		first.unmount();

		const other = await mountPanel({ sessionKey: "two" });
		expect(other.findComponent(GcodeCmEditor).exists()).toBe(false);
		expect(panelTabs(other)).toHaveLength(1);
		other.unmount();
	});

	it("starts empty every time when it has no key at all", async () => {
		const first = mountInDwc(ExplorerPanel, { props: { target: edit("0:/macros/a.g") } });
		await vi.waitFor(() => expect(first.findComponent(GcodeCmEditor).exists()).toBe(true));
		first.unmount();
		const second = mountInDwc(ExplorerPanel, {});
		await nextTick();
		expect(second.findComponent(GcodeCmEditor).exists()).toBe(false);
		second.unmount();
	});

	it("brings back UNSAVED edits, still unsaved, without writing anything to the card", async () => {
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.text()).toContain("G1 X10"));
		type(first, "; my edit\n");
		first.unmount();

		const second = await mountPanel({});
		await vi.waitFor(() => expect(view(second).state.doc.toString()).toBe("; my edit\nG28\nG1 X10\n"));
		expect(panelTabs(second).find((t) => t.filename === "0:/macros/a.g")?.dirty).toBe(true);
		expect(second.text()).toContain("a.g *"); // still marked unsaved in the tab strip
		expect(uploadMock).not.toHaveBeenCalled();
		second.unmount();
	});

	it("does not report a restored unsaved tab as saved (that would re-read a menu preview)", async () => {
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.text()).toContain("G1 X10"));
		type(first, "x");
		first.unmount();
		const second = await mountPanel({});
		await vi.waitFor(() => expect(view(second).state.doc.toString()).toBe("xG28\nG1 X10\n"));
		await nextTick();
		expect(panelTabs(second).every((t) => (t.saves ?? 0) === 0)).toBe(true);
		second.unmount();
	});

	it("forgets a draft once the tab is saved, so the next return shows what is on the card", async () => {
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.text()).toContain("G1 X10"));
		type(first, "; saved\n");
		expect(await editorVm(first).save()).toBe(true);
		files["0:/macros/a.g"] = "; saved\nG28\nG1 X10\n"; // what the card now holds
		first.unmount();
		const second = await mountPanel({});
		await vi.waitFor(() => expect(view(second).state.doc.toString()).toBe("; saved\nG28\nG1 X10\n"));
		expect(second.text()).not.toContain("a.g *");
		files["0:/macros/a.g"] = "G28\nG1 X10\n";
		second.unmount();
	});

	it("keeps a bare return to the root from throwing away the open file, but still obeys a real deep link", async () => {
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.findComponent(GcodeCmEditor).exists()).toBe(true));
		first.unmount();

		const bare = await mountPanel({ target: dir("0:/") });
		expect(bare.findComponent(GcodeCmEditor).exists()).toBe(true); // still on the file
		bare.unmount();

		const deep = await mountPanel({ target: edit("0:/macros/b.g") });
		await vi.waitFor(() => expect(deep.findComponent(GcodeCmEditor).props("filename")).toBe("0:/macros/b.g"));
		expect(panelTabs(deep)).toHaveLength(3); // browser, a.g (kept), b.g
		deep.unmount();
	});

	it("only warns about leaving for edits that would really be lost (a Monaco tab), not the new editor's", async () => {
		const w = await mountPanel({ target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(w.findComponent(GcodeCmEditor).exists()).toBe(true));
		await vi.waitFor(() => expect(w.text()).toContain("G1 X10"));
		type(w, "x");
		await nextTick();
		expect(w.emitted("dirty-change")).toBeUndefined(); // stashed on unmount, so nothing to warn about

		memoryStorage.set("flexibleLayouts.useGcodeEditor", "0");
		panelTabs(w).find((t) => t.filename === "0:/macros/a.g")!.dirty = false;
		await nextTick();
		panelTabs(w).find((t) => t.filename === "0:/macros/a.g")!.dirty = true; // an edit reported by a Monaco tab
		await nextTick();
		expect(w.emitted("dirty-change")?.at(-1)).toEqual([true]);
		w.unmount();
	});
});

describe("an Explorer panel placed on a page", () => {
	// FlexGridItem gives every placed widget a settings scope keyed by its grid item id.
	const inItem = (id: string, props: Record<string, unknown> = {}) => mountInDwc(ExplorerPanel, {
		props, global: { provide: { [SETTINGS_SCOPE_KEY as symbol]: { segments: [id], childCounter: {} } } },
	});

	it("keeps its own tabs across the page being left, apart from the panel next to it", async () => {
		const first = inItem("item-1", { target: edit("0:/macros/a.g") });
		await vi.waitFor(() => expect(first.findComponent(GcodeCmEditor).exists()).toBe(true));
		first.unmount();

		const again = inItem("item-1");
		await vi.waitFor(() => expect(again.findComponent(GcodeCmEditor).props("filename")).toBe("0:/macros/a.g"));
		again.unmount();

		const sibling = inItem("item-2");
		await nextTick();
		expect(sibling.findComponent(GcodeCmEditor).exists()).toBe(false);
		sibling.unmount();
	});
});

describe("ExplorerPanel after a Monaco edit was lost", () => {
	it("does not come back claiming the tab is unsaved when its text did not survive", async () => {
		memoryStorage.set("flexibleLayouts.useGcodeEditor", "0");
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		panelTabs(first).find((t) => t.filename === "0:/macros/a.g")!.dirty = true; // Monaco reported an edit
		first.unmount(); // ...which took its text with it: there is no draft to bring back

		const second = await mountPanel({});
		const tab = panelTabs(second).find((t) => t.filename === "0:/macros/a.g")!;
		expect(tab.dirty).toBe(false);
		expect(second.text()).not.toContain("a.g *");
		second.unmount();
	});
});

describe("ExplorerPanel reports where it is, for the URL", () => {
	it("emits the active tab's file, and a browser tab's folder", async () => {
		const w = await mountPanel({ target: edit("0:/macros/a.g") });
		const locations = () => (w.emitted("location") ?? []).map((e) => e[0]);
		expect(locations().at(-1)).toEqual(edit("0:/macros/a.g"));
		await w.setProps({ target: dir("0:/sys") });
		await nextTick();
		expect(locations().at(-1)).toEqual(dir("0:/sys"));
		w.unmount();
	});

	it("reports the restored tab on a bare return, so the host can put it in the URL", async () => {
		const first = await mountPanel({ target: edit("0:/macros/a.g") });
		first.unmount();
		const second = await mountPanel({ target: dir("0:/") });
		expect((second.emitted("location") ?? []).map((e) => e[0])).toEqual([edit("0:/macros/a.g")]);
		second.unmount();
	});
});

describe("GcodeCmEditor remembers where you were", () => {
	it("opens a file with the cursor where the last instance left it", async () => {
		const first = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/a.g" } });
		await vi.waitFor(() => expect(first.text()).toContain("G1 X10"));
		await nextTick();
		view(first).dispatch({ selection: { anchor: 6 } });
		first.unmount(); // saves on destroy

		const second = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/a.g" } });
		await vi.waitFor(() => expect(view(second).state.selection.main.head).toBe(6));
		second.unmount();
	});

	it("stashes unsaved text as it goes, and only then", async () => {
		const clean = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/a.g" } });
		await vi.waitFor(() => expect(clean.text()).toContain("G1 X10"));
		clean.unmount();
		expect(clean.emitted("stash")).toBeUndefined();

		const dirty = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/a.g" } });
		await vi.waitFor(() => expect(dirty.text()).toContain("G1 X10"));
		type(dirty, "; hi\n");
		dirty.unmount();
		expect(dirty.emitted("stash")).toEqual([["; hi\nG28\nG1 X10\n"]]);
	});

	it("puts a draft over the file, dirty, with no clean moment in between", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/a.g", draft: "G28\nG1 X99\n" } });
		await vi.waitFor(() => expect(w.text()).toContain("G1 X99"));
		expect(view(w).state.doc.toString()).toBe("G28\nG1 X99\n");
		expect(w.emitted("dirty")).toEqual([[true]]);
		w.unmount();
	});

	it("ignores a draft that is identical to the file", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/a.g", draft: files["0:/macros/a.g"] } });
		await vi.waitFor(() => expect(w.text()).toContain("G1 X10"));
		expect(w.emitted("dirty")).toEqual([[false]]);
		w.unmount();
	});
});
