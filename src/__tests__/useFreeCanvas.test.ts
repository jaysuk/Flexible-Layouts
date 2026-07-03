import { ref } from "vue";
import { describe, expect, it } from "vitest";

import type { GridItemModel, Widget } from "../model/document";
import { freeItemStyle, sortByFreeZ, useFreeCanvas } from "../composables/useFreeCanvas";

function item(patch: Partial<GridItemModel> = {}): GridItemModel {
	return { i: "a", x: 10, y: 20, w: 30, h: 40, widget: { type: "clock" } as Widget, ...patch };
}

describe("freeItemStyle", () => {
	it("expresses x/y/w/h as absolute-position percentages", () => {
		const style = freeItemStyle(item());
		expect(style.position).toBe("absolute");
		expect(style.left).toBe("10%");
		expect(style.top).toBe("20%");
		expect(style.width).toBe("30%");
		expect(style.height).toBe("40%");
	});

	it("offsets z-index by +10 so z=0 still sits above the canvas background", () => {
		expect(freeItemStyle(item({ freeZ: 0 })).zIndex).toBe("10");
		expect(freeItemStyle(item({ freeZ: 5 })).zIndex).toBe("15");
	});

	it("omits the transform entirely at rotation 0, sets it otherwise", () => {
		expect(freeItemStyle(item({ freeRotation: 0 })).transform).toBeUndefined();
		expect(freeItemStyle(item({ freeRotation: 45 })).transform).toBe("rotate(45deg)");
	});
});

describe("sortByFreeZ", () => {
	it("sorts ascending by freeZ, treating missing z as 0", () => {
		const items = [item({ i: "hi", freeZ: 5 }), item({ i: "lo", freeZ: -2 }), item({ i: "mid" })];
		expect(sortByFreeZ(items).map((it) => it.i)).toEqual(["lo", "mid", "hi"]);
	});
});

describe("useFreeCanvas", () => {
	function setup(initial: Array<GridItemModel>) {
		const items = ref<Array<GridItemModel>>(initial);
		const canvasRef = ref<HTMLElement | null>(null);
		const api = useFreeCanvas(() => items.value, (next) => { items.value = next; }, canvasRef);
		return { items, api };
	}

	it("bringToFront raises the selected item's freeZ above the current max", () => {
		const { items, api } = setup([item({ i: "a", freeZ: 3 }), item({ i: "b", freeZ: 7 })]);
		api.selectedId.value = "a";
		api.bringToFront();
		expect(items.value.find((it) => it.i === "a")!.freeZ).toBe(8);
	});

	it("sendToBack lowers the selected item's freeZ below the current min", () => {
		const { items, api } = setup([item({ i: "a", freeZ: 3 }), item({ i: "b", freeZ: -1 })]);
		api.selectedId.value = "b";
		api.sendToBack();
		expect(items.value.find((it) => it.i === "b")!.freeZ).toBe(-2);
	});

	it("z-order functions no-op when nothing is selected", () => {
		const { items, api } = setup([item({ i: "a", freeZ: 3 })]);
		api.selectedId.value = null;
		api.bringToFront();
		api.sendToBack();
		expect(items.value[0].freeZ).toBe(3);
	});

	it("freePlace cascades default positions for successive new items, never off-canvas", () => {
		const { api } = setup([]);
		const first = api.freePlace();
		expect(first.x).toBeGreaterThanOrEqual(0);
		expect(first.x + first.w).toBeLessThanOrEqual(100);
		expect(first.y + first.h).toBeLessThanOrEqual(100);
	});

	it("sortedItems reflects the live underlying array (z-sorted)", () => {
		const { items, api } = setup([item({ i: "hi", freeZ: 5 }), item({ i: "lo", freeZ: -2 })]);
		expect(api.sortedItems.value.map((it) => it.i)).toEqual(["lo", "hi"]);
		items.value = [...items.value, item({ i: "lowest", freeZ: -10 })];
		expect(api.sortedItems.value.map((it) => it.i)).toEqual(["lowest", "lo", "hi"]);
	});
});
