import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";

// Same wiring as mobileNav.test.ts: the kit's settings/menu stubs lack what the shell reads.
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
	const items = [{ path: "/Console", icon: "mdi-console", caption: "Console", translated: true, category: "control" }];
	return {
		useMenuStore: () => ({
			categories, allItems: items, visibleCategories: categories,
			itemsByCategory: (key: string) => items.filter((i) => i.category === key),
			registerPluginContextMenuItem() { /* no-op */ },
		}),
	};
});

import { cancelPrompt, hashPassword, relock, setAccess } from "../src/model/access";
import { enterKiosk, resetScreenStateForTests, kioskActive } from "../src/model/screenState";
import FlexShell from "../src/shell/FlexShell.vue";

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

describe("kiosk mode in the shell", () => {
	beforeEach(() => {
		const map = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k),
		});
		(dwc.model as unknown as { state: Record<string, unknown> }).state.status = "idle";
		dwc.route.path = "/Console";
		setViewport(1400);
		relock();
		setAccess({ observerEnabled: false, operatorEnabled: false, adminHash: "", operatorHash: "" });
		resetScreenStateForTests();
	});
	afterEach(() => {
		resetScreenStateForTests();
		vi.unstubAllGlobals();
	});

	it("normally shows the app bar, the drawer and no exit control", async () => {
		const w = mountInDwc(FlexShell);
		await nextTick();
		expect(w.find(".v-app-bar").exists()).toBe(true);
		expect(w.find(".v-navigation-drawer").exists()).toBe(true);
		expect(w.find(".fl-kiosk-exit").exists()).toBe(false);
	});

	it("hides the app bar and drawer in kiosk mode and offers a floating way out", async () => {
		enterKiosk();
		const w = mountInDwc(FlexShell);
		await nextTick();
		expect(w.find(".v-app-bar").exists()).toBe(false);
		expect(w.find(".v-navigation-drawer").exists()).toBe(false);
		expect(w.find(".fl-kiosk-exit").exists()).toBe(true);
	});

	it("the exit control leaves kiosk and brings the chrome back", async () => {
		enterKiosk();
		const w = mountInDwc(FlexShell);
		await nextTick();
		await w.find(".fl-kiosk-exit").trigger("click");
		await flushPromises();
		expect(kioskActive.value).toBe(false);
		expect(w.find(".v-app-bar").exists()).toBe(true);
		expect(w.find(".fl-kiosk-exit").exists()).toBe(false);
	});

	it("with an access lock, the exit control keeps kiosk on until the password is given", async () => {
		setAccess({ observerEnabled: true, operatorEnabled: false, adminHash: hashPassword("secret"), operatorHash: "" });
		enterKiosk();
		const w = mountInDwc(FlexShell);
		await nextTick();
		await w.find(".fl-kiosk-exit").trigger("click");
		await nextTick();
		expect(kioskActive.value).toBe(true);
		expect(w.find(".fl-kiosk-exit").exists()).toBe(true);
		cancelPrompt();
		await flushPromises();
		expect(kioskActive.value).toBe(true);
	});

	it("?kiosk=1 in the address turns it on when the shell loads", async () => {
		const original = window.location.href;
		window.history.replaceState({}, "", "/?kiosk=1");
		try {
			const w = mountInDwc(FlexShell);
			await nextTick();
			expect(kioskActive.value).toBe(true);
			expect(w.find(".v-app-bar").exists()).toBe(false);
		} finally {
			window.history.replaceState({}, "", original);
		}
	});
});
