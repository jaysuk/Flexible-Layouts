import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TabsEditor from "../src/editor/TabsEditor.vue";
import { computeDependencies } from "../src/model/dependencies";
import { editMode } from "../src/model/editorState";
import FlexPage from "../src/page/FlexPage.vue";
import {
	childItemLists, createDefaultWidget, createEmptyDocument, forEachWidget, mapChildItemLists, reidItem, sanitizeRuntimeFields,
	type GridItemModel, type TabDef, type Widget,
} from "../src/model/document";
import { parsePanelFile } from "../src/model/io";
import { getSelectedTab, isCollapsed, resetContainerStateForTests, setCollapsed, setSelectedTab, toggleCollapsed } from "../src/model/containerState";
import { useLayoutStore } from "../src/model/store";
import { WIDGET_PATCH_KEY } from "../src/util/widgetPatch";
import { ITEM_ID_KEY } from "../src/util/itemContext";
import GroupWidget from "../src/widgets/GroupWidget.vue";
import TabsWidget from "../src/widgets/TabsWidget.vue";

enableAutoUnmount(afterEach);

type TabsW = Extract<Widget, { type: "tabs" }>;
const label = (text: string): Widget => ({ type: "label", variant: "text", content: text }) as Widget;
const item = (i: string, widget: Widget, extra: Record<string, unknown> = {}): GridItemModel => ({ i, x: 0, y: 0, w: 4, h: 2, widget, ...extra }) as GridItemModel;
const tab = (id: string, title: string, items: Array<GridItemModel> = [], extra: Partial<TabDef> = {}): TabDef => ({ id, title, items, ...extra });
const tabs = (t: Array<TabDef>, extra: Record<string, unknown> = {}): TabsW => ({ type: "tabs", title: "Panel", tabs: t, ...extra }) as TabsW;

function twoTabs(extra: Record<string, unknown> = {}): TabsW {
	return tabs([
		tab("t1", "One", [item("a", label("alpha text"))]),
		tab("t2", "Two", [item("b", label("bravo text"))]),
	], extra);
}

