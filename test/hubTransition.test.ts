import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { defineComponent, h, nextTick } from "vue";

// The kit's router stub has a no-op beforeEach; this file needs to see the guards to run them.
type Guard = (to: { path: string }, from: { path: string }) => unknown;
const guards: Array<Guard> = [];
const unregisters: Array<ReturnType<typeof vi.fn>> = [];
vi.mock("vue-router", () => ({
	useRoute: () => dwc.route,
	useRouter: () => ({
		currentRoute: { value: dwc.route },
		push: async () => undefined,
		replace: async () => undefined,
		beforeEach: (guard: Guard) => {
			guards.push(guard);
			const off = vi.fn(() => { guards.splice(guards.indexOf(guard), 1); });
			unregisters.push(off);
			return off;
		},
		afterEach: () => () => undefined,
		getRoutes: () => [],
		resolve: () => ({ href: "/" }),
	}),
}));

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
		{ path: "/Console", icon: "mdi-console", caption: "Console", translated: true, category: "control" },
	];
	return {
		useMenuStore: () => ({
			categories, allItems: items, visibleCategories: categories,
			itemsByCategory: (key: string) => items.filter((i) => i.category === key),
			registerPluginContextMenuItem() { /* no-op */ },
		}),
	};
});

import FlexShell from "../src/shell/FlexShell.vue";
import { HUB_BACK, HUB_FORWARD, hubTransitionFor, topLevelPath, useHubTransition } from "../src/shell/hubTransition";
import { editMode } from "../src/model/editorState";
import { setStockMobileNav } from "../src/model/mobileNav";

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

const navigate = (from: string, to: string): void => {
	for (const g of [...guards]) g({ path: to }, { path: from });
};

beforeEach(() => {
	guards.length = 0;
	unregisters.length = 0;
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
	setStockMobileNav(false);
	editMode.value = false;
	dwc.route.path = "/Console";
});
afterEach(() => vi.unstubAllGlobals());

describe("hubTransitionFor (the stock hub-forward / hub-back rules)", () => {
	it("slides forward out of the hub into a page, and back from a page into the hub", () => {
		expect(hubTransitionFor("/", "/Console", true)).toBe(HUB_FORWARD);
		expect(hubTransitionFor("/", "/Dashboard", true)).toBe(HUB_FORWARD); // the Dashboard tile links to /Dashboard
		expect(hubTransitionFor("/Console", "/", true)).toBe(HUB_BACK);
		expect(hubTransitionFor("/Dashboard", "/", true)).toBe(HUB_BACK);
	});

	it("does not slide from page to page", () => {
		expect(hubTransitionFor("/Console", "/Macros", true)).toBe("");
	});

	it("does not reset the slide when a page redirects to a default subroute (same top-level segment)", () => {
		expect(hubTransitionFor("/Settings", "/Settings/General", true)).toBe("");
		expect(hubTransitionFor("/Explorer/0:/gcodes", "/Explorer/0:/macros", true)).toBe("");
		expect(hubTransitionFor("/", "/", true)).toBe("");
	});

	it("does not slide at all where there is no hub to slide from (md+, DWC-style navigation off, editing)", () => {
		expect(hubTransitionFor("/", "/Console", false)).toBe("");
		expect(hubTransitionFor("/Console", "/", false)).toBe("");
	});

	it("names the top-level segment", () => {
		expect(topLevelPath("/")).toBe("/");
		expect(topLevelPath("/Settings/General")).toBe("/Settings");
		expect(topLevelPath("")).toBe("/");
	});
});

describe("useHubTransition", () => {
	function mountProbe(canSlide: () => boolean) {
		let name!: ReturnType<typeof useHubTransition>;
		const Probe = defineComponent({ setup() { name = useHubTransition(canSlide); return () => h("div"); } });
		const w = mountInDwc(Probe);
		return { w, name: () => name.value };
	}

	it("sets the name from each navigation, in the guard (before the route component swaps)", () => {
		const { name, w } = mountProbe(() => true);
		expect(name()).toBe("");
		navigate("/", "/Console");
		expect(name()).toBe(HUB_FORWARD);
		navigate("/Console", "/");
		expect(name()).toBe(HUB_BACK);
		navigate("/Console", "/Macros");
		expect(name()).toBe("");
		w.unmount();
	});

	it("asks canSlide at each navigation, not once", () => {
		let on = false;
		const { name, w } = mountProbe(() => on);
		navigate("/", "/Console");
		expect(name()).toBe("");
		on = true;
		navigate("/", "/Console");
		expect(name()).toBe(HUB_FORWARD);
		w.unmount();
	});

	it("removes its guard when the component goes away", () => {
		const { w } = mountProbe(() => true);
		expect(guards).toHaveLength(1);
		w.unmount();
		expect(guards).toHaveLength(0);
	});
});

