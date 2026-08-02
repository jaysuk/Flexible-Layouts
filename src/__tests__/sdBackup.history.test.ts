import { describe, expect, it, vi } from "vitest";

// applyBackup() re-applies the theme, which calls through to `unregisterTheme` from DWC's `@/plugins`
// - and the test kit's stub for that module doesn't export it (the same gap the plugin template flags
// for registerEmbeddableComponent). That's an environment limitation, not behaviour under test here:
// these tests are about the history ring's orchestration, and theme application has its own coverage.
vi.mock("../model/theme", () => ({ THEME_TOKENS: [], applyTheme: () => { /* no-op under test */ } }));

import {
	DEFAULT_HISTORY_LIMIT, HISTORY_DIR, type HistoryEntry, type HistoryIO,
	historyFilename, listHistory, makeBackup, parseHistoryFilename, pruneHistory,
	restoreHistorySnapshot, selectPrunable, writeHistorySnapshot,
} from "../model/sdBackup";
import { createEmptyDocument, type LayoutDocument } from "../model/document";
import { replaceAllProfiles, snapshotAllProfiles } from "../model/store";

// A fake card: an in-memory path -> text map, plus a per-op failure switch so the "a failed X must
// not report success" paths are exercised rather than assumed.
function fakeIO(seed: Record<string, string> = {}) {
	const files = new Map<string, string>(Object.entries(seed));
	const fail = { list: false, read: false, write: false, remove: false };
	const io: HistoryIO = {
		async list(dir) {
			if (fail.list) { throw new Error("no such directory"); }
			return [...files.keys()]
				.filter((p) => p.startsWith(`${dir}/`))
				.map((p) => ({ name: p.slice(dir.length + 1), isDirectory: false }));
		},
		async read(path) {
			if (fail.read) { throw new Error("read failed"); }
			const text = files.get(path);
			if (text === undefined) { throw new Error("not found"); }
			return text;
		},
		async write(path, text) {
			if (fail.write) { throw new Error("write failed"); }
			files.set(path, text);
		},
		async remove(path) {
			if (fail.remove) { throw new Error("remove failed"); }
			files.delete(path);
		},
	};
	return { io, files, fail };
}

function withContent(): LayoutDocument {
	const doc = createEmptyDocument();
	doc.pages["/Dashboard"] = {
		kind: "override", grid: { cols: 12, rowHeight: 30 },
		items: [{ i: "a", x: 0, y: 0, w: 2, h: 2, widget: { type: "builtinPanel", component: "MovementPanel" } }],
	};
	return doc;
}

/** Seed the fake card with `count` snapshots, oldest savedAt = 1000. */
function seedSnapshots(count: number): Record<string, string> {
	const seed: Record<string, string> = {};
	for (let i = 0; i < count; i++) {
		const savedAt = 1000 + i;
		seed[`${HISTORY_DIR}/${historyFilename(savedAt)}`] =
			JSON.stringify(makeBackup({ default: withContent() }, "default", savedAt));
	}
	return seed;
}

describe("historyFilename / parseHistoryFilename", () => {
	it("round-trips an unlabelled snapshot", () => {
		const name = historyFilename(1738368000000);
		expect(name).toBe("1738368000000.json");
		expect(parseHistoryFilename(name)).toEqual({ savedAt: 1738368000000, label: "" });
	});

	it("round-trips a labelled snapshot", () => {
		const name = historyFilename(1738368000000, "before-import");
		expect(parseHistoryFilename(name)).toEqual({ savedAt: 1738368000000, label: "before-import" });
	});

	// The filename is the source of truth, so sanitising is deliberately lossy - what matters is that
	// a label can never escape the directory or produce an unparseable name.
	it("strips path separators and other unsafe characters from a label", () => {
		const name = historyFilename(1000, "../../etc/passwd");
		expect(name).not.toContain("/");
		expect(parseHistoryFilename(name)).not.toBeNull();
	});

	it("rejects names that aren't ours", () => {
		expect(parseHistoryFilename("heightmap.csv")).toBeNull();
		expect(parseHistoryFilename("notanumber.json")).toBeNull();
		expect(parseHistoryFilename("1000.txt")).toBeNull();
		expect(parseHistoryFilename("0.json")).toBeNull();
	});
});

describe("selectPrunable", () => {
	const entries: Array<HistoryEntry> = [
		{ name: "c", savedAt: 300, label: "" },
		{ name: "a", savedAt: 100, label: "" },
		{ name: "b", savedAt: 200, label: "" },
	];

	it("keeps the newest N and returns the rest", () => {
		expect(selectPrunable(entries, 2).map((e) => e.name)).toEqual(["a"]);
	});

	it("prunes oldest-first when several are over the limit", () => {
		expect(selectPrunable(entries, 1).map((e) => e.name)).toEqual(["b", "a"]);
	});

	it("returns nothing when under the limit", () => {
		expect(selectPrunable(entries, 10)).toEqual([]);
	});
});

describe("listHistory", () => {
	it("returns newest first and ignores foreign files", async () => {
		const { io } = fakeIO({
			...seedSnapshots(3),
			[`${HISTORY_DIR}/heightmap.csv`]: "not ours",
		});
		const entries = await listHistory(io);
		expect(entries.map((e) => e.savedAt)).toEqual([1002, 1001, 1000]);
	});

	// A missing directory is the normal state before the first snapshot ever - it must read as
	// "no history", not as an error the caller has to handle.
	it("is empty when the directory doesn't exist", async () => {
		const { io, fail } = fakeIO();
		fail.list = true;
		await expect(listHistory(io)).resolves.toEqual([]);
	});
});

