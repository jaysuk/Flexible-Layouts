import { describe, expect, it } from "vitest";

import { alignItems, clampGeom, distributeItems, matchSize, translateItems } from "../src/model/align";
import { createDefaultWidget, type GridItemModel } from "../src/model/document";

function item(i: string, x: number, y: number, w = 2, h = 2): GridItemModel {
	return { i, x, y, w, h, widget: createDefaultWidget("status") };
}
const ids = (...names: Array<string>) => new Set(names);
const byId = (list: Array<GridItemModel>, i: string) => list.find((it) => it.i === i)!;

describe("alignItems", () => {
	const layout = [item("a", 2, 1), item("b", 5, 4), item("c", 9, 8)];

	it("aligns left edges to the selection's minimum x", () => {
		const out = alignItems(layout, ids("a", "b"), "left", 12);
		expect(byId(out, "a").x).toBe(2);
		expect(byId(out, "b").x).toBe(2);
		expect(byId(out, "c").x).toBe(9); // unselected, untouched
	});

	it("aligns right edges to the selection's maximum right", () => {
		const out = alignItems(layout, ids("a", "b"), "right", 12);
		// max right = max(2+2, 5+2) = 7 -> x = 7 - w(2) = 5
		expect(byId(out, "a").x).toBe(5);
		expect(byId(out, "b").x).toBe(5);
	});

	it("aligns horizontal centres", () => {
		const out = alignItems(layout, ids("a", "b"), "centerH", 12);
		// bbox x: [2, 7] -> centre 4.5 -> x = round(4.5 - 1) = 4 (rounded in clampGeom)
		expect(byId(out, "a").x).toBe(4);
		expect(byId(out, "b").x).toBe(4);
	});

	it("aligns top edges", () => {
		const out = alignItems(layout, ids("a", "b", "c"), "top", 12);
		expect(out.map((it) => it.y)).toEqual([1, 1, 1]);
	});

	it("returns the same array when fewer than two are selected", () => {
		expect(alignItems(layout, ids("a"), "left", 12)).toBe(layout);
		expect(alignItems(layout, ids(), "left", 12)).toBe(layout);
	});

	it("clamps aligned positions into the grid", () => {
		// A wide item aligned right against a narrow grid can't push x negative.
		const wide = [item("a", 0, 0, 10), item("b", 1, 0, 4)];
		const out = alignItems(wide, ids("a", "b"), "right", 6);
		expect(byId(out, "a").x).toBeGreaterThanOrEqual(0);
		expect(byId(out, "a").x + byId(out, "a").w).toBeLessThanOrEqual(6);
	});
});

describe("matchSize", () => {
	const layout = [item("a", 0, 0, 3, 4), item("b", 4, 0, 6, 2)];

	it("matches width to the first selected item", () => {
		const out = matchSize(layout, ids("a", "b"), "w", 12);
		expect(byId(out, "b").w).toBe(3);
	});

	it("matches height to the first selected item", () => {
		const out = matchSize(layout, ids("a", "b"), "h", 12);
		expect(byId(out, "b").h).toBe(4);
	});

	it("no-ops below two selected", () => {
		expect(matchSize(layout, ids("a"), "w", 12)).toBe(layout);
	});
});

describe("distributeItems", () => {
	it("evenly spaces inner centres and leaves the ends put", () => {
		const layout = [item("a", 0, 0), item("b", 4, 0), item("c", 10, 0)];
		const out = distributeItems(layout, ids("a", "b", "c"), "x", 12);
		// centres: a=1, c=11, step=5 -> b centre 6 -> x = 6 - 1 = 5
		expect(byId(out, "a").x).toBe(0);
		expect(byId(out, "c").x).toBe(10);
		expect(byId(out, "b").x).toBe(5);
	});

	it("needs at least three selected", () => {
		const layout = [item("a", 0, 0), item("b", 4, 0)];
		expect(distributeItems(layout, ids("a", "b"), "x", 12)).toBe(layout);
	});
});

describe("translateItems", () => {
	it("translates by positive deltas", () => {
		const items = [item("a", 2, 3), item("b", 5, 1)];
		const out = translateItems(items, 1, 2, 12);
		expect(out[0]).toMatchObject({ i: "a", x: 3, y: 5 });
		expect(out[1]).toMatchObject({ i: "b", x: 6, y: 3 });
	});

	it("translates by negative deltas", () => {
		const items = [item("a", 3, 4), item("b", 5, 2)];
		const out = translateItems(items, -2, -1, 12);
		expect(out[0]).toMatchObject({ i: "a", x: 1, y: 3 });
		expect(out[1]).toMatchObject({ i: "b", x: 3, y: 1 });
	});

	it("clamps x to 0 at the left edge", () => {
		const items = [item("a", 1, 0, 2)];
		const out = translateItems(items, -5, 0, 12);
		expect(out[0].x).toBe(0);
	});

	it("clamps x to cols-w at the right edge", () => {
		// item w=4, cols=12: x must be ≤ 8
		const items = [item("a", 7, 0, 4)];
		const out = translateItems(items, 5, 0, 12);
		expect(out[0].x).toBe(8); // 7+5=12 clamped to 12-4=8
	});

	it("clamps y to 0 at the top", () => {
		const items = [item("a", 0, 1)];
		const out = translateItems(items, 0, -5, 12);
		expect(out[0].y).toBe(0);
	});

	it("preserves w and h fields", () => {
		const items = [item("a", 2, 2, 3, 4)];
		const out = translateItems(items, 1, 1, 12);
		expect(out[0].w).toBe(3);
		expect(out[0].h).toBe(4);
	});

	it("returns the same array reference for an empty array (no-op)", () => {
		const items: ReturnType<typeof item>[] = [];
		expect(translateItems(items, 1, 1, 12)).toBe(items);
	});

	it("does not mutate the input array", () => {
		const items = [item("a", 2, 2)];
		const origX = items[0].x;
		translateItems(items, 3, 3, 12);
		expect(items[0].x).toBe(origX);
	});
});

describe("clampGeom", () => {
	it("keeps width within the column count and x in range", () => {
		const out = clampGeom(item("a", 20, -3, 99, 0), 12);
		expect(out.w).toBe(12);
		expect(out.x).toBe(0);
		expect(out.y).toBe(0);
		expect(out.h).toBe(1);
	});
});
