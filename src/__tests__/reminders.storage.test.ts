import { beforeEach, describe, expect, it } from "vitest";

import { getIntervalRules, newRuleId, setIntervalRules, type MaintenanceIntervalRule } from "../model/reminders/storage";

// This test environment's window.localStorage has non-function methods (the same quirk
// configBackup/credentials.ts and reset.scoped.test.ts's own memoryStorage() both work around) - the
// module under test already degrades to an internal in-memory fallback when that happens, so without
// a REAL working Storage here the tests below would be silently exercising that fallback instead of
// the window.localStorage path production code actually uses. Install one, matching
// reset.scoped.test.ts's exact pattern.
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

function rule(overrides: Partial<MaintenanceIntervalRule> = {}): MaintenanceIntervalRule {
	return { id: "1", label: "Grease the ways", counter: "spindleSeconds", intervalValue: 100, enabled: true, ...overrides };
}

describe("getIntervalRules / setIntervalRules", () => {
	it("returns an empty array when nothing has been configured yet", () => {
		expect(getIntervalRules()).toEqual([]);
	});

	it("round-trips a written set of rules", () => {
		setIntervalRules([rule()]);
		expect(getIntervalRules()).toEqual([rule()]);
	});

	it("filters out malformed entries rather than rejecting the whole list", () => {
		window.localStorage.setItem("flexibleLayouts.maintenanceReminders.rules", JSON.stringify([rule(), { missing: "fields" }]));
		expect(getIntervalRules()).toEqual([rule()]);
	});

	it("returns an empty array (not a throw) for corrupt JSON", () => {
		window.localStorage.setItem("flexibleLayouts.maintenanceReminders.rules", "{ not valid json");
		expect(getIntervalRules()).toEqual([]);
	});

	it("returns an empty array (not a throw) when the stored value isn't an array", () => {
		window.localStorage.setItem("flexibleLayouts.maintenanceReminders.rules", JSON.stringify({ not: "an array" }));
		expect(getIntervalRules()).toEqual([]);
	});
});

describe("newRuleId", () => {
	it("generates a non-empty, unique id on each call", () => {
		const a = newRuleId();
		const b = newRuleId();
		expect(a).toBeTruthy();
		expect(a).not.toBe(b);
	});
});
