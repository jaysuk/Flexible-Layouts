import { beforeEach, describe, expect, it } from "vitest";

import { isTrendTrackingEnabled, setTrendTrackingEnabled } from "../model/maintenance/historySettings";

// This test environment's window.localStorage has non-function methods - same quirk worked around in
// reminders.storage.test.ts; install a real working Storage so the module's real (non-fallback) path
// is what's actually under test here.
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
	Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
});

describe("isTrendTrackingEnabled", () => {
	it("defaults to true (on) when never configured", () => {
		expect(isTrendTrackingEnabled()).toBe(true);
	});

	it("is false after explicitly disabling", () => {
		setTrendTrackingEnabled(false);
		expect(isTrendTrackingEnabled()).toBe(false);
	});

	it("is true again after re-enabling", () => {
		setTrendTrackingEnabled(false);
		setTrendTrackingEnabled(true);
		expect(isTrendTrackingEnabled()).toBe(true);
	});
});