describe("FlexShell hands the slide to DwcRouterView", () => {
	// DwcRouterView is one of DWC's global components: a stub that shows what it was given.
	const seen: { value: string | undefined } = { value: undefined };
	const RouterViewStub = defineComponent({
		props: { transitionName: { type: String, default: undefined } },
		setup(props) { return () => { seen.value = props.transitionName; return h("div", { class: "rv-stub" }); }; },
	});
	const mount = () => mountInDwc(FlexShell, { global: { stubs: { DwcRouterView: RouterViewStub } } });

	it("slides between the hub and a page on a phone with DWC-style navigation", async () => {
		setViewport(400);
		setStockMobileNav(true);
		const w = mount();
		await nextTick();
		expect(seen.value).toBe("");
		navigate("/", "/Console");
		await nextTick();
		expect(seen.value).toBe(HUB_FORWARD);
		navigate("/Console", "/");
		await nextTick();
		expect(seen.value).toBe(HUB_BACK);
		w.unmount();
	});

	it("never slides with the default drawer navigation", async () => {
		setViewport(400);
		const w = mount();
		navigate("/", "/Console");
		await nextTick();
		expect(seen.value).toBe("");
		w.unmount();
	});

	it("never slides on desktop, even with DWC-style navigation switched on", async () => {
		setViewport(1400);
		setStockMobileNav(true);
		const w = mount();
		navigate("/", "/Console");
		await nextTick();
		expect(seen.value).toBe("");
		w.unmount();
	});

	it("never slides while editing (the dashboard is being edited at /, and the drawer is how you leave)", async () => {
		setViewport(400);
		setStockMobileNav(true);
		editMode.value = true;
		const w = mount();
		navigate("/", "/Console");
		await nextTick();
		expect(seen.value).toBe("");
		w.unmount();
	});

	it("still shows the drawer toggle while editing on a phone with DWC-style navigation", async () => {
		setViewport(400);
		setStockMobileNav(true);
		editMode.value = true;
		const w = mount();
		await nextTick();
		expect(w.html()).toContain("v-app-bar-nav-icon");
		w.unmount();
	});
});

describe("the slide's CSS", () => {
	const source = readFileSync(resolve(process.cwd(), "src/shell/FlexShell.vue"), "utf8").replace(/\r\n/g, "\n");
	const CLASSES = ["fl-hub-forward-enter-active", "fl-hub-forward-leave-active", "fl-hub-back-enter-active", "fl-hub-back-leave-active"];

	it("defines both directions, and takes the page that is leaving out of flow", () => {
		for (const c of CLASSES) expect(source).toContain(`.${c}`);
		for (const c of ["fl-hub-forward-enter-from", "fl-hub-forward-leave-to", "fl-hub-back-enter-from", "fl-hub-back-leave-to"]) {
			expect(source).toContain(`.${c}`);
		}
		expect(source).toMatch(/\.fl-hub-forward-leave-active,\s*\.fl-hub-back-leave-active\s*\{[^}]*position:\s*absolute/);
	});

	it("respects prefers-reduced-motion: every animated class has its transition switched off", () => {
		const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(source);
		expect(block).not.toBeNull();
		for (const c of CLASSES) expect(block![1]).toContain(`.${c}`);
		expect(block![1]).toMatch(/transition:\s*none/);
	});

	it("is an unscoped block: the classes land on the routed page's own root, which a scoped rule would not reach", () => {
		const blocks = [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
		const withHub = blocks.filter((b) => b[2].includes(".fl-hub-forward-enter-active"));
		expect(withHub).toHaveLength(1);
		expect(withHub[0][1]).not.toContain("scoped");
	});

	it("clips the page below md and positions the parent the leaving page is placed against", () => {
		expect(source).toMatch(/\.fl-route-area\s*\{\s*position:\s*relative;\s*\}/);
		expect(source).toMatch(/@media \(max-width: 839\.98px\)\s*\{\s*\.fl-route-area\s*\{\s*overflow-x:\s*clip;/);
	});
});
