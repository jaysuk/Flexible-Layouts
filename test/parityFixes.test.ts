import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc, setModel, loadObjectModel } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

// Overridable DWC settings the shell now honours. The kit's settings stub has neither these nor
// `hiddenMenuItems`, so wrap the real stub and read them from a per-test object.
const settings = vi.hoisted(() => ({ iconMenu: false, largeButtons: false, dashboardMode: "Default" }));
vi.mock("@/stores/settings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/settings")>();
	return {
		...actual,
		useSettingsStore: () => {
			const store = actual.useSettingsStore() as unknown as Record<string, unknown>;
			store.hiddenMenuItems ??= [];
			Object.assign(store, settings);
			return store as unknown as ReturnType<typeof actual.useSettingsStore>;
		},
	};
});

// Two categories: one with two pages, one whose only page reads the same as the category (Settings > Settings).
vi.mock("@/stores/menu", () => {
	const categories = [
		{ key: "control", captionKey: "Control", icon: "mdi-tune", color: "control" },
		{ key: "settings", captionKey: "Settings", icon: "mdi-cog", color: "settings" },
	];
	const items = [
		{ path: "/Dashboard", icon: "mdi-view-dashboard", caption: "Dashboard", translated: true, category: "control" },
		{ path: "/Console", icon: "mdi-console", caption: "Console", translated: true, category: "control" },
		{ path: "/Settings", icon: "mdi-cog", caption: "Settings", translated: true, category: "settings" },
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
import WidgetView from "../src/widgets/WidgetView.vue";
import { BUILTIN_PAGES, statusBarSeed } from "../src/model/builtinPages";
import { createDefaultWidget } from "../src/model/document";
import { accessLockedFor } from "../src/model/access";
import { wantsCncLayout } from "../src/util/machineMode";
import { BUILTIN_PANELS, FREEFORM_WIDGETS } from "../src/widgets/registry";

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

function setMachineMode(mode: string | undefined): void {
	(dwc.model as unknown as { state: Record<string, unknown> }).state.machineMode = mode;
}

function componentsOf(items: Array<{ widget: unknown }>): Array<string> {
	return items.map((it) => (it.widget as { component: string }).component);
}

describe("side drawer honours DWC's menu settings", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
		dwc.route.path = "/Console";
		settings.iconMenu = false;
		settings.largeButtons = false;
	});
	afterEach(() => vi.unstubAllGlobals());

	it("flattens a single-page category whose label mirrors the page, and keeps real categories grouped", async () => {
		setViewport(1400);
		const w = mountInDwc(FlexShell);
		await nextTick();
		// Only "Control" (two pages) is a group; "Settings" is a plain link.
		expect(w.findAll(".v-list-group").length).toBe(1);
		expect(w.findAll(".menu-category-item").length).toBe(1);
		expect(w.findAll(".menu-route-item").length).toBe(3);
	});

	it("shows a flat icon rail instead of groups when DWC's icon menu is on", async () => {
		setViewport(1400);
		settings.iconMenu = true;
		const w = mountInDwc(FlexShell);
		await nextTick();
		expect(w.find(".v-navigation-drawer--rail").exists()).toBe(true);
		expect(w.findAll(".v-list-group").length).toBe(0);
		expect(w.findAll(".menu-route-item").length).toBe(3);
	});

	it("ignores the icon menu setting on a phone (the drawer is an overlay there)", async () => {
		setViewport(400);
		settings.iconMenu = true;
		const w = mountInDwc(FlexShell);
		await nextTick();
		expect(w.find(".v-navigation-drawer--rail").exists()).toBe(false);
	});

	it("grows the app bar on sm touchscreens when DWC's large-buttons setting is on, and only there", async () => {
		settings.largeButtons = true;
		setViewport(700);
		let w = mountInDwc(FlexShell);
		await nextTick();
		expect(w.find(".v-toolbar__content").attributes("style")).toContain("height: 80px");
		w.unmount();

		setViewport(1400);
		w = mountInDwc(FlexShell);
		await nextTick();
		expect(w.find(".v-toolbar__content").attributes("style")).toContain("height: 64px");
	});
});

describe("Dashboard mode override picks the starter layout", () => {
	it("wantsCncLayout: the override wins, otherwise the machine's own mode decides", () => {
		expect(wantsCncLayout("fff", "CNC")).toBe(true);
		expect(wantsCncLayout("cnc", "FFF")).toBe(false);
		expect(wantsCncLayout("cnc", "Default")).toBe(true);
		expect(wantsCncLayout("laser")).toBe(true);
		expect(wantsCncLayout("fff", "Default")).toBe(false);
		expect(wantsCncLayout(undefined)).toBe(false);
	});

	it("seeds the CNC status bar on an FFF machine when the override says CNC", () => {
		setMachineMode("fff");
		settings.dashboardMode = "CNC";
		expect(componentsOf(statusBarSeed())).toEqual(["StatusPanel", "CNCAxesPosition"]);
		settings.dashboardMode = "Default";
	});
});

describe("Job pages are editable", () => {
	const job = BUILTIN_PAGES.find((d) => d.pageId === "/Job/Status")!;
	const webcam = BUILTIN_PAGES.find((d) => d.pageId === "/Job/Webcam")!;

	it("overrides /Job/Status and /Job/Webcam, unlocked while printing", () => {
		expect(job.paths).toEqual(["/Job/Status"]);
		expect(webcam.paths).toEqual(["/Job/Webcam"]);
		expect(job.lockWhilePrinting).toBe(false);
		expect(webcam.lockWhilePrinting).toBe(false);
	});

	it("seeds the stock Job layout, with the G-code preview and extrusion factors on FFF", () => {
		setMachineMode("fff");
		settings.dashboardMode = "Default";
		const seed = componentsOf(job.seed!());
		expect(seed).toEqual(expect.arrayContaining(["JobProgress", "JobViewPanel", "JobControlPanel", "JobTimesPanel", "ExtrusionFactorsPanel"]));
	});

	it("drops extrusion factors on a CNC machine", () => {
		setMachineMode("cnc");
		expect(componentsOf(job.seed!())).not.toContain("ExtrusionFactorsPanel");
	});

	it("catalogues the job preview and progress panels", () => {
		const names = BUILTIN_PANELS.map((p) => p.component);
		expect(names).toEqual(expect.arrayContaining(["JobViewPanel", "JobProgress"]));
	});
});

describe("emergency stop and filament monitor widgets", () => {
	it("are in the palette", () => {
		const types = FREEFORM_WIDGETS.map((e) => e.type);
		expect(types).toEqual(expect.arrayContaining(["emergencyStop", "filamentMonitor"]));
	});

	it("the emergency stop is never access-locked", () => {
		expect(accessLockedFor({ type: "emergencyStop" })).toBe(false);
	});

	it("filament monitor lists one row per configured monitor and none for unassigned slots", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				sensors: {
					filamentMonitors: [
						{ status: "ok", type: "simple" },
						null,
						{ status: "noFilament", type: "simple" },
					],
				},
			},
		}));
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("filamentMonitor") } });
		await nextTick();
		const text = w.text();
		expect(text).toContain("E0");
		expect(text).toContain("E2");
		expect(text).not.toContain("E1");
	});

	it("filament monitor says so when none are configured", async () => {
		setModel(loadObjectModel(undefined, { overrides: { sensors: { filamentMonitors: [] } } }));
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("filamentMonitor") } });
		await nextTick();
		expect(w.text()).toContain("filamentMonitor.none");
	});
});
