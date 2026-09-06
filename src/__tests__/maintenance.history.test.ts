import { describe, expect, it } from "vitest";

import {
	dailyDelta, dateKey, emptyMaintenanceHistory, MAX_HISTORY_DAYS, parseMaintenanceHistory,
	readMaintenanceHistory, recordDailySnapshot, withDailySnapshot, type DailySnapshot,
	type MaintenanceHistoryIO,
} from "../model/maintenance/history";

function snap(date: string, overrides: Partial<DailySnapshot> = {}): DailySnapshot {
	return {
		date, spindleSeconds: null, printSeconds: null, filamentMm: null, toolChanges: null,
		powerOnSeconds: null, jobsStarted: null, jobsFinished: null, jobsCancelled: null, ...overrides,
	};
}

// A fake card: in-memory single-file store, mirrors log.test.ts's own fakeIO() shape.
function fakeIO(seed?: string) {
	let file: string | undefined = seed;
	const fail = { read: false, write: false };
	const io: MaintenanceHistoryIO = {
		async read() {
			if (fail.read) { throw new Error("read failed"); }
			if (file === undefined) { throw new Error("not found"); }
			return file;
		},
		async write(text) {
			if (fail.write) { throw new Error("write failed"); }
			file = text;
		},
	};
	return { io, fail, getFile: () => file };
}

describe("dateKey", () => {
	it("formats a Date as YYYY-MM-DD in local time, zero-padded", () => {
		expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05"); // January (0-indexed) 5th
		expect(dateKey(new Date(2026, 10, 30))).toBe("2026-11-30");
	});
});

describe("parseMaintenanceHistory", () => {
	it("parses a valid history", () => {
		const history = emptyMaintenanceHistory();
		history.days.push(snap("2026-01-01", { printSeconds: 100 }));
		expect(parseMaintenanceHistory(JSON.stringify(history))).toEqual(history);
	});

	it("rejects invalid JSON", () => {
		expect(parseMaintenanceHistory("not json")).toBeNull();
	});

	it("rejects a JSON document that isn't this plugin's history format", () => {
		expect(parseMaintenanceHistory(JSON.stringify({ hello: "world" }))).toBeNull();
	});

	it("filters out malformed days rather than rejecting the whole history", () => {
		const raw = JSON.stringify({
			kind: "flexible-layouts-maintenance-history", schemaVersion: 1,
			days: [snap("2026-01-01"), { no: "date field" }],
		});
		const parsed = parseMaintenanceHistory(raw);
		expect(parsed?.days).toHaveLength(1);
	});
});

