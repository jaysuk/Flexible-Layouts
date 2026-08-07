import { beforeEach, describe, expect, it, vi } from "vitest";

// resetTheme() re-applies the live Vuetify theme, which reaches `unregisterTheme` in DWC's
// `@/plugins` - a function the test kit's stub doesn't provide. Theme *registration* isn't what these
// tests are about; that the document field was cleared is.
vi.mock("../model/theme", () => ({ THEME_TOKENS: [], applyTheme: () => { /* no-op under test */ } }));

import { getAccess, setAccess, type AccessConfig } from "../model/access";
import { createEmptyDocument, type LayoutDocument } from "../model/document";
import {
	resetAccess, resetFirmwareUpdatePrefs, resetHeader, resetNav, resetSection, resetStartupRoutes,
	resetSdBackupPrefs, resetTheme, resetUpdatePrefs,
} from "../model/reset";
import { replaceAllProfiles, useLayoutStore } from "../model/store";

/** A document with every resettable section populated, so "did this reset touch anything else?" is
 *  answerable rather than vacuously true. */
function populated(): LayoutDocument {
	const doc = createEmptyDocument();
	doc.theme = { enabled: true, dark: true, colors: { primary: "#ff0000" }, customColors: [{ name: "brand", value: "#00ff00" }] };
	doc.nav = { order: ["/Console", "/"], hidden: ["/Jobs"], customCategories: [{ key: "c1", name: "Mine" }] };
	doc.header = { items: [], color: "#123456", title: "Shop floor" };
	doc.startupPath = "/Console";
	doc.jobStartPath = "/Job";
	doc.pages["/Dashboard"] = {
		kind: "override", grid: { cols: 12, rowHeight: 30 },
		items: [{ i: "a", x: 0, y: 0, w: 2, h: 2, widget: { type: "builtinPanel", component: "MovementPanel" } }],
	};
	return doc;
}

function liveDoc(): LayoutDocument {
	return useLayoutStore().document.value;
}

const cfg: AccessConfig = {
	observerEnabled: true, operatorEnabled: true, adminHash: "admin-hash", operatorHash: "op-hash", hideEmergencyStop: true,
};

/**
 * A working in-memory Storage. This environment exposes a `window.localStorage` whose methods are
 * not functions (the same quirk configBackup/credentials.ts carries its own fallback for), so the
 * preference resets have nothing real to clear unless we substitute one. Production code guards
 * with try/catch and degrades to a no-op; the tests need something assertable.
 */
function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
		setItem: (k: string, v: string) => { map.set(k, v); },
		removeItem: (k: string) => { map.delete(k); },
		clear: () => { map.clear(); },
		key: (i: number) => [...map.keys()][i] ?? null,
		get length() { return map.size; },
	} as Storage;
}

beforeEach(() => {
	replaceAllProfiles({ default: populated() }, "default");
	setAccess({ ...cfg });
	Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
	window.localStorage.setItem("flexibleLayouts.updateCheck.enabled", "0");
	window.localStorage.setItem("flexibleLayouts.updateCheck.dismissed", "1.2.3");
	window.localStorage.setItem("flexibleLayouts.sdBackup.enabled", "0");
	window.localStorage.setItem("flexibleLayouts.firmwareUpdateCheck.lastCheck.duet3d", "123");
});

describe("resetTheme", () => {
	it("restores a stock disabled theme", () => {
		resetTheme();
		expect(liveDoc().theme).toEqual({ enabled: false, colors: {} });
	});

	it("leaves every other section alone", () => {
		resetTheme();
		const doc = liveDoc();
		expect(doc.nav.order).toEqual(["/Console", "/"]);
		expect(doc.header?.title).toBe("Shop floor");
		expect(doc.startupPath).toBe("/Console");
		expect(doc.pages["/Dashboard"]).toBeDefined();
		expect(getAccess().adminHash).toBe("admin-hash");
	});
});

describe("resetNav", () => {
	it("clears order, hidden and custom categories", () => {
		resetNav();
		expect(liveDoc().nav).toEqual({ order: [], hidden: [] });
	});

	// Un-hiding is not deleting: the page was never removed, so it must still be there afterwards.
	it("does not delete any page", () => {
		resetNav();
		expect(liveDoc().pages["/Dashboard"]).toBeDefined();
	});

	it("leaves theme, header and access alone", () => {
		resetNav();
		expect(liveDoc().theme.enabled).toBe(true);
		expect(liveDoc().header?.title).toBe("Shop floor");
		expect(getAccess().adminHash).toBe("admin-hash");
	});
});

describe("resetHeader", () => {
	it("removes the header customisation entirely", () => {
		resetHeader();
		expect(liveDoc().header).toBeUndefined();
	});

	it("leaves theme and nav alone", () => {
		resetHeader();
		expect(liveDoc().theme.enabled).toBe(true);
		expect(liveDoc().nav.hidden).toEqual(["/Jobs"]);
	});
});

describe("resetAccess", () => {
	it("turns both tiers off and clears the password hashes", () => {
		resetAccess();
		const after = getAccess();
		expect(after.observerEnabled).toBe(false);
		expect(after.operatorEnabled).toBe(false);
		expect(after.adminHash).toBe("");
		expect(after.operatorHash).toBe("");
		expect(after.hideEmergencyStop).toBe(false);
	});

	it("leaves the layout document untouched", () => {
		resetAccess();
		expect(liveDoc().theme.enabled).toBe(true);
		expect(liveDoc().pages["/Dashboard"]).toBeDefined();
	});
});

describe("resetStartupRoutes", () => {
	it("clears both the startup and job-start routes", () => {
		resetStartupRoutes();
		expect(liveDoc().startupPath).toBeUndefined();
		expect(liveDoc().jobStartPath).toBeUndefined();
	});

	it("leaves nav and pages alone", () => {
		resetStartupRoutes();
		expect(liveDoc().nav.order).toEqual(["/Console", "/"]);
		expect(liveDoc().pages["/Dashboard"]).toBeDefined();
	});
});

describe("preference resets", () => {
	it("resetUpdatePrefs clears only the updateCheck keys", () => {
		resetUpdatePrefs();
		expect(window.localStorage.getItem("flexibleLayouts.updateCheck.enabled")).toBeNull();
		expect(window.localStorage.getItem("flexibleLayouts.updateCheck.dismissed")).toBeNull();
		expect(window.localStorage.getItem("flexibleLayouts.sdBackup.enabled")).toBe("0");
	});

	it("resetSdBackupPrefs clears only the sdBackup keys", () => {
		resetSdBackupPrefs();
		expect(window.localStorage.getItem("flexibleLayouts.sdBackup.enabled")).toBeNull();
		expect(window.localStorage.getItem("flexibleLayouts.updateCheck.enabled")).toBe("0");
	});

	it("resetFirmwareUpdatePrefs clears only the firmwareUpdateCheck keys", () => {
		resetFirmwareUpdatePrefs();
		expect(window.localStorage.getItem("flexibleLayouts.firmwareUpdateCheck.lastCheck.duet3d")).toBeNull();
		expect(window.localStorage.getItem("flexibleLayouts.sdBackup.enabled")).toBe("0");
		expect(window.localStorage.getItem("flexibleLayouts.updateCheck.enabled")).toBe("0");
	});
});

describe("resetSection dispatcher", () => {
	it("routes each section to its own reset and nothing else", () => {
		resetSection("theme");
		expect(liveDoc().theme.enabled).toBe(false);
		expect(liveDoc().nav.order).toEqual(["/Console", "/"]); // untouched by the theme reset

		resetSection("nav");
		expect(liveDoc().nav.order).toEqual([]);
	});
});
