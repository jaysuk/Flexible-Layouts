import { describe, expect, it } from "vitest";

import {
	appendMaintenanceEntry, emptyMaintenanceLog, mostRecentEntry, parseMaintenanceLog,
	readMaintenanceLog, secondsSince, type MaintenanceIO,
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
