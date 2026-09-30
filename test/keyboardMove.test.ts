import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { mountInDwc } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { GridItemModel, Widget } from "../src/model/document";
import { editMode } from "../src/model/editorState";
import { useLayoutStore } from "../src/model/store";
import FlexPage from "../src/page/FlexPage.vue";

enableAutoUnmount(afterEach);

const label = (text: string): Widget => ({ type: "label", variant: "text", content: text }) as Widget;
const item = (i: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): GridItemModel =>
	({ i, x, y, w, h, widget: label(i), title: `Panel ${i}`, ...extra }) as GridItemModel;

const key = (k: string, init: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });

async function mountPage(items: Array<GridItemModel>) {
	useLayoutStore().ensurePage("/Kb", "custom").items = items;
	editMode.value = true;
	const w = mountInDwc(FlexPage, { props: { pageId: "/Kb", kind: "custom" } });
	await flushPromises();
	return w;
}
const headerOf = (w: Awaited<ReturnType<typeof mountPage>>, i: string) => w.findAll(".flex-item-header")[["a", "b", "c"].indexOf(i)];
const geom = (w: Awaited<ReturnType<typeof mountPage>>, i: string) => {
	const it = (w.vm as unknown as { layout: Array<GridItemModel> }).layout.find((x) => x.i === i)!;
	return { x: it.x, y: it.y, w: it.w, h: it.h };
};
const say = (w: Awaited<ReturnType<typeof mountPage>>) => w.find(".fl-sr-only").text().replace(/ /g, "");

beforeEach(() => { editMode.value = true; });
afterEach(() => { editMode.value = false; });

describe("keyboard move and resize in edit mode", () => {
	it("the header is a focusable, named handle that says how to use it", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const h = headerOf(w, "a");
		expect(h.attributes("tabindex")).toBe("0");
		expect(h.attributes("role")).toBe("group");
		expect(h.attributes("aria-label")).toContain("Panel a");
		expect(h.attributes("aria-label")).toContain("kb.hint");
	});

	it("arrow keys do nothing until the panel is picked up", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		headerOf(w, "a").element.dispatchEvent(key("ArrowRight"));
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 2, y: 2, w: 3, h: 2 });
	});

	it("Enter picks it up (and says so); arrows then move it one cell at a time", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(headerOf(w, "a").classes()).toContain("is-grabbed");
		expect(say(w)).toContain("kb.grabbed");
		h.dispatchEvent(key("ArrowRight"));
		h.dispatchEvent(key("ArrowDown"));
		h.dispatchEvent(key("ArrowDown"));
		h.dispatchEvent(key("ArrowLeft"));
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 2, y: 4, w: 3, h: 2 });
		expect(say(w)).toContain("kb.moved");
	});

	it("Shift + arrows resize by one cell, never below 1x1", async () => {
		const w = await mountPage([item("a", 0, 0, 2, 2)]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowRight", { shiftKey: true }));
		h.dispatchEvent(key("ArrowDown", { shiftKey: true }));
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 0, y: 0, w: 3, h: 3 });
		for (let i = 0; i < 5; i++) {
			h.dispatchEvent(key("ArrowLeft", { shiftKey: true }));
			h.dispatchEvent(key("ArrowUp", { shiftKey: true }));
		}
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 0, y: 0, w: 1, h: 1 });
		expect(say(w)).toContain("kb.atEdge");
	});

	it("stays inside the grid: not off the left, the top or the right edge", async () => {
		const w = await mountPage([item("a", 0, 0, 3, 2)]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowLeft"));
		h.dispatchEvent(key("ArrowUp"));
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 0, y: 0, w: 3, h: 2 });
		expect(say(w)).toContain("kb.atEdge");
		for (let i = 0; i < 20; i++) { h.dispatchEvent(key("ArrowRight")); }
		await flushPromises();
		expect(geom(w, "a").x + geom(w, "a").w).toBe(12); // 12-column grid: flush against the right edge
	});

	it("growing past the right edge shifts the panel left rather than overflowing", async () => {
		const w = await mountPage([item("a", 10, 0, 2, 2)]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowRight", { shiftKey: true }));
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 9, y: 0, w: 3, h: 2 });
	});

	it("Enter or Escape puts it down, and arrows are then inert again", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const h = headerOf(w, "a").element;
		for (const drop of ["Enter", "Escape"]) {
			h.dispatchEvent(key("Enter"));
			await flushPromises();
			h.dispatchEvent(key(drop));
			await flushPromises();
			expect(headerOf(w, "a").classes()).not.toContain("is-grabbed");
			expect(say(w)).toContain("kb.dropped");
			const before = geom(w, "a");
			h.dispatchEvent(key("ArrowRight"));
			await flushPromises();
			expect(geom(w, "a")).toEqual(before);
		}
	});

	it("a whole move-and-resize session is ONE undo step", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const vm = w.vm as unknown as { canUndo: boolean; undo(): void; undoStack: Array<string> };
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		for (let i = 0; i < 4; i++) { h.dispatchEvent(key("ArrowRight")); }
		h.dispatchEvent(key("ArrowDown", { shiftKey: true }));
		h.dispatchEvent(key("Enter")); // drop
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 6, y: 2, w: 3, h: 3 });
		expect(vm.undoStack).toHaveLength(1);
		vm.undo();
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 2, y: 2, w: 3, h: 2 });
	});

	it("a session with no effective change adds no undo step", async () => {
		const w = await mountPage([item("a", 0, 0, 3, 2)]);
		const vm = w.vm as unknown as { undoStack: Array<string> };
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowLeft")); // already at the edge
		h.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(vm.undoStack).toHaveLength(0);
	});

	it("losing focus mid-session puts the panel down and commits what was done", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const vm = w.vm as unknown as { undoStack: Array<string> };
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowRight"));
		h.dispatchEvent(new FocusEvent("blur"));
		await flushPromises();
		expect(headerOf(w, "a").classes()).not.toContain("is-grabbed");
		expect(vm.undoStack).toHaveLength(1);
	});

	it("a locked panel cannot be moved from the keyboard either, and says why", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2, { locked: true })]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(say(w)).toContain("kb.locked");
		h.dispatchEvent(key("ArrowRight"));
		await flushPromises();
		expect(geom(w, "a")).toEqual({ x: 2, y: 2, w: 3, h: 2 });
	});

	it("keys pressed on the header's own buttons are not taken as a grab", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const cog = headerOf(w, "a").find("button");
		cog.element.dispatchEvent(key("Enter"));
		await flushPromises();
		expect(headerOf(w, "a").classes()).not.toContain("is-grabbed");
	});

	it("only the panel that was picked up moves", async () => {
		const w = await mountPage([item("a", 0, 0, 2, 2), item("b", 4, 0, 2, 2)]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowDown"));
		await flushPromises();
		expect(geom(w, "a").y).toBe(1);
		expect(geom(w, "b")).toEqual({ x: 4, y: 0, w: 2, h: 2 });
	});

	it("persists the new position, like a drag does", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		const h = headerOf(w, "a").element;
		h.dispatchEvent(key("Enter"));
		h.dispatchEvent(key("ArrowRight"));
		h.dispatchEvent(key("Enter"));
		await new Promise((r) => setTimeout(r, 400)); // FlexPage debounces its save by 300ms
		expect(useLayoutStore().getPage("/Kb")!.items.find((x) => x.i === "a")!.x).toBe(3);
	});

	it("has no live region outside edit mode", async () => {
		const w = await mountPage([item("a", 2, 2, 3, 2)]);
		editMode.value = false;
		await flushPromises();
		expect(w.find(".fl-sr-only").exists()).toBe(false);
	});
});
