import { beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";

const replace = vi.fn(async () => undefined);
vi.mock("vue-router", async () => {
	const { dwc: state } = await import("dwc-plugin-test-kit");
	return { useRoute: () => state.route, useRouter: () => ({ replace, push: vi.fn(), beforeEach: () => () => { /* unregister */ } }) };
});

import { createEmptyDocument, createEmptyPage } from "../model/document";
import { CUSTOM_PAGE_PREFIX as P, migrateOpaquePageIds } from "../model/pageSlug";
import { setLiveDocument } from "../model/store";
import CustomPageAlias from "../page/CustomPageAlias.vue";

const OLD = `${P}3f2b8c1e-9a4d-4e6b-8f10-2c7d5a9e1b34`;

beforeEach(() => {
	replace.mockClear();
	const doc = createEmptyDocument();
	doc.pages[OLD] = { ...createEmptyPage("custom"), title: "Print Farm" };
	migrateOpaquePageIds(doc);
	setLiveDocument(doc);
});

describe("CustomPageAlias", () => {
	it("sends an old address to the page's current one, keeping the query, and shows nothing itself", () => {
		dwc.route.path = OLD;
		dwc.route.query = { tab: "2" };
		const w = mountInDwc(CustomPageAlias);
		expect(replace).toHaveBeenCalledWith({ path: `${P}print-farm`, query: { tab: "2" }, hash: undefined });
		expect(w.text()).toBe("");
		w.unmount();
	});

	it("goes home from an address nothing ever had, rather than showing a dead page", () => {
		dwc.route.path = `${P}never-existed`;
		const w = mountInDwc(CustomPageAlias);
		expect(replace).toHaveBeenCalledWith(expect.objectContaining({ path: "/" }));
		w.unmount();
	});
});
