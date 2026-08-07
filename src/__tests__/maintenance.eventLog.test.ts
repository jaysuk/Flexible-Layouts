import { describe, expect, it } from "vitest";

import { countJobEvents, parseEventLog, totalJobSeconds } from "../model/maintenance/eventLog";

describe("parseEventLog", () => {
	it("parses a finished-job line with a duration", () => {
		const events = parseEventLog("2024-01-01 12:34:56 [warn] Print finished, print time was 2h 15m\n");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ finished: true, cancelled: false, printMinutes: 135 });
		expect(events[0].date.toISOString()).toBe("2024-01-01T12:34:56.000Z");
	});

	it("parses a cancelled-job line", () => {
		const events = parseEventLog("2024-01-02 08:00:00 [warn] Print cancelled, print time was 0h 48m\n");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({ finished: false, cancelled: true, printMinutes: 48 });
	});

	it("ignores power-up lines entirely", () => {
		const events = parseEventLog("2024-01-01 00:00:00 Power up\n2024-01-01 00:00:01 [warn] Print finished, print time was 0h 1m\n");
		expect(events).toHaveLength(1);
	});

	it("ignores [warn] lines that aren't finished/cancelled", () => {
		const events = parseEventLog("2024-01-01 00:00:00 [warn] Some other warning\n");
		expect(events).toHaveLength(0);
	});

	it("ignores non-[warn] lines even if they mention finished", () => {
		const events = parseEventLog("2024-01-01 00:00:00 [info] not a warn line, finished\n");
		expect(events).toHaveLength(0);
	});

	it("reuses the last-seen date for a line with no date of its own", () => {
		const events = parseEventLog(
			"2024-01-01 10:00:00 [warn] Print finished, print time was 1h 0m\n"
			+ "[warn] Print finished, print time was 0h 30m\n",
		);
		expect(events).toHaveLength(2);
		expect(events[1].date.toISOString().slice(0, 10)).toBe("2024-01-01");
	});

	it("is null-duration-safe for a cancelled line with no print-time substring", () => {
		const events = parseEventLog("2024-01-01 00:00:00 [warn] Print cancelled\n");
		expect(events[0].printMinutes).toBeNull();
	});

	it("never throws on garbage input", () => {
		expect(() => parseEventLog("\0\0\0not even close to a log line")).not.toThrow();
		expect(parseEventLog("")).toEqual([]);
	});
});

describe("totalJobSeconds / countJobEvents", () => {
	const events = parseEventLog(
		"2024-01-01 00:00:00 [warn] Print finished, print time was 1h 0m\n"
		+ "2024-01-01 01:00:00 [warn] Print cancelled, print time was 0h 30m\n"
		+ "2024-01-01 02:00:00 [warn] Print cancelled\n", // no duration - contributes 0, not NaN
	);

	it("sums finished AND cancelled job durations (a cancelled job still ran the machine)", () => {
		expect(totalJobSeconds(events)).toBe(3600 + 1800);
	});

	it("counts finished vs cancelled separately", () => {
		expect(countJobEvents(events)).toEqual({ finished: 1, cancelled: 2 });
	});
});
