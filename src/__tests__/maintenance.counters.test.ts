import { describe, expect, it } from "vitest";

import {
	counterCatalogue, counterExpression, counterTitle, counterUnit, customCounterGlobalName, formatCounterAmount,
	intervalFromInput, intervalToInput, isCounterKey, liveCounterValue, MAINTENANCE_MAX_TRACKED_AXES, parseCounterKey,
	snapshotExtraBaselines,
} from "../model/maintenance/counters";
import { baselineForCounter, mostRecentEntryForCounter, type MaintenanceEntry, type MaintenanceLog } from "../model/maintenance/log";

// A translate stub that echoes the key and params, so a test can see WHICH string was asked for.
const t = (key: string, params?: Record<string, unknown>): string => `${key.replace("plugins.flexibleLayouts.maintenance.", "")}${params ? JSON.stringify(params) : ""}`;

describe("parseCounterKey", () => {
	it("accepts the fixed names, indexed elements and custom ids", () => {
		expect(parseCounterKey("spindleSeconds")).toEqual({ kind: "static", key: "spindleSeconds" });
		expect(parseCounterKey("axisMm:2")).toEqual({ kind: "indexed", family: "axisMm", index: 2 });
		expect(parseCounterKey("heaterFullSec:11")).toEqual({ kind: "indexed", family: "heaterFullSec", index: 11 });
		expect(parseCounterKey("custom:c3")).toEqual({ kind: "custom", id: "c3" });
	});

	it("rejects anything that could not name a real global", () => {
		for (const bad of ["", "nope", "axisMm", "axisMm:", "axisMm:-1", "axisMm:x", `axisMm:${MAINTENANCE_MAX_TRACKED_AXES}`,
			"fanSec:12", "custom:", "custom:C1", "custom:1a", "custom:a b", "custom:a;b", "toString", "__proto__", "constructor"]) {
			expect(parseCounterKey(bad), bad).toBeNull();
			expect(isCounterKey(bad), bad).toBe(false);
		}
	});
});

describe("counterExpression / counterUnit", () => {
	it("maps every kind to the RRF/object-model expression that reads it", () => {
		expect(counterExpression("powerOnSeconds")).toBe("global.flMaintPowerOnSec");
		expect(counterExpression("axisMm:2")).toBe("global.flMaintAxisMm[2]");
		expect(counterExpression("heaterSec:0")).toBe("global.flMaintHeaterSec[0]");
		expect(counterExpression("custom:c1")).toBe("global.flMaintC1Sec");
		expect(counterExpression("bogus")).toBeNull();
	});

	it("derives the global name of a custom counter from its id", () => {
		expect(customCounterGlobalName("c1")).toBe("flMaintC1Sec");
		expect(customCounterGlobalName("c12")).toBe("flMaintC12Sec");
	});

	it("knows each counter's unit", () => {
		expect(counterUnit("printSeconds")).toBe("seconds");
		expect(counterUnit("filamentMm")).toBe("mm");
		expect(counterUnit("axisMm:0")).toBe("mm");
		expect(counterUnit("fanSec:1")).toBe("seconds");
		expect(counterUnit("custom:c1")).toBe("seconds");
		expect(counterUnit("toolChanges")).toBe("count");
		expect(counterUnit("jobsFinished")).toBe("count");
	});
});

describe("interval conversion", () => {
	// The old input said "(seconds/mm/count)": typing 50 for "50 hours" stored 50 SECONDS.
	it("converts what a person types (hours / metres / count) to the stored unit and back", () => {
		expect(intervalFromInput("spindleSeconds", 50)).toBe(180000);
		expect(intervalFromInput("filamentMm", 2.5)).toBe(2500);
		expect(intervalFromInput("axisMm:0", 1000)).toBe(1000000);
		expect(intervalFromInput("toolChanges", 100)).toBe(100);
		expect(intervalToInput("spindleSeconds", 180000)).toBe(50);
		expect(intervalToInput("filamentMm", 2500)).toBe(2.5);
	});
});

describe("formatCounterAmount", () => {
	it("shows hours, metres or a plain count", () => {
		expect(formatCounterAmount("printSeconds", 5400)).toBe("1.5h");
		expect(formatCounterAmount("axisMm:1", 12500)).toBe("12.5 m");
		expect(formatCounterAmount("jobsFinished", 7)).toBe("7");
	});
});

describe("liveCounterValue", () => {
	const model = { global: new Map<string, unknown>([["flMaintAxisMm", [10, 20, 30]], ["flMaintPowerOnSec", 3600], ["flMaintC1Sec", 90]]) };

	it("reads scalars, array elements and custom counters off the model", () => {
		expect(liveCounterValue(model, "powerOnSeconds")).toBe(3600);
		expect(liveCounterValue(model, "axisMm:1")).toBe(20);
		expect(liveCounterValue(model, "custom:c1")).toBe(90);
	});

	it("is null - never 0 - when the machine does not report it", () => {
		expect(liveCounterValue(model, "printSeconds")).toBeNull();
		expect(liveCounterValue(model, "axisMm:5")).toBeNull();
		expect(liveCounterValue(model, "custom:c9")).toBeNull();
		expect(liveCounterValue(model, "nonsense")).toBeNull();
		expect(liveCounterValue({}, "axisMm:0")).toBeNull();
	});
});

