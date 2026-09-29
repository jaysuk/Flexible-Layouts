import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { defineComponent, h, nextTick, reactive } from "vue";

// A badge count the test can change, to see the tile follow it.
const badgeState = reactive({ notifications: 3, editors: 0 });

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
vi.mock("@/stores/menu", () => {
	const categories = [{ key: "control", captionKey: "menu.control.caption", icon: "mdi-tune", color: "control" }];
	const items = [
		{ path: "/", icon: "mdi-view-dashboard", caption: "Dashboard", translated: true, category: "control" },
		{
			path: "/Console", icon: "mdi-console", caption: "Console", translated: true, category: "control",
			badge: () => badgeState.notifications > 0 ? { value: badgeState.notifications, color: "error", onClear: () => { badgeState.notifications = 0; } } : null,
		},
		{
			path: "/Explorer", icon: "mdi-folder", caption: "Explorer", translated: true, category: "control",
			badge: () => badgeState.editors > 0 ? { value: badgeState.editors, color: "warning" } : null,
		},
		{ path: "/Macros", icon: "mdi-play", caption: "Macros", translated: true, category: "control" },
	];
	return {
		useMenuStore: () => ({
			categories, allItems: items, visibleCategories: categories,
			itemsByCategory: (key: string) => items.filter((i) => i.category === key),
			registerPluginContextMenuItem() { /* no-op */ },
		}),
	};
});

// The page component the override renders when it is not the hub: a marker, so this file doesn't need the layout store.
vi.mock("../src/page/FlexPage.vue", () => ({
	default: { name: "FlexPage", props: ["pageId", "kind", "fallback", "seed", "lockFallbackWhilePrinting", "defaultFullPage"], render() { return null; } },
}));

import MobileHub from "../src/shell/MobileHub.vue";
import { BUILTIN_PAGES } from "../src/model/builtinPages";
import { editMode } from "../src/model/editorState";
import { setStockMobileNav } from "../src/model/mobileNav";
import { createPageOverride } from "../src/page/pageOverride";

function setViewport(width: number): void {
	window.matchMedia = ((query: string) => {
		const min = /min-width:\s*(\d+)px/.exec(query);
		return {
			matches: min ? width >= Number(min[1]) : false, media: query,
			addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
			onchange: null, dispatchEvent: () => false,
		} as unknown as MediaQueryList;
	}) as typeof window.matchMedia;
}

beforeEach(() => {
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
	setStockMobileNav(false);
	editMode.value = false;
	badgeState.notifications = 3;
	badgeState.editors = 0;
	dwc.route.path = "/";
});
afterEach(() => vi.unstubAllGlobals());

// DWC's NavMenuBadge is a global component the kit doesn't register: a stub that shows what it was given.
const NavMenuBadgeStub = defineComponent({
	name: "NavMenuBadge",
	props: { badge: { type: Object, required: true }, size: { type: String, default: "x-small" }, noClear: { type: Boolean, default: false } },
	setup(props) { return () => h("span", { class: "badge-stub", "data-value": String(props.badge.value), "data-color": String(props.badge.color) }, String(props.badge.value)); },
});
const mountHub = () => mountInDwc(MobileHub, { global: { components: { NavMenuBadge: NavMenuBadgeStub } } });