let storage: Map<string, string>;
beforeEach(() => {
	storage = new Map();
	vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v), removeItem: (k: string) => void storage.delete(k) });
	resetContainerStateForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe("the tabs type in the shared walkers (child-walker refactor, step 0)", () => {
	const nested = () => item("outer", tabs([
		tab("t1", "One", [item("x1", label("x1")), item("x2", tabs([tab("n1", "Inner", [item("deep", label("deep"))])]))]),
		tab("t2", "Two", [item("y1", label("y1"))]),
	]));

	it("childItemLists returns one live list per tab", () => {
		const o = nested();
		const lists = childItemLists(o.widget);
		expect(lists).toHaveLength(2);
		expect(lists[0]).toBe((o.widget as TabsW).tabs[0].items);
		expect(lists[1]).toBe((o.widget as TabsW).tabs[1].items);
	});

	it("mapChildItemLists rewrites every tab's list", () => {
		const w = twoTabs();
		mapChildItemLists(w, () => []);
		expect(w.tabs.map((t) => t.items.length)).toEqual([0, 0]);
	});

	it("forEachWidget reaches every nested widget, in every tab", () => {
		const doc = createEmptyDocument();
		doc.pages["/p"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items: [nested()] } as never;
		const seen: string[] = [];
		forEachWidget(doc, (w) => seen.push(w.type === "label" ? String((w as { content?: string }).content) : w.type));
		expect(seen.sort()).toEqual(["deep", "tabs", "tabs", "x1", "y1"].sort());
	});

	it("reidItem gives every nested item AND every tab a new id, and leaves the source alone", () => {
		const o = nested();
		const before = JSON.stringify(o);
		const clone = reidItem(o);
		const ids = (it: GridItemModel): string[] => [it.i, ...childItemLists(it.widget).flatMap((l) => l.flatMap(ids))];
		const oldIds = ids(o);
		const newIds = ids(clone);
		expect(newIds).toHaveLength(oldIds.length);
		expect(new Set(newIds).size).toBe(newIds.length);
		expect(newIds.filter((id) => oldIds.includes(id))).toEqual([]);
		const oldTabIds = (o.widget as TabsW).tabs.map((t) => t.id);
		expect((clone.widget as TabsW).tabs.map((t) => t.id).filter((id) => oldTabIds.includes(id))).toEqual([]);
		expect(JSON.stringify(o)).toBe(before);
	});

	it("export -> import round trip regenerates every nested id and keeps the structure", () => {
		const o = nested();
		const file = JSON.stringify({ kind: "dwcpanel", app: "FlexibleLayouts", item: o });
		const back = parsePanelFile(file);
		const idsOf = (it: GridItemModel): string[] => [it.i, ...childItemLists(it.widget).flatMap((l) => l.flatMap(idsOf))];
		expect(idsOf(back).filter((id) => idsOf(o).includes(id))).toEqual([]);
		expect((back.widget as TabsW).tabs.map((t) => t.title)).toEqual(["One", "Two"]);
		expect(childItemLists(back.widget)[0]).toHaveLength(2);
	});

	it("sanitizeRuntimeFields strips `moved` from items inside tabs", () => {
		const doc = createEmptyDocument();
		const leaf = item("leaf", label("l"), { moved: true });
		doc.pages["/p"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items: [item("o", tabs([tab("t", "T", [leaf])]))] } as never;
		sanitizeRuntimeFields(doc);
		expect("moved" in leaf).toBe(false);
	});

	it("dependency capture finds a plugin page inside a tab", () => {
		const doc = createEmptyDocument();
		const embed = item("e", { type: "pluginPage", pluginId: "Somebody", label: "Somebody" } as unknown as Widget);
		doc.pages["/p"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items: [item("o", tabs([tab("t", "T", [embed])]))] } as never;
		expect(computeDependencies(doc).map((d) => d.pluginId)).toEqual(["Somebody"]);
	});

	it("tolerates a malformed tabs widget without throwing", () => {
		const broken = { type: "tabs", tabs: [null, { id: "x", title: "X" }, { id: "y", title: "Y", items: [item("k", label("k"))] }] } as unknown as Widget;
		expect(childItemLists(broken)).toHaveLength(1);
		expect(() => mapChildItemLists(broken, (l) => l)).not.toThrow();
		expect(childItemLists({ type: "tabs" } as unknown as Widget)).toEqual([]);
	});

	it("createDefaultWidget makes two empty, distinctly-id'd tabs", () => {
		const w = createDefaultWidget("tabs") as TabsW;
		expect(w.tabs).toHaveLength(2);
		expect(w.tabs[0].id).not.toBe(w.tabs[1].id);
		expect(w.tabs.every((t) => t.items.length === 0)).toBe(true);
	});
});