describe("counterCatalogue", () => {
	const model = {
		move: { axes: [{ letter: "X" }, { letter: "Y" }, { letter: "Z" }] },
		fans: [{ actualValue: 0 }, null, { actualValue: 0 }],
		heat: { heaters: [{}, null, {}] },
	};

	it("offers FFF counters on an FFF machine and spindle ones otherwise, plus the shared ones", () => {
		const fff = counterCatalogue(model, t, { isFff: true }).map((c) => c.key);
		expect(fff).toEqual(expect.arrayContaining(["printSeconds", "filamentMm", "toolChanges", "filamentErrors", "powerOnSeconds", "jobsFinished"]));
		expect(fff).not.toContain("spindleSeconds");
		const cnc = counterCatalogue(model, t, { isFff: false }).map((c) => c.key);
		expect(cnc).toContain("spindleSeconds");
		expect(cnc).not.toContain("filamentMm");
	});

	it("builds per-axis, per-fan and per-heater entries from the machine's own config, skipping empty slots", () => {
		const keys = counterCatalogue(model, t, { isFff: true }).map((c) => c.key);
		expect(keys).toEqual(expect.arrayContaining(["axisMm:0", "axisMm:1", "axisMm:2"]));
		expect(keys).not.toContain("axisMm:3");
		expect(keys).toEqual(expect.arrayContaining(["fanSec:0", "fanSec:2"]));
		expect(keys).not.toContain("fanSec:1");
		expect(keys).toEqual(expect.arrayContaining(["heaterSec:0", "heaterFullSec:0", "heaterSec:2", "heaterFullSec:2"]));
		expect(keys).not.toContain("heaterSec:1");
	});

	it("labels an axis with its letter and includes user counters by title", () => {
		const cat = counterCatalogue(model, t, { isFff: true, customCounters: [{ id: "c1", title: "Tool 1 active" }] });
		expect(cat.find((c) => c.key === "axisMm:2")?.title).toContain('"axis":"Z"');
		expect(cat.find((c) => c.key === "custom:c1")?.title).toBe("Tool 1 active");
	});

	it("never offers more elements than the tracking arrays hold", () => {
		const big = { move: { axes: Array.from({ length: 20 }, (_, i) => ({ letter: String(i) })) } };
		const axisKeys = counterCatalogue(big, t, { isFff: true }).map((c) => c.key).filter((k) => k.startsWith("axisMm:"));
		expect(axisKeys).toHaveLength(MAINTENANCE_MAX_TRACKED_AXES);
	});
});

describe("counterTitle", () => {
	it("falls back to the raw key for something the machine no longer reports", () => {
		expect(counterTitle("custom:c9", {}, t, [])).toBe("custom:c9");
		expect(counterTitle("garbage", {}, t)).toBe("garbage");
	});
});

describe("snapshotExtraBaselines", () => {
	it("records only the counters that are actually reported, including array elements and user counters", () => {
		const model = { global: new Map<string, unknown>([
			["flMaintPowerOnSec", 100], ["flMaintJobsFinished", 4], ["flMaintAxisMm", [5, 6]], ["flMaintC2Sec", 77],
			["flMaintPrintSec", 999], // a legacy counter: has its own *AtEntry field, so is NOT duplicated here
		]) };
		expect(snapshotExtraBaselines(model, ["c2", "c3"])).toEqual({
			powerOnSeconds: 100, jobsFinished: 4, "axisMm:0": 5, "axisMm:1": 6, "custom:c2": 77,
		});
	});

	it("is empty when nothing is reported", () => {
		expect(snapshotExtraBaselines({})).toEqual({});
	});
});

describe("baselines in the log", () => {
	const entry = (over: Partial<MaintenanceEntry>): MaintenanceEntry => ({
		id: "e", loggedAt: 1, category: "x", note: "", spindleSecondsAtEntry: 10, jobSecondsAtEntry: null, ...over,
	});

	it("reads a new counter's baseline from `baselines`, and keeps the legacy fields working", () => {
		const e = entry({ printSecondsAtEntry: 50, baselines: { "axisMm:1": 123, "custom:c1": 9 } });
		expect(baselineForCounter(e, "spindleSeconds")).toBe(10);
		expect(baselineForCounter(e, "printSeconds")).toBe(50);
		expect(baselineForCounter(e, "axisMm:1")).toBe(123);
		expect(baselineForCounter(e, "custom:c1")).toBe(9);
	});

	it("reads an entry that predates the counter as unknown (null), never 0", () => {
		expect(baselineForCounter(entry({}), "axisMm:1")).toBeNull();
		expect(baselineForCounter(entry({ baselines: { "axisMm:0": 1 } }), "axisMm:1")).toBeNull();
		expect(baselineForCounter(entry({ baselines: { "axisMm:1": Number.NaN } }), "axisMm:1")).toBeNull();
	});

	it("lets an entry that names its `services` reset only those counters, new kinds included", () => {
		const log: MaintenanceLog = {
			kind: "flexible-layouts-maintenance-log", schemaVersion: 1,
			entries: [
				entry({ id: "old", loggedAt: 1 }),
				entry({ id: "fan", loggedAt: 2, services: ["fanSec:0"], baselines: { "fanSec:0": 40 } }),
			],
		};
		expect(mostRecentEntryForCounter(log, "fanSec:0")?.id).toBe("fan");
		// An entry that services only the fan leaves every other counter's baseline where it was.
		expect(mostRecentEntryForCounter(log, "axisMm:0")?.id).toBe("old");
		expect(mostRecentEntryForCounter(log, "custom:c1")?.id).toBe("old");
	});
});
