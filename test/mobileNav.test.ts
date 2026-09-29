import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

// The kit's settings stub has no `hiddenMenuItems` (DWC's own globally-hidden pages), which the nav
// list reads; wrap the real stub rather than replace it (see CLAUDE.md, "Testing").
vi.mock("@/stores/settings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/settings")>();
	return {
		...actual,
		useSettingsStore: () => {
			const store = actual.useSettingsStore() as unknown as Record<string, unknown>;
			store.hiddenMenuItems ??= [];
			return store as unknown as ReturnType<typeof actual.useSettingsStore>;
		},
	};
});

// The kit's menu stub has no categories/items; the shell and hub read both.
vi.mock("@/stores/menu", () => {
	const categories = [{ key: "control", captionKey: "menu.control.caption", icon: "mdi-tune", color: "control" }];
	const items = [
		{ path: "/", icon: "mdi-view-dashboard", caption: "Dashboard", translated: true, category: "control" },
		{ path: "/Console", icon: "mdi-console", caption: "Console", translated: true, category: "control" },
	];
	return {
		useMenuStore: () => ({
			categories,
			allItems: items,
			visibleCategories: categories,
			itemsByCategory: (key: string) => items.filter((i) => i.category === key),
			registerPluginContextMenuItem() { /* no-op */ },
		}),
	};
});

import FlexShell from "../src/shell/FlexShell.vue";
import MobileHub from "../src/shell/MobileHub.vue";
import { setStockMobileNav, stockMobileNav } from "../src/model/mobileNav";

// Phone-width matchMedia: nothing matches min-width queries, so smAndUp/mdAndUp/lgAndUp are all false.
function setViewport(width: number): void {
	window.matchMedia = ((query: string) => {
		const min = /min-width:\s*(\d+)px/.exec(query);
		return {
			matches: min ? width >= Number(min[1]) : false,
			media: query,
			addEventListener: () => {}, removeEventListener: () => {},
			addListener: () => {}, removeListener: () => {},
			onchange: null, dispatchEvent: () => false,
		} as unknown as MediaQueryList;
	}) as typeof window.matchMedia;
}

function setStatus(status: string): void {
	(dwc.model as unknown as { state: Record<string, unknown> }).state.status = status;
}

function mount(component: typeof FlexShell | typeof MobileHub) {
	return mountInDwc(component);
}

describe("phone chrome", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
		setStockMobileNav(false);
		setStatus("idle");
		dwc.route.path = "/Console";
	});
	afterEach(() => vi.unstubAllGlobals());

	it("offers the status-region toggle below md (it was unreachable before)", async () => {
		setViewport(400);
		const w = mount(FlexShell);
		await nextTick();
		expect(w.find("button[title]").exists()).toBe(true);
		expect(w.html()).toContain("mdi-list-status");
	});

	it("has no status toggle on desktop", async () => {
		setViewport(1400);
		const w = mount(FlexShell);
		await nextTick();
		expect(w.html()).not.toContain("mdi-list-status");
	});

	it("shows the job progress ring below md while printing, but not when idle", async () => {
		setViewport(400);
		setStatus("processing");
		expect(mount(FlexShell).find(".fl-job-progress").exists()).toBe(true);
		setStatus("idle");
		expect(mount(FlexShell).find(".fl-job-progress").exists()).toBe(false);
	});

	it("keeps the drawer toggle by default, and swaps it for a back arrow with DWC-style navigation", async () => {
		setViewport(400);
		expect(mount(FlexShell).html()).toContain("v-app-bar-nav-icon");
		setStockMobileNav(true);
		const w = mount(FlexShell);
		expect(w.html()).toContain("mdi-arrow-left");
		expect(w.html()).not.toContain("v-app-bar-nav-icon");
	});

	it("never swaps to the stock navigation on desktop", () => {
		setViewport(1400);
		setStockMobileNav(true);
		const w = mount(FlexShell);
		expect(w.html()).not.toContain("mdi-arrow-left");
		expect(stockMobileNav.value).toBe(true);
	});
});

describe("MobileHub", () => {
	it("lists a tile per page, sending the Dashboard tile to /Dashboard (the hub itself is /)", () => {
		const w = mount(MobileHub);
		const tiles = w.findAll(".fl-hub-tile");
		expect(tiles).toHaveLength(2);
		expect(w.text()).toContain("Console");
		const targets = w.findAllComponents({ name: "VCard" }).map((c) => c.props("to"));
		expect(targets).toContain("/Dashboard");
		expect(targets).not.toContain("/");
	});
});