describe("containerState (per-device view state)", () => {
	it("remembers a selected tab per widget, and reads it back after a reload", () => {
		setSelectedTab("item-1", "t2");
		setSelectedTab("item-2", "t9");
		expect(getSelectedTab("item-1")).toBe("t2");
		resetContainerStateForTests();
		expect(getSelectedTab("item-1")).toBe("t2");
		expect(getSelectedTab("item-2")).toBe("t9");
		expect(getSelectedTab("nope")).toBeUndefined();
	});

	it("folds and unfolds, remembered per device", () => {
		expect(isCollapsed("g")).toBe(false);
		setCollapsed("g", true);
		expect(isCollapsed("g")).toBe(true);
		resetContainerStateForTests();
		expect(isCollapsed("g")).toBe(true);
		toggleCollapsed("g");
		expect(isCollapsed("g")).toBe(false);
		expect(JSON.parse(storage.get("flexibleLayouts.collapsedPanels")!)).toEqual([]);
	});

	it("survives junk or blocked storage", () => {
		storage.set("flexibleLayouts.selectedTabs", "not json");
		storage.set("flexibleLayouts.collapsedPanels", '{"a":1}');
		expect(() => resetContainerStateForTests()).not.toThrow();
		expect(getSelectedTab("x")).toBeUndefined();
		expect(isCollapsed("x")).toBe(false);
		vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
		expect(() => setSelectedTab("x", "t")).not.toThrow();
		expect(() => setCollapsed("x", true)).not.toThrow();
	});

	it("never touches the shared layout document", () => {
		const before = JSON.stringify(useLayoutStore().document.value);
		setSelectedTab("i", "t");
		setCollapsed("i", true);
		expect(JSON.stringify(useLayoutStore().document.value)).toBe(before);
	});

	it("keeps only the newest entries, so the store cannot grow without bound", () => {
		for (let n = 0; n < 350; n++) { setCollapsed(`p${n}`, true); }
		expect(JSON.parse(storage.get("flexibleLayouts.collapsedPanels")!).length).toBeLessThanOrEqual(300);
		expect(isCollapsed("p349")).toBe(true);
		expect(isCollapsed("p0")).toBe(false);
	});
});

