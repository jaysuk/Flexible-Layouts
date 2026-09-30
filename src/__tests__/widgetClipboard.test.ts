import { beforeEach, describe, expect, it } from "vitest";

import { childItemLists, type GridItemModel, type Widget } from "../model/document";
import {
	buildClipboardPayload, getClipboardMemory, parseClipboardText, placePasted, serializeClipboard, setClipboardMemory,
} from "../model/widgetClipboard";

const label = (text: string): Widget => ({ type: "label", text } as unknown as Widget);
const item = (i: string, x: number, y: number, w: number, h: number, widget: Widget = label(i), extra: Record<string, unknown> = {}): GridItemModel =>
	({ i, x, y, w, h, widget, ...extra }) as GridItemModel;
const group = (items: Array<GridItemModel>): Widget => ({ type: "group", title: "g", items }) as Widget;
const allIds = (items: Array<GridItemModel>): string[] => items.flatMap((x) => [x.i, ...childItemLists(x.widget).flatMap(allIds)]);

describe("payload round trip", () => {
	it("serialises to tagged JSON and parses back to equal items, minus runtime fields", () => {
		const items = [item("a", 0, 0, 3, 2, label("a"), { moved: true }), item("b", 3, 0, 3, 2)];
		const text = serializeClipboard(buildClipboardPayload(items));
		expect(JSON.parse(text).flexibleLayouts).toBe("clipboard");
		const parsed = parseClipboardText(text);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) { return; }
		expect(parsed.payload.items.map((x) => x.i)).toEqual(["a", "b"]);
		expect("moved" in parsed.payload.items[0]).toBe(false);
		expect(parsed.payload.items[1]).toMatchObject({ x: 3, y: 0, w: 3, h: 2 });
	});

	it("does not alias the live items", () => {
		const items = [item("a", 0, 0, 3, 2)];
		const payload = buildClipboardPayload(items);
		items[0].x = 9;
		expect(payload.items[0].x).toBe(0);
	});

	it("records the plugins a copied group embeds, so a paste elsewhere can warn", () => {
		const embed = item("e", 0, 0, 2, 2, { type: "pluginPage", pluginId: "Some", label: "Some" } as unknown as Widget);
		const payload = buildClipboardPayload([item("g", 0, 0, 4, 4, group([embed]))]);
		expect(payload.requires.map((d) => d.pluginId)).toEqual(["Some"]);
	});
});

describe("parseClipboardText rejects what is not ours", () => {
	it.each([
		["", "empty"],
		["   ", "empty"],
		["just some text", "notClipboard"],
		["[1,2,3]", "notClipboard"],
		["{not json", "notClipboard"],
		['{"hello":1}', "notClipboard"],
		['{"flexibleLayouts":"clipboard","version":1}', "invalid"],
		['{"flexibleLayouts":"clipboard","version":1,"items":[]}', "invalid"],
		['{"flexibleLayouts":"clipboard","version":1,"items":[{"nope":1}]}', "invalid"],
		['{"flexibleLayouts":"clipboard","version":99,"items":[]}', "newer"],
		['{"flexibleLayouts":"clipboard","version":0,"items":[]}', "invalid"],
	])("%j -> %s", (text, reason) => {
		expect(parseClipboardText(text)).toEqual({ ok: false, reason });
		});

	it("rejects an absurd number of items", () => {
		const many = Array.from({ length: 201 }, (_, n) => item(String(n), 0, 0, 1, 1));
		expect(parseClipboardText(JSON.stringify({ flexibleLayouts: "clipboard", version: 1, items: many }))).toEqual({ ok: false, reason: "invalid" });
	});

	it("coerces bad geometry rather than trusting it", () => {
		const raw = { flexibleLayouts: "clipboard", version: 1, items: [{ i: "a", x: -4, y: "no", w: 0, h: 2.6, widget: { type: "label" } }] };
		const parsed = parseClipboardText(JSON.stringify(raw));
		expect(parsed.ok && parsed.payload.items[0]).toMatchObject({ x: 0, y: 0, w: 1, h: 3 });
	});

	it("accepts the text of an exported .dwcpanel.json as a single item", () => {
		const file = { kind: "dwcpanel", app: "FlexibleLayouts", item: item("p", 2, 2, 4, 3) };
		const parsed = parseClipboardText(JSON.stringify(file));
		expect(parsed.ok && parsed.payload.items).toHaveLength(1);
	});
});

describe("placePasted", () => {
	it("gives every item - nested ones too - a fresh id", () => {
		const src = [item("g", 0, 0, 4, 4, group([item("c1", 0, 0, 2, 2), item("c2", 2, 0, 2, 2)])), item("s", 4, 0, 2, 2)];
		const out = placePasted([], src, 12);
		const oldIds = allIds(src);
		const newIds = allIds(out);
		expect(newIds).toHaveLength(oldIds.length);
		expect(new Set(newIds).size).toBe(newIds.length);
		expect(newIds.filter((id) => oldIds.includes(id))).toEqual([]);
	});

	it("keeps a multi-selection's relative layout, moving the block as one", () => {
		const src = [item("a", 5, 3, 2, 2), item("b", 8, 3, 2, 4), item("c", 5, 5, 2, 1)];
		const out = placePasted([], src, 12);
		expect(out.map((o) => [o.x, o.y, o.w, o.h])).toEqual([[0, 0, 2, 2], [3, 0, 2, 4], [0, 2, 2, 1]]);
	});

	it("drops into the first free slot beside existing panels, not below the tallest", () => {
		const existing = [item("e", 0, 0, 6, 4)];
		const out = placePasted(existing, [item("n", 0, 0, 4, 2)], 12);
		expect(out[0]).toMatchObject({ x: 6, y: 0 });
	});

	it("moves the WHOLE block below when it does not fit beside", () => {
		const existing = [item("e", 0, 0, 8, 4)];
		const out = placePasted(existing, [item("a", 0, 0, 3, 2), item("b", 3, 0, 3, 2)], 12);
		expect(out.every((o) => o.y === 4)).toBe(true);
		expect(out.map((o) => o.x)).toEqual([0, 3]);
	});

	it("clamps a block wider than the destination grid instead of overflowing it", () => {
		const out = placePasted([], [item("a", 0, 0, 20, 2)], 12);
		expect(out[0]).toMatchObject({ x: 0, w: 12 });
	});

	it("terminates on a full grid (finds room below)", () => {
		const existing = [item("e", 0, 0, 12, 30)];
		expect(placePasted(existing, [item("n", 0, 0, 12, 2)], 12)[0]).toMatchObject({ x: 0, y: 30 });
	});
});

describe("in-memory slot", () => {
	beforeEach(() => setClipboardMemory(null));
	it("holds and clears a payload", () => {
		expect(getClipboardMemory()).toBeNull();
		const p = buildClipboardPayload([item("a", 0, 0, 1, 1)]);
		setClipboardMemory(p);
		expect(getClipboardMemory()).toBe(p);
		setClipboardMemory(null);
		expect(getClipboardMemory()).toBeNull();
	});
});