describe("pruneHistory", () => {
	it("deletes the oldest beyond the limit and keeps the rest", async () => {
		const { io, files } = fakeIO(seedSnapshots(5));
		const removed = await pruneHistory(3, io);
		expect(removed).toBe(2);
		const left = (await listHistory(io)).map((e) => e.savedAt);
		expect(left).toEqual([1004, 1003, 1002]);
		expect(files.size).toBe(3);
	});

	it("keeps everything when under the limit", async () => {
		const { io } = fakeIO(seedSnapshots(2));
		expect(await pruneHistory(DEFAULT_HISTORY_LIMIT, io)).toBe(0);
	});

	// A card that won't delete shouldn't blow up the caller - the snapshot that was just written is
	// the valuable half, and an over-long ring is a cosmetic problem.
	it("reports zero rather than throwing when deletes fail", async () => {
		const { io, fail } = fakeIO(seedSnapshots(5));
		fail.remove = true;
		await expect(pruneHistory(1, io)).resolves.toBe(0);
	});
});

describe("writeHistorySnapshot", () => {
	it("writes the live layout and prunes in the same call", async () => {
		replaceAllProfiles({ default: withContent() }, "default");
		const { io } = fakeIO(seedSnapshots(3));
		await expect(writeHistorySnapshot("manual", io, 3)).resolves.toBe("written");
		const entries = await listHistory(io);
		expect(entries).toHaveLength(3); // 3 seeded + 1 new, pruned back to 3
		expect(entries[0].label).toBe("manual"); // the new one is newest
	});

	// Same rule as writeBackup(): a pristine layout is not worth a slot, and snapshotting it would
	// push a genuinely useful older snapshot out of the ring.
	it("skips a pristine/empty layout", async () => {
		replaceAllProfiles({ default: createEmptyDocument() }, "default");
		const { io, files } = fakeIO();
		await expect(writeHistorySnapshot("", io)).resolves.toBe("skipped-empty");
		expect(files.size).toBe(0);
	});

	it("reports failure when the card won't take the write", async () => {
		replaceAllProfiles({ default: withContent() }, "default");
		const { io, fail } = fakeIO();
		fail.write = true;
		await expect(writeHistorySnapshot("", io)).resolves.toBe("failed");
	});
});

describe("restoreHistorySnapshot", () => {
	/** A snapshot holding a page at `path`, so restores are observable in the live document. */
	function snapshotWithPage(savedAt: number, path: string): string {
		const doc = createEmptyDocument();
		doc.pages[path] = {
			kind: "override", grid: { cols: 12, rowHeight: 30 },
			items: [{ i: "x", x: 0, y: 0, w: 1, h: 1, widget: { type: "builtinPanel", component: "MovementPanel" } }],
		};
		return JSON.stringify(makeBackup({ default: doc }, "default", savedAt));
	}

	it("applies the chosen snapshot over the live layout", async () => {
		replaceAllProfiles({ default: withContent() }, "default");
		const name = historyFilename(2000);
		const { io } = fakeIO({ [`${HISTORY_DIR}/${name}`]: snapshotWithPage(2000, "/Console") });

		await expect(restoreHistorySnapshot(name, io)).resolves.toBe("restored");
		expect(snapshotAllProfiles().profiles.default.pages["/Console"]).toBeDefined();
	});

	// The whole point of the pre-snapshot: one mis-click must not be unrecoverable.
	it("snapshots the CURRENT layout before overwriting it", async () => {
		replaceAllProfiles({ default: withContent() }, "default");
		const name = historyFilename(2000);
		const { io } = fakeIO({ [`${HISTORY_DIR}/${name}`]: snapshotWithPage(2000, "/Console") });

		await restoreHistorySnapshot(name, io);

		const entries = await listHistory(io);
		expect(entries.some((e) => e.label === "before-restore")).toBe(true);
	});

	it("rejects a corrupt or foreign file without touching the live layout", async () => {
		replaceAllProfiles({ default: withContent() }, "default");
		const name = historyFilename(2000);
		const { io } = fakeIO({ [`${HISTORY_DIR}/${name}`]: "{\"kind\":\"something-else\"}" });

		await expect(restoreHistorySnapshot(name, io)).resolves.toBe("invalid");
		expect(snapshotAllProfiles().profiles.default.pages["/Dashboard"]).toBeDefined();
	});

	it("reports not-found for a snapshot that isn't there", async () => {
		const { io } = fakeIO();
		await expect(restoreHistorySnapshot("1234.json", io)).resolves.toBe("not-found");
	});

	// If we can't secure the current layout we must not overwrite it - failing closed is the whole
	// reason the pre-snapshot exists.
	it("aborts rather than overwriting when the pre-snapshot can't be written", async () => {
		replaceAllProfiles({ default: withContent() }, "default");
		const name = historyFilename(2000);
		const { io, fail } = fakeIO({ [`${HISTORY_DIR}/${name}`]: snapshotWithPage(2000, "/Console") });
		fail.write = true;

		await expect(restoreHistorySnapshot(name, io)).resolves.not.toBe("restored");
		expect(snapshotAllProfiles().profiles.default.pages["/Console"]).toBeUndefined();
	});
});
