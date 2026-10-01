import { describe, expect, it } from "vitest";

import {
	countReachedPluginTimers, formatPluginMinutes, MAINTENANCE_TIMERS_RESET_PATH, pluginTimerReached, readPluginTimers,
	resetPluginTimer, type PluginTimer,
} from "../model/maintenance/pluginTimers";

/** DWC's `plugins` is a Map, and a plugin's `data` is a Map too (PluginManifest.data: Map<string, any>). */
function modelWith(timers: unknown, opts: { dataAsObject?: boolean } = {}) {
	const data = opts.dataAsObject ? { timers } : new Map<string, unknown>([["timers", timers]]);
	return { plugins: new Map<string, unknown>([["MaintenanceTimers", { id: "MaintenanceTimers", data }]]) };
}

const camel = { name: "nozzle", title: "Replace nozzle", initialValue: 0, value: 90, conditions: ["state.status == \"processing\""], thresholdValue: 600, action: "M291 P\"x\"", canReset: true };
const pascal = { Name: "belt", Title: "Check belts", InitialValue: 100, Value: 40, Conditions: [], ThresholdValue: 0, Action: "", CanReset: false };

describe("readPluginTimers", () => {
	it("is null when the plugin is not installed, so everything can hide", () => {
		expect(readPluginTimers({ plugins: new Map() })).toBeNull();
		expect(readPluginTimers({})).toBeNull();
	});

	it("is an empty list when the plugin is installed but publishes nothing usable", () => {
		expect(readPluginTimers({ plugins: new Map([["MaintenanceTimers", { data: new Map() }]]) })).toEqual([]);
		expect(readPluginTimers(modelWith("not an array"))).toEqual([]);
	});

	it("reads the documented camelCase shape", () => {
		expect(readPluginTimers(modelWith([camel]))).toEqual<Array<PluginTimer>>([{
			name: "nozzle", title: "Replace nozzle", value: 90, initialValue: 0, thresholdValue: 600,
			action: 'M291 P"x"', conditions: ['state.status == "processing"'], canReset: true,
		}]);
	});

	it("also reads PascalCase - the plugin's source sets no naming policy, so either is possible", () => {
		expect(readPluginTimers(modelWith([pascal]))?.[0]).toMatchObject({
			name: "belt", title: "Check belts", value: 40, initialValue: 100, thresholdValue: 0, canReset: false,
		});
	});

	it("works when `data` is a plain object too", () => {
		expect(readPluginTimers(modelWith([camel], { dataAsObject: true }))).toHaveLength(1);
	});

	it("skips entries without a name, and defaults what is missing the way the plugin's own class does", () => {
		const out = readPluginTimers(modelWith([{ title: "no name" }, null, 5, { name: "bare" }]));
		expect(out).toEqual([{ name: "bare", title: "bare", value: 0, initialValue: 0, thresholdValue: -1, action: "", conditions: [], canReset: true }]);
	});
});

describe("pluginTimerReached", () => {
	const t = (over: Partial<PluginTimer>): PluginTimer => ({ name: "n", title: "n", value: 0, initialValue: 0, thresholdValue: -1, action: "", conditions: [], canReset: true, ...over });

	it("a count-up timer has reached its threshold at or above it", () => {
		expect(pluginTimerReached(t({ value: 599, thresholdValue: 600 }))).toBe(false);
		expect(pluginTimerReached(t({ value: 600, thresholdValue: 600 }))).toBe(true);
		expect(pluginTimerReached(t({ value: 900, thresholdValue: 600 }))).toBe(true);
	});

	it("a count-down timer has reached it at or below it (it stops at 0)", () => {
		expect(pluginTimerReached(t({ initialValue: 100, value: 1, thresholdValue: 0 }))).toBe(false);
		expect(pluginTimerReached(t({ initialValue: 100, value: 0, thresholdValue: 0 }))).toBe(true);
	});

	it("a timer with no threshold (-1) never reaches anything", () => {
		expect(pluginTimerReached(t({ value: 99999, thresholdValue: -1 }))).toBe(false);
	});

	it("counts the reached ones across a model", () => {
		expect(countReachedPluginTimers(modelWith([{ ...camel, value: 700 }, { ...camel, name: "b", value: 1 }]))).toBe(1);
		expect(countReachedPluginTimers({})).toBe(0);
	});
});

describe("formatPluginMinutes", () => {
	it("shows minutes under an hour and hours above", () => {
		expect(formatPluginMinutes(40)).toBe("40 min");
		expect(formatPluginMinutes(95)).toBe("1.6h");
		expect(formatPluginMinutes(0)).toBe("0 min");
	});
});

describe("resetPluginTimer", () => {
	it("PUTs the plugin's reset endpoint with the timer name", async () => {
		const calls: Array<unknown[]> = [];
		const ok = await resetPluginTimer(async (...args) => { calls.push(args); return null; }, "nozzle");
		expect(ok).toBe(true);
		expect(calls).toEqual([["PUT", MAINTENANCE_TIMERS_RESET_PATH, { timerName: "nozzle" }, ""]]);
		expect(MAINTENANCE_TIMERS_RESET_PATH).toBe("machine/MaintenanceTimers/Reset");
	});

	it("is false - never a throw - when the plugin refuses (403 for canReset=false) or is unreachable", async () => {
		expect(await resetPluginTimer(async () => { throw new Error("403"); }, "belt")).toBe(false);
	});
});
