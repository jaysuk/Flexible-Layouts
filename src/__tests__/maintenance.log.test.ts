import { describe, expect, it } from "vitest";

import {
	appendMaintenanceEntry, baselineForCounter, checkLogIntegrity, emptyMaintenanceLog, maintenanceLogToCsv,
	mostRecentEntry, mostRecentEntryForCounter, parseMaintenanceLog, readMaintenanceLog,
	readMaintenanceLogWithIntegrity, secondsSince, type MaintenanceIO, type MaintenanceLog,
} from "../model/maintenance/log";

// A fake card: an in-memory single-file store, plus a per-op failure switch - mirrors sdBackup's own
// fakeIO() shape, scaled down to this module's simpler read/write-only MaintenanceIO.
function fakeIO(seed?: string) {
	let file: string | undefined = seed;
	const fail = { read: false, write: false };
	const io: MaintenanceIO = {
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

describe("parseMaintenanceLog", () => {
	it("parses a valid log", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "collet", note: "changed", spindleSecondsAtEntry: 100, jobSecondsAtEntry: 50 });
		expect(parseMaintenanceLog(JSON.stringify(log))).toEqual(log);
	});

	it("rejects invalid JSON", () => {
		expect(parseMaintenanceLog("not json")).toBeNull();
	});

	it("rejects a JSON document that isn't this plugin's log format", () => {
		expect(parseMaintenanceLog(JSON.stringify({ hello: "world" }))).toBeNull();
	});

	it("filters out malformed entries rather than rejecting the whole log", () => {
		const raw = JSON.stringify({
			kind: "flexible-layouts-maintenance-log", schemaVersion: 1,
			entries: [
				{ id: "1", loggedAt: 1000, category: "collet", note: "ok", spindleSecondsAtEntry: null, jobSecondsAtEntry: null },
				{ note: "missing id/loggedAt" },
			],
		});
		const parsed = parseMaintenanceLog(raw);
		expect(parsed?.entries).toHaveLength(1);
		expect(parsed?.entries[0].id).toBe("1");
	});
});

describe("readMaintenanceLog", () => {
	it("returns an empty log when the file doesn't exist", async () => {
		const { io } = fakeIO();
		await expect(readMaintenanceLog(io)).resolves.toEqual(emptyMaintenanceLog());
	});

	it("returns an empty log (not a throw) when the read fails", async () => {
		const { io, fail } = fakeIO();
		fail.read = true;
		await expect(readMaintenanceLog(io)).resolves.toEqual(emptyMaintenanceLog());
	});

	it("returns an empty log (not a throw) for corrupt content", async () => {
		const { io } = fakeIO("{ not valid json");
		await expect(readMaintenanceLog(io)).resolves.toEqual(emptyMaintenanceLog());
	});
});

describe("appendMaintenanceEntry", () => {
	it("appends to an empty/nonexistent log and persists it", async () => {
		const { io, getFile } = fakeIO();
		const result = await appendMaintenanceEntry(
			{ loggedAt: 1000, category: "collet", note: "changed collet", spindleSecondsAtEntry: 100, jobSecondsAtEntry: 50 }, io,
		);
		expect(result).toBe("written");
		const written = parseMaintenanceLog(getFile()!);
		expect(written?.entries).toHaveLength(1);
		expect(written?.entries[0]).toMatchObject({ category: "collet", note: "changed collet" });
		expect(written?.entries[0].id).toBeTruthy();
	});

	it("preserves existing entries when appending (never overwrites the whole log)", async () => {
		const existing = emptyMaintenanceLog();
		existing.entries.push({ id: "old", loggedAt: 500, category: "belt", note: "tensioned", spindleSecondsAtEntry: 10, jobSecondsAtEntry: 5 });
		const { io, getFile } = fakeIO(JSON.stringify(existing));
		await appendMaintenanceEntry({ loggedAt: 1000, category: "collet", note: "changed", spindleSecondsAtEntry: 100, jobSecondsAtEntry: 50 }, io);
		const written = parseMaintenanceLog(getFile()!);
		expect(written?.entries).toHaveLength(2);
		expect(written?.entries[0].id).toBe("old");
	});

	it("reports failure (not a throw) if the write fails", async () => {
		const { io, fail } = fakeIO();
		fail.write = true;
		await expect(appendMaintenanceEntry({ loggedAt: 1, category: "x", note: "y", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io))
			.resolves.toBe("failed");
	});
});

describe("mostRecentEntry", () => {
	it("returns the newest entry for a category", () => {
		const log = emptyMaintenanceLog();
		log.entries.push(
			{ id: "1", loggedAt: 1000, category: "collet", note: "a", spindleSecondsAtEntry: 100, jobSecondsAtEntry: null },
			{ id: "2", loggedAt: 3000, category: "collet", note: "b", spindleSecondsAtEntry: 300, jobSecondsAtEntry: null },
			{ id: "3", loggedAt: 2000, category: "collet", note: "c", spindleSecondsAtEntry: 200, jobSecondsAtEntry: null },
		);
		expect(mostRecentEntry(log, "collet")?.id).toBe("2");
	});

	it("ignores entries from other categories", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "belt", note: "a", spindleSecondsAtEntry: 100, jobSecondsAtEntry: null });
		expect(mostRecentEntry(log, "collet")).toBeNull();
	});

	it("returns null for an empty log", () => {
		expect(mostRecentEntry(emptyMaintenanceLog(), "collet")).toBeNull();
	});
});