describe("MobileHub tile badges (stock: HubTiles.vue + NavMenuBadge)", () => {
	it("has a single element root: a fragment root (e.g. a leading comment, which dev builds keep) cannot be slid out by <Transition>", () => {
		const w = mountHub();
		expect(w.element.nodeType).toBe(1);
		expect(w.element.classList.contains("v-container")).toBe(true);
		expect(w.element.parentNode?.childNodes.length ?? 1).toBe(1);
	});

	it("shows a page's badge in its tile, and only on the tiles that have one", () => {
		const w = mountHub();
		const tiles = w.findAll(".fl-hub-tile");
		expect(tiles).toHaveLength(4);
		const withBadge = tiles.filter((t) => t.find(".badge-stub").exists());
		expect(withBadge).toHaveLength(1);
		expect(withBadge[0].text()).toContain("Console");
		expect(withBadge[0].find(".badge-stub").attributes("data-value")).toBe("3");
		expect(withBadge[0].find(".badge-stub").attributes("data-color")).toBe("error");
	});

	it("passes the badge to NavMenuBadge the way the stock tile does: default size, and not dismissible from a tile", () => {
		const w = mountHub();
		const badge = w.findComponent(NavMenuBadgeStub);
		expect(badge.props("size")).toBe("default");
		expect(badge.props("noClear")).toBe(true);
	});

	it("is anchored to the tile's corner", () => {
		const w = mountHub();
		expect(w.find(".fl-hub-tile").classes()).toContain("position-relative");
		expect(w.find(".fl-hub-tile-badge").exists()).toBe(true);
	});

	it("follows the store: a count appears, changes and goes", async () => {
		const w = mountHub();
		expect(w.findAll(".badge-stub")).toHaveLength(1);
		badgeState.editors = 2; // Explorer's "modified editors" chip
		await nextTick();
		expect(w.findAll(".badge-stub").map((b) => b.attributes("data-value")).sort()).toEqual(["2", "3"]);
		badgeState.notifications = 0;
		await nextTick();
		expect(w.findAll(".badge-stub").map((b) => b.attributes("data-value"))).toEqual(["2"]);
	});

	it("still lists every tile and its link with badges present (the badge is not in the way of the link)", () => {
		const w = mountHub();
		const targets = w.findAllComponents({ name: "VCard" }).map((c) => c.props("to"));
		expect(targets).toEqual(["/Dashboard", "/Console", "/Explorer", "/Macros"]);
	});
});

describe("the Dashboard route override (one component per path)", () => {
	const dashboard = BUILTIN_PAGES.find((d) => d.pageId === "/Dashboard")!;
	const mountOverride = (path: string) => mountInDwc(createPageOverride(dashboard, path), { global: { components: { NavMenuBadge: NavMenuBadgeStub } } });
	const hubShown = (w: ReturnType<typeof mountOverride>) => w.find(".fl-hub-tile").exists();

	it("is a different component for / and /Dashboard, so the slide between them has two component types to swap", () => {
		expect(dashboard.paths).toEqual(expect.arrayContaining(["/", "/Dashboard"]));
		expect(createPageOverride(dashboard, "/")).not.toBe(createPageOverride(dashboard, "/Dashboard"));
	});

	it("shows the hub at / on a phone with DWC-style navigation", () => {
		setViewport(400);
		setStockMobileNav(true);
		expect(hubShown(mountOverride("/"))).toBe(true);
	});

	it("keeps showing the hub while the route has already moved on: the hub that is sliding out must not turn into the dashboard", async () => {
		setViewport(400);
		setStockMobileNav(true);
		const w = mountOverride("/");
		expect(hubShown(w)).toBe(true);
		dwc.route.path = "/Console"; // the navigation the slide is for
		await nextTick();
		expect(hubShown(w)).toBe(true);
	});

	it("never shows the hub at /Dashboard", () => {
		setViewport(400);
		setStockMobileNav(true);
		expect(hubShown(mountOverride("/Dashboard"))).toBe(false);
	});

	it("shows the dashboard at / with the default navigation, on desktop, and while editing", async () => {
		setViewport(400);
		expect(hubShown(mountOverride("/"))).toBe(false); // DWC-style navigation off
		setStockMobileNav(true);
		setViewport(1400);
		expect(hubShown(mountOverride("/"))).toBe(false); // md+
		setViewport(400);
		editMode.value = true;
		expect(hubShown(mountOverride("/"))).toBe(false); // editing needs the real dashboard
	});

	it("turns into the dashboard when editing starts while the hub is showing", async () => {
		setViewport(400);
		setStockMobileNav(true);
		const w = mountOverride("/");
		expect(hubShown(w)).toBe(true);
		editMode.value = true;
		await nextTick();
		expect(hubShown(w)).toBe(false);
	});

	it("other built-in pages are never the hub", () => {
		setViewport(400);
		setStockMobileNav(true);
		const console = BUILTIN_PAGES.find((d) => d.pageId === "/Console")!;
		expect(hubShown(mountInDwc(createPageOverride(console, "/Console")))).toBe(false);
	});
});
