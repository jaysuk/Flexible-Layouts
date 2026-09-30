import { afterEach, describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

// Same non-functional happy-dom localStorage as editorPreference.test.ts - a scoped stand-in.
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

import { editorShowWhitespace, editorTabWidth, setEditorShowWhitespace, setEditorTabWidth } from "../model/editorIndentSettings";
import FlexSettingsTab from "../settings/FlexSettingsTab.vue";

afterEach(() => {
	setEditorTabWidth(4);
	setEditorShowWhitespace(false);
});

describe("editorIndentSettings", () => {
	it("defaults to 4 spaces per tab, whitespace hidden", () => {
		expect(editorTabWidth.value).toBe(4);
		expect(editorShowWhitespace.value).toBe(false);
	});

	it("persists a width and normalises nonsense", () => {
		expect(setEditorTabWidth(2)).toBe(2);
		expect(editorTabWidth.value).toBe(2);
		expect(memoryStorage.get("flexibleLayouts.editorTabWidth")).toBe("2");
		expect(setEditorTabWidth("abc")).toBe(4);
		expect(setEditorTabWidth(0)).toBe(1);
		expect(setEditorTabWidth(500)).toBe(16);
	});

	it("persists the whitespace toggle", () => {
		setEditorShowWhitespace(true);
		expect(editorShowWhitespace.value).toBe(true);
		expect(memoryStorage.get("flexibleLayouts.editorShowWhitespace")).toBe("1");
	});
});

describe("Settings > G-code editor", () => {
	it("offers the tab width next to the editor switch, and choosing a value changes the shared setting", async () => {
		const wrapper = mountInDwc(FlexSettingsTab);
		await wrapper.vm.$nextTick();
		const select = wrapper.findAllComponents({ name: "VSelect" })
			.find((c) => c.props("label") === "plugins.flexibleLayouts.gcodeEditor.tabWidth");
		expect(select).toBeDefined();
		expect(select!.props("modelValue")).toBe(4);
		select!.vm.$emit("update:modelValue", 2);
		await wrapper.vm.$nextTick();
		expect(editorTabWidth.value).toBe(2);
		expect(select!.props("modelValue")).toBe(2);
		wrapper.unmount();
	});
});
