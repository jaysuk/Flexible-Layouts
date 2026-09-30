import { describe, expect, it } from "vitest";

import { computeDependencies } from "../model/dependencies";
import {
	childItemLists, createEmptyDocument, forEachWidget, mapChildItemLists, reidItem, sanitizeRuntimeFields,
	type GridItemModel, type Widget,
} from "../model/document";

function item(i: string, widget: Widget, extra: Record<string, unknown> = {}): GridItemModel {
	return { i, x: 0, y: 0, w: 2, h: 2, widget, ...extra } as GridItemModel;
}
const label = (text: string): Widget => ({ type: "label", text } as unknown as Widget);
const group = (items: Array<GridItemModel>): Widget => ({ type: "group", title: "g", items }) as Widget;

/** page -> outer group -> inner group -> leaf, plus a sibling leaf at each level. */
function nested() {
	const leaf = item("leaf", label("deep"), { moved: true });
	const inner = item("inner", group([leaf, item("leaf2", label("deep2"))]));
	const outer = item("outer", group([inner, item("sibling", label("mid"))]));
	return { leaf, inner, outer };
}

describe("childItemLists / mapChildItemLists", () => {
	it("returns a group's live item array, and nothing for a leaf widget", () => {
		const { outer } = nested();
		const lists = childItemLists(outer.widget);
		expect(lists).toHaveLength(1);
		expect(lists[0]).toBe((outer.widget as { items: Array<GridItemModel> }).items);
		expect(childItemLists(label("x"))).toEqual([]);
		expect(childItemLists(undefined)).toEqual([]);
	});

	it("maps a group's items in place and ignores leaf widgets", () => {
		const w = group([item("a", label("a")), item("b", label("b"))]);
		mapChildItemLists(w, (items) => items.slice(1));
		expect((w as { items: Array<GridItemModel> }).items.map((it) => it.i)).toEqual(["b"]);
		const leaf = label("x");
		mapChildItemLists(leaf, () => { throw new Error("must not be called"); });
	});
});

describe("walkers reach nested container children", () => {
	it("forEachWidget visits every level, plus variants and the header", () => {
		const doc = createEmptyDocument();
		const { outer } = nested();
		doc.pages["/p"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items: [outer], variants: { sm: [item("v", label("variant"))] } } as never;
		doc.header = { items: [item("h", label("header"))] };
		const seen: string[] = [];
		forEachWidget(doc, (w) => seen.push(w.type === "label" ? String((w as unknown as { text: string }).text) : w.type));
		expect(seen.sort()).toEqual(["deep", "deep2", "group", "group", "header", "mid", "variant"].sort());
	});

	it("reidItem gives every nested item a new id and leaves the source untouched", () => {
		const { outer } = nested();
		const before = JSON.stringify(outer);
		const clone = reidItem(outer);
		const ids = (it: GridItemModel): string[] => [it.i, ...childItemLists(it.widget).flatMap((l) => l.flatMap(ids))];
		const oldIds = ids(outer);
		const newIds = ids(clone);
		expect(oldIds).toEqual(["outer", "inner", "leaf", "leaf2", "sibling"]);
		expect(newIds).toHaveLength(oldIds.length);
		expect(new Set(newIds).size).toBe(newIds.length);
		expect(newIds.filter((id) => oldIds.includes(id))).toEqual([]);
		expect(JSON.stringify(outer)).toBe(before);
	});

	it("sanitizeRuntimeFields strips `moved` from deeply nested children", () => {
		const doc = createEmptyDocument();
		const { outer, leaf } = nested();
		doc.pages["/p"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items: [outer] } as never;
		sanitizeRuntimeFields(doc);
		expect("moved" in leaf).toBe(false);
	});

	it("computeDependencies captures a plugin page tucked inside a group", () => {
		const doc = createEmptyDocument();
		const embed = item("e", { type: "pluginPage", pluginId: "SomePlugin", path: "/SomePlugin", label: "Some" } as unknown as Widget);
		doc.pages["/p"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items: [item("g", group([embed]))] } as never;
		expect(computeDependencies(doc).map((d) => d.pluginId)).toEqual(["SomePlugin"]);
	});
});