describe("TabsWidget", () => {
	async function mountTabs(widget: TabsW, provide: Record<symbol | string, unknown> = {}) {
		const w = mountInDwc(TabsWidget, { props: { widget }, global: { provide } });
		await flushPromises();
		await flushPromises();
		return w;
	}

	it("shows a tab bar and the first tab's contents", async () => {
		const w = await mountTabs(twoTabs());
		expect(w.findAll(".tabs-tab").map((t) => t.text())).toEqual(["One", "Two"]);
		expect(w.text()).toContain("alpha text");
		expect(w.text()).not.toContain("bravo text");
	});

	it("only the showing tab is rendered - an inactive tab is unmounted, not hidden", async () => {
		const w = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-1" });
		expect(w.html()).not.toContain("bravo text");
		await w.findAll(".tabs-tab")[1].trigger("click");
		await flushPromises();
		expect(w.html()).toContain("bravo text");
		expect(w.html()).not.toContain("alpha text");
	});

	it("remembers the chosen tab per device, keyed by the item, and restores it on the next mount", async () => {
		const w = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-1" });
		await w.findAll(".tabs-tab")[1].trigger("click");
		await flushPromises();
		expect(getSelectedTab("it-1")).toBe("t2");
		w.unmount();
		const again = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-1" });
		expect(again.text()).toContain("bravo text");
		// a different placement of the same widget is independent
		const other = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-2" });
		expect(other.text()).toContain("alpha text");
	});

	it("does not write the selected tab into the shared layout", async () => {
		const before = JSON.stringify(useLayoutStore().document.value);
		const w = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-1" });
		await w.findAll(".tabs-tab")[1].trigger("click");
		expect(JSON.stringify(useLayoutStore().document.value)).toBe(before);
	});

	it("falls back to the first tab when the remembered one no longer exists", async () => {
		setSelectedTab("it-1", "gone");
		const w = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-1" });
		expect(w.text()).toContain("alpha text");
	});

	describe("showWhen", () => {
		const gated = () => tabs([
			tab("t1", "Always", [item("a", label("always text"))]),
			tab("t2", "CNC only", [item("b", label("cnc text"))], { showWhen: { omPath: "state.flag", operator: "truthy" } }),
		]);
		const setFlag = (v: boolean) => setModel({ ...(loadObjectModel() as Record<string, unknown>), state: { ...((loadObjectModel() as { state: object }).state), flag: v } });

		it("hides a tab whose rule does not hold, and shows it when it does", async () => {
			setFlag(false);
			const w = await mountTabs(gated());
			expect(w.findAll(".tabs-tab").map((t) => t.text())).toEqual(["Always"]);
			setFlag(true);
			await flushPromises();
			expect(w.findAll(".tabs-tab").map((t) => t.text())).toEqual(["Always", "CNC only"]);
		});

		it("moves off a tab that disappears, to the first visible one", async () => {
			setFlag(true);
			const w = await mountTabs(gated(), { [ITEM_ID_KEY as symbol]: "it-1" });
			await w.findAll(".tabs-tab")[1].trigger("click");
			await flushPromises();
			expect(w.text()).toContain("cnc text");
			setFlag(false);
			await flushPromises();
			expect(w.text()).toContain("always text");
			expect(w.text()).not.toContain("cnc text");
		});

		it("says so when no tab is visible at all", async () => {
			setFlag(false);
			const w = await mountTabs(tabs([tab("t", "Gated", [], { showWhen: { omPath: "state.flag", operator: "truthy" } })]));
			expect(w.find(".tabs-tab").exists()).toBe(false);
			expect(w.find(".tabs-empty").text()).toContain("container.noTabs");
		});
	});

	it("shows an explanatory empty state for an empty tab", async () => {
		const w = await mountTabs(tabs([tab("t", "Empty")]));
		expect(w.find(".tabs-empty").text()).toContain("container.tabEmpty");
	});

	it("puts the tab bar where it was asked to", async () => {
		expect((await mountTabs(twoTabs())).find(".tabs-layout").classes()).toContain("tabs-pos-top");
		expect((await mountTabs(twoTabs({ tabPosition: "bottom" }))).find(".tabs-layout").classes()).toContain("tabs-pos-bottom");
		const left = await mountTabs(twoTabs({ tabPosition: "left" }));
		expect(left.find(".tabs-layout").classes()).toContain("tabs-pos-left");
		expect(left.find(".v-tabs--vertical").exists()).toBe(true);
	});

	describe("collapsible", () => {
		it("has no fold button unless asked", async () => {
			expect((await mountTabs(twoTabs())).find(".tabs-fold").exists()).toBe(false);
		});

		it("folds to just the header, remembered per device, and unfolds again", async () => {
			const w = await mountTabs(twoTabs({ collapsible: true }), { [ITEM_ID_KEY as symbol]: "it-1" });
			expect(w.find(".tabs-fold").attributes("aria-expanded")).toBe("true");
			await w.find(".tabs-fold").trigger("click");
			expect(isCollapsed("it-1")).toBe(true);
			expect(w.find(".tabs-layout").exists()).toBe(false);
			expect(w.find(".tabs-fold").attributes("aria-expanded")).toBe("false");
			expect(w.find(".tabs-title").text()).toBe("Panel");

			w.unmount();
			const again = await mountTabs(twoTabs({ collapsible: true }), { [ITEM_ID_KEY as symbol]: "it-1" });
			expect(again.find(".tabs-layout").exists()).toBe(false); // still folded on this device
			await again.find(".tabs-fold").trigger("click");
			expect(again.find(".tabs-layout").exists()).toBe(true);
		});

		it("a widget that is not collapsible ignores a stale folded flag", async () => {
			setCollapsed("it-1", true);
			const w = await mountTabs(twoTabs(), { [ITEM_ID_KEY as symbol]: "it-1" });
			expect(w.find(".tabs-layout").exists()).toBe(true);
		});
	});

	it("forwards a child widget's patch as a patch of the tabs widget itself", async () => {
		const patches: Array<Record<string, unknown>> = [];
		const w = await mountTabs(twoTabs(), { [WIDGET_PATCH_KEY as symbol]: (p: Record<string, unknown>) => patches.push(p) });
		const grid = w.findComponent({ name: "FlexGrid" });
		expect(grid.exists()).toBe(true);
		grid.vm.$emit("patchWidget", "a", { content: "changed" });
		await flushPromises();
		expect(patches).toHaveLength(1);
		const sent = patches[0].tabs as Array<TabDef>;
		expect(sent.map((t) => t.id)).toEqual(["t1", "t2"]);
		expect((sent[0].items[0].widget as { content?: string }).content).toBe("changed");
		expect((sent[1].items[0].widget as { content?: string }).content).toBe("bravo text"); // other tab untouched
	});
});

