import { describe, expect, it } from "vitest";

import type { MaintenanceEntry, MaintenanceLog } from "../model/maintenance/log";
import { evaluateRules, isDue } from "../model/reminders/dueRules";
import type { MaintenanceIntervalRule } from "../model/reminders/storage";

const entry = (over: Partial<MaintenanceEntry>): MaintenanceEntry => ({
	id: "e", loggedAt: 1, category: "c", note: "", spindleSecondsAtEntry: 0, jobSecondsAtEntry: null, ...over,
});
const log = (...entries: Array<MaintenanceEntry>): MaintenanceLog => ({ kind: "flexible-layouts-maintenance-log", schemaVersion: 1, entries });
const rule = (over: Partial<MaintenanceIntervalRule>): MaintenanceIntervalRule => ({
	id: "r", label: "r", counter: "spindleSeconds", intervalValue: 3600, enabled: true, ...over,
});
const model = (g: Record<string, unknown>) => ({ global: new Map(Object.entries(g)) });

describe("evaluateRules", () => {
	it("is live minus baseline against the interval", () => {
		const at = (live: number) => evaluateRules([rule({})], log(entry({ spindleSecondsAtEntry: 1000 })), model({ flMaintSpindleSec: live }))[0];
		expect(at(1000 + 100).status).toBe("ok");
		expect(at(1000 + 3300).status).toBe("dueSoon"); // past 90% of the interval
		expect(at(1000 + 3600).status).toBe("overdue");
		expect(at(1000 + 3600).delta).toBe(3600);
	});

	it("is 'unknown' - never overdue - with no baseline or no live value", () => {
		expect(evaluateRules([rule({})], log(), model({ flMaintSpindleSec: 999999 }))[0].status).toBe("unknown");
		expect(evaluateRules([rule({})], log(entry({ spindleSecondsAtEntry: 5 })), model({}))[0].status).toBe("unknown");
	});

	it("measures the newer counter kinds: an axis element and a user counter", () => {
		const m = model({ flMaintAxisMm: [0, 5000000], flMaintC1Sec: 7300 });
		const l = log(entry({ baselines: { "axisMm:1": 1000000, "custom:c1": 100 } }));
		const [axis, custom] = evaluateRules([
			rule({ id: "ax", counter: "axisMm:1", intervalValue: 4000000 }),
			rule({ id: "cu", counter: "custom:c1", intervalValue: 7200 }),
		], l, m);
		expect(axis).toMatchObject({ delta: 4000000, status: "overdue" });
		expect(custom).toMatchObject({ delta: 7200, status: "overdue" });
	});

	it("uses the entry that services THIS counter, so servicing one thing does not reset another", () => {
		const l = log(
			entry({ id: "all", loggedAt: 1, spindleSecondsAtEntry: 0, baselines: { "fanSec:0": 0 } }),
			entry({ id: "fanOnly", loggedAt: 2, spindleSecondsAtEntry: 9000, services: ["fanSec:0"], baselines: { "fanSec:0": 5000 } }),
		);
		const m = model({ flMaintSpindleSec: 9500, flMaintFanSec: [5100] });
		const [spindle, fan] = evaluateRules([rule({ id: "s", intervalValue: 9000 }), rule({ id: "f", counter: "fanSec:0", intervalValue: 100 })], l, m);
		expect(spindle.delta).toBe(9500); // still measured from the first entry
		expect(fan.delta).toBe(100); // measured from the fan-only entry
	});
});

describe("isDue", () => {
	it("is true for dueSoon and overdue only", () => {
		expect(["unknown", "ok", "dueSoon", "overdue"].map((s) => isDue(s as never))).toEqual([false, false, true, true]);
	});
});
