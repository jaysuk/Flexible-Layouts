import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";

import { editMode } from "../src/model/editorState";
import type { GridItemModel, Widget } from "../src/model/document";
import { useLayoutStore } from "../src/model/store";
import { getClipboardMemory, resetActiveEditorForTests, setClipboardMemory } from "../src/model/widgetClipboard";
import FlexPage from "../src/page/FlexPage.vue";

const label = (text: string): Widget => ({ type: "label", text } as unknown as Widget);
const item = (i: string, x: number, y: number, w = 3, h = 2): GridItemModel => ({ i, x, y, w, h, widget: label(i) }) as GridItemModel;

/** A ClipboardEvent whose data lives in a plain Map - happy-dom's DataTransfer support is partial. */
function clipEvent(type: "copy" | "cut" | "paste", initial = "") {
	const store = new Map<string, string>(initial ? [["text/plain", initial]] : []);
	const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
	ev.clipboardData = { setData: (k: string, v: string) => store.set(k, v), getData: (k: string) => store.get(k) ?? "" };
	return { ev, text: () => store.get("text/plain") ?? "" };
}

describe("FlexPage copy / cut / paste", () => {
	let w: ReturnType<typeof mountPage>;
	function mountPage() {
		const s = useLayoutStore();
		s.ensurePage("/Clip", "custom").items = [item("a", 0, 0), item("b", 3, 0)];
		return mountInDwc(FlexPage, { props: { pageId: "/Clip", kind: "custom" }, attachTo: document.body });
	}
	const vm = () => w.vm as unknown as {
		layout: Array<GridItemModel>; selectedIds: Set<string>; selectAll(): void; undo(): void; canUndo: boolean;
	};

	beforeEach(async () => {
		resetActiveEditorForTests();
		setClipboardMemory(null);
		dwc.notifications.length = 0;
		editMode.value = true;
		w = mountPage();
		await flushPromises();
	});
	afterEach(() => {
		w.unmount();
		editMode.value = false;
		document.body.innerHTML = "";
	});

	it("copy puts a tagged envelope on the clipboard and in memory, and consumes the event", async () => {
		vm().selectAll();
		await flushPromises();
		const { ev, text } = clipEvent("copy");
		document.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		expect(JSON.parse(text()).flexibleLayouts).toBe("clipboard");
		expect(JSON.parse(text()).items).toHaveLength(2);
		expect(getClipboardMemory()?.items).toHaveLength(2);
		expect(vm().layout).toHaveLength(2); // copy never removes
	});

	it("paste (over the event API, no navigator.clipboard) adds fresh-id copies, selects them, and is ONE undo step", async () => {
		vm().selectAll();
		await flushPromises();
		const copy = clipEvent("copy");
		document.dispatchEvent(copy.ev);

		const paste = clipEvent("paste", copy.text());
		document.dispatchEvent(paste.ev);
		await flushPromises();

		const ids = vm().layout.map((it) => it.i);
		expect(ids).toHaveLength(4);
		expect(new Set(ids).size).toBe(4);
		expect(ids.slice(0, 2)).toEqual(["a", "b"]);
		expect([...vm().selectedIds].sort()).toEqual(ids.slice(2).sort());
		// relative layout kept: the pasted pair sits side by side, same width as the originals
		const [p1, p2] = vm().layout.slice(2);
		expect(p2.x - p1.x).toBe(3);
		expect(p1.y).toBe(p2.y);

		vm().undo();
		await flushPromises();
		expect(vm().layout).toHaveLength(2);
	});

	it("paste with no text from the browser falls back to what was copied in this session", async () => {
		vm().selectAll();
		await flushPromises();
		document.dispatchEvent(clipEvent("copy").ev);
		const paste = clipEvent("paste", "");
		document.dispatchEvent(paste.ev);
		await flushPromises();
		expect(vm().layout).toHaveLength(4);
		expect(paste.ev.defaultPrevented).toBe(true);
	});

	it("cut removes the selection as one undo step", async () => {
		vm().selectAll();
		await flushPromises();
		const cut = clipEvent("cut");
		document.dispatchEvent(cut.ev);
		await flushPromises();
		expect(vm().layout).toHaveLength(0);
		expect(JSON.parse(cut.text()).items).toHaveLength(2);
		vm().undo();
		await flushPromises();
		expect(vm().layout).toHaveLength(2);
	});

	it("leaves foreign clipboard text alone", async () => {
		const paste = clipEvent("paste", "just some words");
		document.dispatchEvent(paste.ev);
		await flushPromises();
		expect(paste.ev.defaultPrevented).toBe(false);
		expect(vm().layout).toHaveLength(2);
	});

	it("does nothing while typing in a field", async () => {
		vm().selectAll();
		await flushPromises();
		const copy = clipEvent("copy");
		document.dispatchEvent(copy.ev);
		const input = document.createElement("input");
		document.body.appendChild(input);
		const paste = clipEvent("paste", copy.text());
		input.dispatchEvent(paste.ev);
		await flushPromises();
		expect(vm().layout).toHaveLength(2);
		expect(paste.ev.defaultPrevented).toBe(false);
	});

	it("does nothing while a dialog is open", async () => {
		vm().selectAll();
		await flushPromises();
		const copy = clipEvent("copy");
		document.dispatchEvent(copy.ev);
		const overlay = document.createElement("div");
		overlay.className = "v-overlay--active";
		document.body.appendChild(overlay);
		const paste = clipEvent("paste", copy.text());
		document.dispatchEvent(paste.ev);
		await flushPromises();
		expect(vm().layout).toHaveLength(2);
	});

	it("does nothing outside edit mode, and copy needs a selection", async () => {
		const copy = clipEvent("copy");
		document.dispatchEvent(copy.ev);
		expect(copy.ev.defaultPrevented).toBe(false); // nothing selected
		vm().selectAll();
		await flushPromises();
		const good = clipEvent("copy");
		document.dispatchEvent(good.ev);
		editMode.value = false;
		await flushPromises();
		const paste = clipEvent("paste", good.text());
		document.dispatchEvent(paste.ev);
		await flushPromises();
		expect(vm().layout).toHaveLength(2);
	});

	it("Ctrl+D duplicates the selection and stops the browser bookmarking the page", async () => {
		vm().selectAll();
		await flushPromises();
		const ev = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true });
		window.dispatchEvent(ev);
		await flushPromises();
		expect(ev.defaultPrevented).toBe(true);
		expect(vm().layout).toHaveLength(4);
	});

	it("the toolbar Paste button is disabled until something has been copied", async () => {
		const paste = w.find('button[aria-label="plugins.flexibleLayouts.editor.clipboard.paste"]');
		expect(paste.exists()).toBe(true);
		expect(paste.attributes("disabled")).toBeDefined();
		vm().selectAll();
		await flushPromises();
		document.dispatchEvent(clipEvent("copy").ev);
		await flushPromises();
		expect(w.find('button[aria-label="plugins.flexibleLayouts.editor.clipboard.paste"]').attributes("disabled")).toBeUndefined();
	});
});