describe("GroupWidget collapsible", () => {
	const group = (extra: Record<string, unknown> = {}) => ({ type: "group" as const, title: "Group", items: [item("a", label("in the group"))], ...extra });
	const mountGroup = async (widget: ReturnType<typeof group>, key = "g-1") => {
		const w = mountInDwc(GroupWidget, { props: { widget }, global: { provide: { [ITEM_ID_KEY as symbol]: key } } });
		await flushPromises();
		await flushPromises();
		return w;
	};

	it("an ordinary group is unchanged: no fold button", async () => {
		const w = await mountGroup(group());
		expect(w.find(".group-fold").exists()).toBe(false);
		expect(w.text()).toContain("in the group");
	});

	it("a collapsible group folds to its title and unfolds, per device", async () => {
		const w = await mountGroup(group({ collapsible: true }));
		await w.find(".group-fold").trigger("click");
		expect(isCollapsed("g-1")).toBe(true);
		expect(w.text()).not.toContain("in the group");
		expect(w.find(".group-title").exists()).toBe(true);
		await w.find(".group-fold").trigger("click");
		await flushPromises();
		expect(w.text()).toContain("in the group");
	});

	it("shows a fold button even with no title", async () => {
		const w = await mountGroup(group({ collapsible: true, title: "" }));
		expect(w.find(".group-fold").exists()).toBe(true);
	});
});

describe("TabsEditor", () => {
	async function open(widget: TabsW) {
		const w = mountInDwc(TabsEditor, { props: { modelValue: false, widget, attach: true } });
		await w.setProps({ modelValue: true });
		await flushPromises();
		return w;
	}
	const titles = (w: Awaited<ReturnType<typeof open>>) => w.findAll(".tab-row .tab-title input").map((i) => (i.element as HTMLInputElement).value);

	it("lists the tabs and saves an edited copy without touching the original", async () => {
		const original = twoTabs();
		const before = JSON.stringify(original);
		const w = await open(original);
		expect(titles(w)).toEqual(["One", "Two"]);
		await w.findAll(".tab-row .tab-title input")[0].setValue("Renamed");
		await w.find(".tabs-save").trigger("click");
		const saved = w.emitted("save")![0][0] as TabsW;
		expect(saved.tabs[0].title).toBe("Renamed");
		expect(JSON.stringify(original)).toBe(before);
	});

	it("adds a tab", async () => {
		const w = await open(twoTabs());
		await w.find(".tab-add").trigger("click");
		expect(w.findAll(".tab-row")).toHaveLength(3);
		await w.find(".tabs-save").trigger("click");
		const saved = w.emitted("save")![0][0] as TabsW;
		expect(saved.tabs).toHaveLength(3);
		expect(new Set(saved.tabs.map((t) => t.id)).size).toBe(3);
	});

	it("deletes a tab but never the last one", async () => {
		const w = await open(twoTabs());
		await w.findAll(".tab-delete")[0].trigger("click");
		expect(w.findAll(".tab-row")).toHaveLength(1);
		expect(w.find(".tab-delete").attributes("disabled")).toBeDefined();
	});

	it("reorders tabs", async () => {
		const w = await open(twoTabs());
		expect(w.findAll(".tab-up")[0].attributes("disabled")).toBeDefined();
		expect(w.findAll(".tab-down")[1].attributes("disabled")).toBeDefined();
		await w.findAll(".tab-down")[0].trigger("click");
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![0][0] as TabsW).tabs.map((t) => t.id)).toEqual(["t2", "t1"]);
	});

	it("turns a show-when rule on and off per tab", async () => {
		const w = await open(twoTabs());
		const sw = w.findAll(".tab-when input")[0];
		await sw.setValue(true);
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![0][0] as TabsW).tabs[0].showWhen).toEqual({ omPath: "", operator: "eq", value: "" });
		await sw.setValue(false);
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![1][0] as TabsW).tabs[0].showWhen).toBeUndefined();
	});

	it("edits a tab's contents through the group editor and stores them back on that tab", async () => {
		const w = await open(twoTabs());
		const vm = w.vm as unknown as { editContents(id: string): void; saveContents(g: Extract<Widget, { type: "group" }>): void; contentsGroup: Extract<Widget, { type: "group" }> };
		vm.editContents("t2");
		expect(vm.contentsGroup.items.map((i) => i.i)).toEqual(["b"]);
		vm.saveContents({ ...vm.contentsGroup, items: [item("b", label("bravo text")), item("c", label("new"))] });
		await w.find(".tabs-save").trigger("click");
		const saved = w.emitted("save")![0][0] as TabsW;
		expect(saved.tabs[0].items.map((i) => i.i)).toEqual(["a"]); // tab one untouched
		expect(saved.tabs[1].items.map((i) => i.i)).toEqual(["b", "c"]);
	});

	it("sets the tab-bar position, storing only a non-default one", async () => {
		const w = await open(twoTabs());
		(w.vm as unknown as { position: string }).position = "left";
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![0][0] as TabsW).tabPosition).toBe("left");
		(w.vm as unknown as { position: string }).position = "top";
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![1][0] as TabsW).tabPosition).toBeUndefined();
	});

	it("collapsible is off unless switched on", async () => {
		const w = await open(twoTabs());
		await w.find(".tabs-collapsible input").setValue(true);
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![0][0] as TabsW).collapsible).toBe(true);
		await w.find(".tabs-collapsible input").setValue(false);
		await w.find(".tabs-save").trigger("click");
		expect((w.emitted("save")![1][0] as TabsW).collapsible).toBeUndefined();
	});
});

