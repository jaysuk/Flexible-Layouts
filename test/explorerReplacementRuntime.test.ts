import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXPLORER_PAGE } from "../src/model/builtinPages";
import { LAYOUT_ID } from "../src/model/constants";
import { setExplorerReplaceEnabled, setNewGcodeEditorEnabled } from "../src/model/editorPreference";
import { existingRoutePaths } from "../src/model/routeRecords";
import { explorerReplaced, layoutRouteApi, syncExplorerReplacement, type LayoutRouteApi } from "../src/page/explorerReplacement";

// This harness's localStorage is a stub with no working setItem; a scoped in-memory stand-in (as editorPreference.test.ts does).
let memory: Map<string, string>;
beforeEach(() => {
	memory = new Map();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => memory.get(k) ?? null,
		setItem: (k: string, v: string) => { memory.set(k, v); },
		removeItem: (k: string) => { memory.delete(k); },
	});
	explorerReplaced.value = false;
});
afterEach(() => {
	vi.unstubAllGlobals();
	delete (globalThis as { DWC?: unknown }).DWC;
});

function fakeApi() {
	const calls: Array<{ fn: string; layout: string; arg: unknown }> = [];
	const api: LayoutRouteApi = {
		addLayoutRoutes: (layout, routes) => { calls.push({ fn: "add", layout, arg: routes }); },
		removeLayoutRoutes: (layout, paths) => { calls.push({ fn: "remove", layout, arg: paths }); },
	};
	return { api, calls };
}
const wantReplacement = (on: boolean) => { setNewGcodeEditorEnabled(on); setExplorerReplaceEnabled(on); };
const EXPLORER_PATH = EXPLORER_PAGE.paths[0];
/** Pretend DWC has a record for only these paths (window.DWC.getPageComponent answers undefined for the rest). */
const dwcHasRecords = (...paths: Array<string>) => {
	(globalThis as { DWC?: unknown }).DWC = { getPageComponent: (p: string) => (paths.includes(p) ? {} : undefined) };
};

describe("layoutRouteApi (feature detection on window.DWC)", () => {
	it("is null on a DWC without the functions - including no DWC at all", () => {
		expect(layoutRouteApi()).toBeNull();
		(globalThis as { DWC?: unknown }).DWC = { registerLayout: () => undefined };
		expect(layoutRouteApi()).toBeNull();
	});

	it("needs both functions: one alone is not the API", () => {
		(globalThis as { DWC?: unknown }).DWC = { addLayoutRoutes: () => undefined };
		expect(layoutRouteApi()).toBeNull();
	});

	it("is found when DWC has both", () => {
		const { api } = fakeApi();
		(globalThis as { DWC?: unknown }).DWC = { ...api };
		expect(layoutRouteApi()).not.toBeNull();
	});
});

describe("existingRoutePaths", () => {
	it("keeps only the spellings DWC has a record for", () => {
		dwcHasRecords("/Explorer/:tab?/:volume?/:path*");
		expect(existingRoutePaths(EXPLORER_PAGE.paths)).toEqual(["/Explorer/:tab?/:volume?/:path*"]);
		dwcHasRecords("/Explorer/:tab?/:volume?/:path(.*)?");
		expect(existingRoutePaths(EXPLORER_PAGE.paths)).toEqual(["/Explorer/:tab?/:volume?/:path(.*)?"]);
	});

	it("returns every candidate when it cannot tell (no getPageComponent, or nothing resolves) - DWC then reports it as before", () => {
		expect(existingRoutePaths(EXPLORER_PAGE.paths)).toEqual([...EXPLORER_PAGE.paths]);
		dwcHasRecords();
		expect(existingRoutePaths(EXPLORER_PAGE.paths)).toEqual([...EXPLORER_PAGE.paths]);
	});
});

describe("syncExplorerReplacement", () => {
	it("overrides only the route pattern the running DWC has", () => {
		const { api, calls } = fakeApi();
		dwcHasRecords("/Explorer/:tab?/:volume?/:path*");
		wantReplacement(true);
		syncExplorerReplacement(api);
		expect(Object.keys(calls[0].arg as object)).toEqual(["/Explorer/:tab?/:volume?/:path*"]);
		wantReplacement(false);
		syncExplorerReplacement(api);
		expect(calls[1].arg).toEqual(["/Explorer/:tab?/:volume?/:path*"]);
	});

	it("installs the override for the Explorer's own route pattern, under FL's layout id, when it becomes wanted", () => {
		const { api, calls } = fakeApi();
		wantReplacement(true);
		expect(syncExplorerReplacement(api)).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].fn).toBe("add");
		expect(calls[0].layout).toBe(LAYOUT_ID);
		const routes = calls[0].arg as Record<string, unknown>;
		expect(Object.keys(routes)).toEqual([...EXPLORER_PAGE.paths]); // no getPageComponent here: every candidate
		expect(routes[EXPLORER_PATH]).toBeTruthy();
		expect(explorerReplaced.value).toBe(true);
	});

	it("removes exactly that path again when it is no longer wanted, handing the stock page (and its keep-alive) back", () => {
		const { api, calls } = fakeApi();
		wantReplacement(true);
		syncExplorerReplacement(api);
		wantReplacement(false);
		expect(syncExplorerReplacement(api)).toBe(true);
		expect(calls[1]).toEqual({ fn: "remove", layout: LAYOUT_ID, arg: [...EXPLORER_PAGE.paths] });
		expect(explorerReplaced.value).toBe(false);
	});

	it("does nothing when what is installed already matches the settings", () => {
		const { api, calls } = fakeApi();
		expect(syncExplorerReplacement(api)).toBe(true); // off and off
		wantReplacement(true);
		syncExplorerReplacement(api);
		syncExplorerReplacement(api); // on and on
		expect(calls).toHaveLength(1);
	});

	it("needs both the new editor and the replacement choice (turning the editor off drops the replacement)", () => {
		const { api, calls } = fakeApi();
		setExplorerReplaceEnabled(true); // editor still off: not wanted
		expect(syncExplorerReplacement(api)).toBe(true);
		expect(calls).toHaveLength(0);
		setNewGcodeEditorEnabled(true);
		syncExplorerReplacement(api);
		setNewGcodeEditorEnabled(false);
		syncExplorerReplacement(api);
		expect(calls.map((c) => c.fn)).toEqual(["add", "remove"]);
	});

	it("says a reload is needed, and changes nothing, on a DWC without the API (the behaviour before this existed)", () => {
		wantReplacement(true);
		expect(syncExplorerReplacement(null)).toBe(false);
		expect(explorerReplaced.value).toBe(false);
		// flipping back to what is installed needs no reload
		wantReplacement(false);
		expect(syncExplorerReplacement(null)).toBe(true);
	});

	it("uses window.DWC's functions by default", () => {
		const { api, calls } = fakeApi();
		(globalThis as { DWC?: unknown }).DWC = { ...api };
		wantReplacement(true);
		expect(syncExplorerReplacement()).toBe(true);
		expect(calls.map((c) => c.fn)).toEqual(["add"]);
	});

	it("treats a throwing DWC (the layout is not registered) as 'reload needed' and keeps its state", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const api: LayoutRouteApi = {
			addLayoutRoutes: () => { throw new Error("no layout with this id is registered"); },
			removeLayoutRoutes: () => undefined,
		};
		wantReplacement(true);
		expect(syncExplorerReplacement(api)).toBe(false);
		expect(explorerReplaced.value).toBe(false);
		expect(warn).toHaveBeenCalled();
	});
});