describe("secondsSince", () => {
	it("subtracts the baseline from the live total", () => {
		expect(secondsSince(500, 200)).toBe(300);
	});

	it("clamps to 0 rather than going negative (e.g. the counter was reset since the baseline was taken)", () => {
		expect(secondsSince(100, 200)).toBe(0);
	});

	it("is null when the live total is unknown", () => {
		expect(secondsSince(null, 200)).toBeNull();
	});

	it("is null when the baseline is unknown (was logged while offline)", () => {
		expect(secondsSince(500, null)).toBeNull();
	});
});

// --- Item D: per-counter service baselines ------------------------------------------------------
describe("mostRecentEntryForCounter", () => {
	it("treats an entry with no `services` field as servicing EVERY counter (backward compatible)", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "collet", note: "a", spindleSecondsAtEntry: 100, jobSecondsAtEntry: null });
		expect(mostRecentEntryForCounter(log, "spindleSeconds")?.id).toBe("1");
		expect(mostRecentEntryForCounter(log, "printSeconds")?.id).toBe("1");
		expect(mostRecentEntryForCounter(log, "filamentMm")?.id).toBe("1");
		expect(mostRecentEntryForCounter(log, "toolChanges")?.id).toBe("1");
	});

	it("treats an explicit empty `services` array the same as absent - services everything", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "custom", note: "a", spindleSecondsAtEntry: null, jobSecondsAtEntry: null, services: [] });
		expect(mostRecentEntryForCounter(log, "toolChanges")?.id).toBe("1");
	});

	it("narrows to only the named counters when `services` is non-empty", () => {
		const log = emptyMaintenanceLog();
		log.entries.push(
			{ id: "wide", loggedAt: 1000, category: "custom", note: "resets all", spindleSecondsAtEntry: 10, jobSecondsAtEntry: null },
			{ id: "narrow", loggedAt: 2000, category: "collet", note: "tool only", spindleSecondsAtEntry: 20, jobSecondsAtEntry: null, services: ["toolChanges"] },
		);
		// The newer entry only services toolChanges, so it must NOT shadow the older entry for
		// spindleSeconds - this is the exact bug Item D exists to fix.
		expect(mostRecentEntryForCounter(log, "toolChanges")?.id).toBe("narrow");
		expect(mostRecentEntryForCounter(log, "spindleSeconds")?.id).toBe("wide");
	});

	it("returns null when nothing has ever serviced that counter", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "collet", note: "a", spindleSecondsAtEntry: 10, jobSecondsAtEntry: null, services: ["toolChanges"] });
		expect(mostRecentEntryForCounter(log, "filamentMm")).toBeNull();
	});
});