describe("FlexPage: editing a tabs container", () => {
	it("'Edit contents' opens the tab editor for a tabs widget, and saving replaces just that widget as one undo step", async () => {
		const store = useLayoutStore();
		store.ensurePage("/Tabbed", "custom").items = [item("host", twoTabs()), item("other", label("other"))];
		editMode.value = true;
		const w = mountInDwc(FlexPage, { props: { pageId: "/Tabbed", kind: "custom" } });
		await flushPromises();
		const vm = w.vm as unknown as {
			openGroupEditor(id: string): void; tabsEditorOpen: boolean; groupEditorOpen: boolean;
			saveTabs(t: TabsW): void; layout: Array<GridItemModel>; undo(): void;
		};
		vm.openGroupEditor("host");
		expect(vm.tabsEditorOpen).toBe(true);
		expect(vm.groupEditorOpen).toBe(false);

		vm.saveTabs({ ...twoTabs(), title: "Edited" });
		await flushPromises();
		expect((vm.layout.find((it) => it.i === "host")!.widget as TabsW).title).toBe("Edited");
		expect(vm.layout).toHaveLength(2);
		vm.undo();
		await flushPromises();
		expect((vm.layout.find((it) => it.i === "host")!.widget as TabsW).title).toBe("Panel");
		editMode.value = false;
	});

	it("'Edit contents' on a plain group still opens the group editor", async () => {
		useLayoutStore().ensurePage("/Grouped", "custom").items = [item("g", { type: "group", title: "G", items: [] } as Widget)];
		editMode.value = true;
		const w = mountInDwc(FlexPage, { props: { pageId: "/Grouped", kind: "custom" } });
		await flushPromises();
		const vm = w.vm as unknown as { openGroupEditor(id: string): void; tabsEditorOpen: boolean; groupEditorOpen: boolean };
		vm.openGroupEditor("g");
		expect(vm.groupEditorOpen).toBe(true);
		expect(vm.tabsEditorOpen).toBe(false);
		editMode.value = false;
	});
});