describe("withDailySnapshot", () => {
	it("appends a new day to an empty history", () => {
		const updated = withDailySnapshot(emptyMaintenanceHistory(), snap("2026-01-01", { printSeconds: 100 }));
		expect(updated?.days).toEqual([snap("2026-01-01", { printSeconds: 100 })]);
	});

	it("returns null (no write needed) when today's snapshot is unchanged from what's already stored", () => {
		const history = emptyMaintenanceHistory();
		history.days.push(snap("2026-01-01", { printSeconds: 100 }));
		expect(withDailySnapshot(history, snap("2026-01-01", { printSeconds: 100 }))).toBeNull();
	});

	it("REPLACES (not duplicates) an existing same-day entry when its values changed", () => {
		const history = emptyMaintenanceHistory();
		history.days.push(snap("2026-01-01", { printSeconds: 100 }));
		const updated = withDailySnapshot(history, snap("2026-01-01", { printSeconds: 200 }));
		expect(updated?.days).toHaveLength(1);
		expect(updated?.days[0].printSeconds).toBe(200);
	});

	it("keeps days sorted oldest-first regardless of insertion order", () => {
		const history = emptyMaintenanceHistory();
		history.days.push(snap("2026-01-03"));
		history.days.push(snap("2026-01-01"));
		const updated = withDailySnapshot(history, snap("2026-01-02"));
		expect(updated?.days.map((d) => d.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
	});

	it(`caps the ring at MAX_HISTORY_DAYS (${MAX_HISTORY_DAYS}), dropping the OLDEST day`, () => {
		let history = emptyMaintenanceHistory();
		for (let i = 0; i < MAX_HISTORY_DAYS; i++) {
			history = withDailySnapshot(history, snap(`2026-01-${String(i + 1).padStart(2, "0")}`))!;
		}
		expect(history.days).toHaveLength(MAX_HISTORY_DAYS);
		const overflowed = withDailySnapshot(history, snap("2026-02-15"))!;
		expect(overflowed.days).toHaveLength(MAX_HISTORY_DAYS);
		expect(overflowed.days[0].date).not.toBe("2026-01-01"); // the oldest day was dropped
		expect(overflowed.days[overflowed.days.length - 1].date).toBe("2026-02-15");
	});
});

describe("dailyDelta", () => {
	it("is null when there is no previous day to diff against", () => {
		expect(dailyDelta(snap("2026-01-02", { printSeconds: 100 }), undefined, "printSeconds")).toBeNull();
	});

	it("subtracts the previous day's value for consecutive calendar dates", () => {
		const prev = snap("2026-01-01", { printSeconds: 100 });
		const day = snap("2026-01-02", { printSeconds: 250 });
		expect(dailyDelta(day, prev, "printSeconds")).toBe(150);
	});

	it("is null across a gap (non-consecutive dates) - we don't know which day the delta happened on", () => {
		const prev = snap("2026-01-01", { printSeconds: 100 });
		const day = snap("2026-01-05", { printSeconds: 500 }); // 4-day gap in the ring
		expect(dailyDelta(day, prev, "printSeconds")).toBeNull();
	});

	it("is null when either day is missing that counter's value", () => {
		const prev = snap("2026-01-01", { printSeconds: null });
		const day = snap("2026-01-02", { printSeconds: 250 });
		expect(dailyDelta(day, prev, "printSeconds")).toBeNull();
	});

	it("clamps a negative delta to 0 (the underlying counter was reset between days)", () => {
		const prev = snap("2026-01-01", { printSeconds: 500 });
		const day = snap("2026-01-02", { printSeconds: 100 });
		expect(dailyDelta(day, prev, "printSeconds")).toBe(0);
	});
});

describe("readMaintenanceHistory", () => {
	it("returns an empty history when the file doesn't exist", async () => {
		const { io } = fakeIO();
		await expect(readMaintenanceHistory(io)).resolves.toEqual(emptyMaintenanceHistory());
	});

	it("returns an empty history (not a throw) when the read fails", async () => {
		const { io, fail } = fakeIO();
		fail.read = true;
		await expect(readMaintenanceHistory(io)).resolves.toEqual(emptyMaintenanceHistory());
	});
});

describe("recordDailySnapshot", () => {
	it("writes a new day's snapshot", async () => {
		const { io, getFile } = fakeIO();
		await expect(recordDailySnapshot(snap("2026-01-01", { printSeconds: 100 }), io)).resolves.toBe(true);
		const written = parseMaintenanceHistory(getFile()!);
		expect(written?.days).toHaveLength(1);
	});

	it("is a no-op (true, no write) when today's snapshot is already up to date", async () => {
		const existing = emptyMaintenanceHistory();
		existing.days.push(snap("2026-01-01", { printSeconds: 100 }));
		const { io, getFile } = fakeIO(JSON.stringify(existing));
		const before = getFile();
		await expect(recordDailySnapshot(snap("2026-01-01", { printSeconds: 100 }), io)).resolves.toBe(true);
		expect(getFile()).toBe(before); // untouched - no write happened
	});

	it("reports failure (not a throw) if the write fails, without surfacing as a hard error", async () => {
		const { io, fail } = fakeIO();
		fail.write = true;
		await expect(recordDailySnapshot(snap("2026-01-01", { printSeconds: 100 }), io)).resolves.toBe(false);
	});
});