describe("baselineForCounter", () => {
	it("reads the matching *AtEntry field for each known counter key", () => {
		const entry = {
			id: "1", loggedAt: 1, category: "c", note: "",
			spindleSecondsAtEntry: 1, jobSecondsAtEntry: null,
			printSecondsAtEntry: 2, filamentMmAtEntry: 3, toolChangesAtEntry: 4,
		};
		expect(baselineForCounter(entry, "spindleSeconds")).toBe(1);
		expect(baselineForCounter(entry, "printSeconds")).toBe(2);
		expect(baselineForCounter(entry, "filamentMm")).toBe(3);
		expect(baselineForCounter(entry, "toolChanges")).toBe(4);
	});

	it("returns null for an optional field the entry predates, not undefined", () => {
		const entry = { id: "1", loggedAt: 1, category: "c", note: "", spindleSecondsAtEntry: null, jobSecondsAtEntry: null };
		expect(baselineForCounter(entry, "printSeconds")).toBeNull();
	});
});

// --- Item F: write integrity ---------------------------------------------------------------------
describe("checkLogIntegrity", () => {
	it("is 'none' for a log with no checksum at all (predates this feature)", () => {
		expect(checkLogIntegrity(emptyMaintenanceLog())).toBe("none");
	});

	it("is 'ok' for a log whose checksum matches a fresh write", async () => {
		const { io, getFile } = fakeIO();
		await appendMaintenanceEntry({ loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io);
		const written = parseMaintenanceLog(getFile()!)!;
		expect(checkLogIntegrity(written)).toBe("ok");
	});

	it("is 'mismatch' when the checksum doesn't match the entries (simulated corruption)", () => {
		const log: MaintenanceLog = { ...emptyMaintenanceLog(), checksum: "deadbeef" };
		log.entries.push({ id: "1", loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		expect(checkLogIntegrity(log)).toBe("mismatch");
	});
});

describe("readMaintenanceLogWithIntegrity", () => {
	it("reports 'ok' for a log written by appendMaintenanceEntry", async () => {
		const { io } = fakeIO();
		await appendMaintenanceEntry({ loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io);
		await expect(readMaintenanceLogWithIntegrity(io)).resolves.toMatchObject({ integrity: "ok" });
	});

	it("reports 'none' for a log with no checksum field", async () => {
		const legacy = emptyMaintenanceLog();
		legacy.entries.push({ id: "1", loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		const { io } = fakeIO(JSON.stringify(legacy));
		await expect(readMaintenanceLogWithIntegrity(io)).resolves.toMatchObject({ integrity: "none" });
	});

	it("reports 'mismatch' for a corrupted checksum without discarding the entries", async () => {
		const corrupt: MaintenanceLog = { ...emptyMaintenanceLog(), checksum: "deadbeef" };
		corrupt.entries.push({ id: "1", loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		const { io } = fakeIO(JSON.stringify(corrupt));
		const result = await readMaintenanceLogWithIntegrity(io);
		expect(result.integrity).toBe("mismatch");
		expect(result.log.entries).toHaveLength(1); // still readable, just flagged
	});

	it("readMaintenanceLog (the plain variant) still just returns the log, integrity and all quietly discarded", async () => {
		const { io } = fakeIO();
		await appendMaintenanceEntry({ loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io);
		const log = await readMaintenanceLog(io);
		expect(log.entries).toHaveLength(1);
	});
});

describe("appendMaintenanceEntry - write integrity", () => {
	it("computes and writes a checksum over the entries", async () => {
		const { io, getFile } = fakeIO();
		await appendMaintenanceEntry({ loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io);
		const written = parseMaintenanceLog(getFile()!);
		expect(written?.checksum).toBeTruthy();
		expect(checkLogIntegrity(written!)).toBe("ok");
	});

	it("refuses to write ('blocked') when the existing file's checksum already doesn't match", async () => {
		const corrupt: MaintenanceLog = { ...emptyMaintenanceLog(), checksum: "deadbeef" };
		corrupt.entries.push({ id: "old", loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		const { io, getFile } = fakeIO(JSON.stringify(corrupt));
		const result = await appendMaintenanceEntry({ loggedAt: 2, category: "c", note: "new", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io);
		expect(result).toBe("blocked");
		// The file on "disk" must be untouched - a blocked write must never overwrite the evidence.
		expect(getFile()).toBe(JSON.stringify(corrupt));
	});

	it("reports 'failed' (not 'written') when the post-write read-back doesn't match what was written", async () => {
		const io: MaintenanceIO = {
			async read() { return JSON.stringify(emptyMaintenanceLog()); }, // always looks empty, even after "writing"
			async write() { /* pretend to succeed but don't actually persist */ },
		};
		await expect(appendMaintenanceEntry({ loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io))
			.resolves.toBe("failed");
	});

	it("still reports 'written' for the normal, healthy round-trip", async () => {
		const { io } = fakeIO();
		await expect(appendMaintenanceEntry({ loggedAt: 1, category: "c", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null }, io))
			.resolves.toBe("written");
	});
});

// --- Item E: CSV export --------------------------------------------------------------------------
describe("maintenanceLogToCsv", () => {
	it("writes a header row naming every known counter's value and delta columns", () => {
		const csv = maintenanceLogToCsv(emptyMaintenanceLog());
		const header = csv.split("\r\n")[0];
		expect(header).toBe("Logged At,Category,Note,Spindle Seconds,Spindle Seconds Delta,Print Seconds,Print Seconds Delta,Filament mm,Filament mm Delta,Tool Changes,Tool Changes Delta");
	});

	it("emits one row per entry, oldest first regardless of insertion order", () => {
		const log = emptyMaintenanceLog();
		log.entries.push(
			{ id: "2", loggedAt: 2000, category: "belt", note: "second", spindleSecondsAtEntry: null, jobSecondsAtEntry: null },
			{ id: "1", loggedAt: 1000, category: "collet", note: "first", spindleSecondsAtEntry: null, jobSecondsAtEntry: null },
		);
		const rows = maintenanceLogToCsv(log).trim().split("\r\n");
		expect(rows).toHaveLength(3); // header + 2 entries
		expect(rows[1]).toContain("first");
		expect(rows[2]).toContain("second");
	});

	it("renders the timestamp as ISO-8601, and passes category/note through", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: Date.UTC(2026, 0, 1, 12, 0, 0), category: "belt", note: "tensioned", spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		const row = maintenanceLogToCsv(log).trim().split("\r\n")[1];
		expect(row).toBe("2026-01-01T12:00:00.000Z,belt,tensioned,,,,,,,,");
	});

	it("leaves a counter's value/delta cells BLANK (not 0) when the entry never recorded it", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "custom", note: "n", spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		const row = maintenanceLogToCsv(log).trim().split("\r\n")[1];
		const cells = row.split(",");
		expect(cells[3]).toBe(""); // Spindle Seconds
		expect(cells[4]).toBe(""); // Spindle Seconds Delta
	});

	it("computes each counter's delta from the previous entry that recorded a value for it", () => {
		const log = emptyMaintenanceLog();
		log.entries.push(
			{ id: "1", loggedAt: 1000, category: "c", note: "a", spindleSecondsAtEntry: 100, jobSecondsAtEntry: null },
			{ id: "2", loggedAt: 2000, category: "c", note: "b", spindleSecondsAtEntry: 250, jobSecondsAtEntry: null },
		);
		const rows = maintenanceLogToCsv(log).trim().split("\r\n");
		const firstCells = rows[1].split(",");
		const secondCells = rows[2].split(",");
		expect(firstCells[3]).toBe("100"); // value
		expect(firstCells[4]).toBe(""); // no previous value yet -> blank delta
		expect(secondCells[3]).toBe("250");
		expect(secondCells[4]).toBe("150"); // 250 - 100
	});

	it("clamps a negative delta to 0 (e.g. the underlying counter was reset between entries)", () => {
		const log = emptyMaintenanceLog();
		log.entries.push(
			{ id: "1", loggedAt: 1000, category: "c", note: "a", spindleSecondsAtEntry: 500, jobSecondsAtEntry: null },
			{ id: "2", loggedAt: 2000, category: "c", note: "b", spindleSecondsAtEntry: 100, jobSecondsAtEntry: null },
		);
		const rows = maintenanceLogToCsv(log).trim().split("\r\n");
		expect(rows[2].split(",")[4]).toBe("0");
	});

	it("quotes a note containing a comma, quote or newline, doubling any inner quotes", () => {
		const log = emptyMaintenanceLog();
		log.entries.push({ id: "1", loggedAt: 1000, category: "custom", note: 'a "tricky" note, with commas', spindleSecondsAtEntry: null, jobSecondsAtEntry: null });
		const row = maintenanceLogToCsv(log).trim().split("\r\n")[1];
		expect(row).toContain('"a ""tricky"" note, with commas"');
	});
});
