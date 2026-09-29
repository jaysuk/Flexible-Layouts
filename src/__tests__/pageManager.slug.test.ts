import { beforeEach, describe, expect, it, vi } from "vitest";
import { dwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

const { registerRoute, unregisterRoute, unregisterItem } = vi.hoisted(() => ({
	registerRoute: vi.fn(), unregisterRoute: vi.fn(), unregisterItem: vi.fn(),
}));
vi.mock("@/plugins", async (importOriginal) => ({ ...await importOriginal<typeof import("@/plugins")>(), registerRoute, unregisterRoute }));
vi.mock("@/stores/menu", () => ({
	useMenuStore: () => ({ categories: [], unregisterItem, registerItem: vi.fn() }),
}));

import { createEmptyDocument, createEmptyPage, type LayoutDocument } from "../model/document";
import { mergeImported } from "../model/io";
import {
	createCustomPage, deleteCustomPage, registerExistingCustomPages, unregisterAllCustomPages,
} from "../model/pageManager";
import { CUSTOM_PAGE_PREFIX as P } from "../model/pageSlug";
import { setLiveDocument, useLayoutStore } from "../model/store";
import CustomPageAlias from "../page/CustomPageAlias.vue";
import CustomPageHost from "../page/CustomPageHost.vue";

const UUID_A = "3f2b8c1e-9a4d-4e6b-8f10-2c7d5a9e1b34";
const UUID_B = "a1b2c3d4-0000-4000-8000-123456789abc";

function load(pages: Record<string, string>): LayoutDocument {
	const doc = createEmptyDocument();
	for (const [path, title] of Object.entries(pages)) {
		doc.pages[path] = { ...createEmptyPage("custom"), title };
	}
	setLiveDocument(doc);
	return useLayoutStore().document.value;
}

/** The registered route paths, split by which component serves them. */
function registered(): { pages: Array<string>; aliases: Array<string> } {
	const of = (component: unknown) => registerRoute.mock.calls
		.filter((c) => c[0] === component)
		.map((c) => Object.values(Object.values(c[1] as Record<string, Record<string, { path: string }>>)[0])[0].path);
	return { pages: of(CustomPageHost), aliases: of(CustomPageAlias) };
}

beforeEach(() => {
	(dwc.settings as Record<string, unknown>).hiddenMenuItems = [];
	registerRoute.mockClear();
	unregisterRoute.mockClear();
	unregisterItem.mockClear();
	unregisterAllCustomPages();
	registerRoute.mockClear();
	unregisterRoute.mockClear();
});

describe("a new custom page", () => {
	it("gets an address made from its title, and a clash gets a number", () => {
		load({});
		expect(createCustomPage({ title: "Print Farm" })).toBe(`${P}print-farm`);
		expect(createCustomPage({ title: "Print Farm" })).toBe(`${P}print-farm-2`);
		expect(registered().pages).toEqual([`${P}print-farm`, `${P}print-farm-2`]);
	});

	it("does not take the address of a page that is already there, whatever its title says now", () => {
		const doc = load({});
		doc.pages[`${P}notes`] = { ...createEmptyPage("custom"), title: "Renamed later" };
		expect(createCustomPage({ title: "Notes" })).toBe(`${P}notes-2`);
	});
});

describe("registerExistingCustomPages on a layout that still has generated ids", () => {
	it("re-keys the pages, updates the navigation lists, and registers the new addresses", () => {
		const doc = load({ [P + UUID_A]: "Print Farm", [P + UUID_B]: "Tools" });
		doc.nav.order = [P + UUID_B, P + UUID_A];
		doc.startupPath = P + UUID_A;
		registerExistingCustomPages();
		expect(Object.keys(doc.pages)).toEqual([`${P}print-farm`, `${P}tools`]);
		expect(doc.nav.order).toEqual([`${P}tools`, `${P}print-farm`]);
		expect(doc.startupPath).toBe(`${P}print-farm`);
		expect(registered().pages).toEqual([`${P}print-farm`, `${P}tools`]);
	});

	it("keeps the old address working, as a route that takes no place in the navigation", () => {
		load({ [P + UUID_A]: "Print Farm" });
		registerExistingCustomPages();
		expect(registered().aliases).toEqual([P + UUID_A]);
		const aliasCall = registerRoute.mock.calls.find((c) => c[0] === CustomPageAlias)!;
		const entry = Object.values(Object.values(aliasCall[1] as Record<string, Record<string, { condition: () => boolean }>>)[0])[0];
		expect(entry.condition()).toBe(false); // never shown by the drawer
		expect(unregisterItem).toHaveBeenCalledWith(P + UUID_A); // ...and taken out of the menu store altogether
	});

	it("is harmless the second time (a profile switch runs it again)", () => {
		const doc = load({ [P + UUID_A]: "Print Farm" });
		registerExistingCustomPages();
		const once = JSON.stringify(doc);
		unregisterAllCustomPages();
		registerRoute.mockClear();
		registerExistingCustomPages();
		expect(JSON.stringify(doc)).toBe(once);
		expect(registered()).toEqual({ pages: [`${P}print-farm`], aliases: [P + UUID_A] });
	});

	it("tears the old address down with the page, and with everything else", () => {
		const doc = load({ [P + UUID_A]: "Print Farm" });
		registerExistingCustomPages();
		deleteCustomPage(`${P}print-farm`);
		expect(unregisterRoute).toHaveBeenCalledWith(P + UUID_A);
		expect(unregisterRoute).toHaveBeenCalledWith(`${P}print-farm`);
		expect(doc.pages).toEqual({});

		load({ [P + UUID_B]: "Tools" });
		registerExistingCustomPages();
		unregisterRoute.mockClear();
		unregisterAllCustomPages();
		expect(unregisterRoute.mock.calls.map((c) => c[0]).sort()).toEqual([P + UUID_B, `${P}tools`].sort());
	});
});

describe("panel settings saved under a page's old address", () => {
	it("follow the page to its new one", () => {
		load({ [P + UUID_A]: "Print Farm" });
		const saved: Record<string, unknown> = {
			[`${P}${UUID_A}::MacroList`]: { data: "a" },
			[`${P}${UUID_A}::Group::ExplorerPanel`]: { data: "b" },
			"/Console::EventList": { data: "other page" },
		};
		(dwc.settings as Record<string, unknown>).componentSettings = saved;
		registerExistingCustomPages();
		expect(Object.keys(saved).sort()).toEqual([
			"/Console::EventList", `${P}print-farm::Group::ExplorerPanel`, `${P}print-farm::MacroList`,
		]);
		expect(saved[`${P}print-farm::MacroList`]).toEqual({ data: "a" });
	});

	it("are picked up when DWC loads its settings after the plugin has loaded", async () => {
		load({ [P + UUID_A]: "Print Farm" });
		(dwc.settings as Record<string, unknown>).componentSettings = {};
		registerExistingCustomPages();
		const saved = (dwc.settings as { componentSettings: Record<string, unknown> }).componentSettings;
		saved[`${P}${UUID_A}::MacroList`] = { data: "late" }; // the settings file arrives
		await nextTick();
		await nextTick();
		expect(saved[`${P}print-farm::MacroList`]).toEqual({ data: "late" });
		expect(`${P}${UUID_A}::MacroList` in saved).toBe(false);
	});
});

describe("importing pages whose readable addresses can collide", () => {
	function withPage(path: string, title: string): LayoutDocument {
		const doc = createEmptyDocument();
		doc.pages[path] = { ...createEmptyPage("custom"), title };
		doc.nav.order = [path];
		return doc;
	}

	it("gives somebody else's page of the same address an address of its own, instead of overwriting ours", () => {
		const current = withPage(`${P}home`, "Home");
		const imported = withPage(`${P}home`, "Home Dashboard");
		imported.nav.hidden = [`${P}home`];
		const merged = mergeImported(current, imported);
		expect(merged.pages[`${P}home`].title).toBe("Home");
		expect(merged.pages[`${P}home-dashboard`].title).toBe("Home Dashboard");
		expect(merged.nav.order).toEqual([`${P}home`, `${P}home-dashboard`]);
		expect(merged.nav.hidden).toEqual([`${P}home-dashboard`]);
	});

	it("still lets a page come back over itself (same address, same title)", () => {
		const current = withPage(`${P}home`, "Home");
		current.pages[`${P}home`].icon = "mdi-old";
		const imported = withPage(`${P}home`, "Home");
		imported.pages[`${P}home`].icon = "mdi-new";
		const merged = mergeImported(current, imported);
		expect(Object.keys(merged.pages)).toEqual([`${P}home`]);
		expect(merged.pages[`${P}home`].icon).toBe("mdi-new");
	});

	it("keeps the exporting layout's own sections when a replace-import swaps the navigation", () => {
		const imported = withPage(`${P}home`, "Home");
		imported.nav.customCategories = [{ key: "flx-mine", name: "Mine" }];
		const merged = mergeImported(createEmptyDocument(), imported, { replaceExisting: true });
		expect(merged.nav.customCategories).toEqual([{ key: "flx-mine", name: "Mine" }]);
	});
});
