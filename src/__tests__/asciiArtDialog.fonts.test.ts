import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import AsciiArtDialog from "../widgets/AsciiArtDialog.vue";

const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

// The shipped catalogue is one fetched asset (scripts/build-banner-fonts.mjs); two real figlet fonts stand in for it.
const fonts = Object.fromEntries(["Small", "Big"].map((name) => [name, readFileSync(`node_modules/figlet/fonts/${name}.flf`, "utf8")]));
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => fonts })));
vi.mock("@/plugins", () => ({ pluginAssetUrl: (path: string) => `/${path}` }));

describe("AsciiArtDialog fonts", () => {
	it("offers the shipped fonts in a drop-down, draws the preview in the chosen one and remembers it", async () => {
		const w = mountInDwc(AsciiArtDialog, { props: { modelValue: false, attach: true } });
		await w.setProps({ modelValue: true });
		// Vuetify's menu is teleported and lazy, so read the list the drop-down is given off the component's own state.
		const vm = w.vm as unknown as { fonts: string[]; font: string };
		await vi.waitFor(() => expect(w.html()).toContain("data-ascii-art-font"));
		// Only what the asset ships (figlet's own list names fonts it has not loaded, which render as nothing).
		await vi.waitFor(() => expect(vm.fonts).toEqual(["Standard", "Big", "Small"]));

		await w.find("[data-ascii-art-text] input").setValue("Hi");
		await vi.waitFor(() => expect(w.find("[data-ascii-art-preview]").text()).toMatch(/^; /));
		const standard = w.find("[data-ascii-art-preview]").text();

		vm.font = "Big";
		await vi.waitFor(() => expect(w.find("[data-ascii-art-preview]").text()).not.toBe(standard));
		await w.find("[data-ascii-art-insert]").trigger("click");
		expect(w.emitted("insert")).toEqual([["Hi", "Big"]]);
		expect(memoryStorage.get("flexibleLayouts.bannerFont")).toBe("Big");
		w.unmount();
	});
});
