import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileListEntry } from "dwc-config-backup-core";

import {
	CONCURRENCY, MAX_FILE_BYTES, cachedScanFiles, clearScanCache, directoriesOf, isCandidate, loadMachineFiles, scanFilesYielding, scanMachine,
} from "../src/model/firmware/changeScan";

interface Fake {
	dirs: Record<string, Array<Partial<FileListEntry> & { name: string }>>;
	files: Record<string, string>;
	downloads: Array<string>;
	listings: Array<string>;
	failing: Set<string>;
	inFlight: number;
	peak: number;
}

function fake(dirs: Fake["dirs"], files: Fake["files"]) {
	const state: Fake = { dirs, files, downloads: [], listings: [], failing: new Set(), inFlight: 0, peak: 0 };
	const io = {
		async getFileList(dir: string): Promise<Array<FileListEntry>> {
			state.listings.push(dir);
			const d = state.dirs[dir];
			if (!d) throw new Error("no such directory");
			return d.map((e) => ({ isDirectory: false, size: (state.files[`${dir}${e.name}`] ?? "").length, lastModified: new Date("2026-01-01T00:00:00Z"), ...e }));
		},
		async downloadText(path: string): Promise<string> {
			state.downloads.push(path);
			state.inFlight++;
			state.peak = Math.max(state.peak, state.inFlight);
			await new Promise((r) => setTimeout(r, 1));
			state.inFlight--;
			if (state.failing.has(path)) throw new Error("read error");
			return state.files[path] ?? "";
		},
	};
	return { io, state };
}

const CONFIG = "; config\nM408 S0\nG1 X1\n";
const layout = () => fake(
	{
		"0:/sys/": [{ name: "config.g" }, { name: "board.txt" }, { name: "heightmap.csv" }, { name: "dwc", isDirectory: true }],
		"0:/sys/dwc/": [{ name: "settings.json" }],
		"0:/macros/": [{ name: "Heat", isDirectory: true }, { name: "warm" }, { name: "logo.png" }, { name: "note.txt" }],
		"0:/macros/Heat/": [{ name: "bed.g" }],
	},
	{
		"0:/sys/config.g": CONFIG,
		"0:/macros/warm": "M408\n",
		"0:/macros/Heat/bed.g": "M140 S60\n",
	},
);

beforeEach(() => clearScanCache());

describe("what is read", () => {
	it("takes G-code files from sys and macros (subfolders too), and nothing else", async () => {
		const { io } = layout();
		const load = await loadMachineFiles(io);
		expect(load.files.map((f) => f.path).sort()).toEqual(["0:/macros/Heat/bed.g", "0:/macros/warm", "0:/sys/config.g"]);
		expect(load.complete).toBe(true);
	});

	it("never lists gcodes/", async () => {
		const { io, state } = layout();
		await loadMachineFiles(io);
		expect(state.listings.some((d) => d.includes("gcodes"))).toBe(false);
	});

	it("skips a file over the size cap and says so", async () => {
		const { io, state } = layout();
		state.dirs["0:/sys/"].push({ name: "huge.g", size: MAX_FILE_BYTES + 1 });
		const load = await loadMachineFiles(io);
		expect(load.tooLarge).toEqual(["0:/sys/huge.g"]);
		expect(state.downloads).not.toContain("0:/sys/huge.g");
	});

	it("survives a missing directory and an unreadable file", async () => {
		const { io, state } = layout();
		delete state.dirs["0:/macros/"];
		state.failing.add("0:/sys/config.g");
		const load = await loadMachineFiles(io);
		expect(load.unreadable).toEqual(["0:/sys/config.g"]);
		expect(load.files).toEqual([]);
		expect(load.complete).toBe(true);
	});

	it("candidate names: .g-like anywhere, extension-less only in macros", () => {
		expect(isCandidate("0:/sys/config.g", false)).toBe(true);
		expect(isCandidate("0:/sys/tpre0.g", false)).toBe(true);
		expect(isCandidate("0:/sys/board.txt", false)).toBe(false);
		expect(isCandidate("0:/sys/lpc", false)).toBe(false);
		expect(isCandidate("0:/macros/warm", true)).toBe(true);
		expect(isCandidate("0:/macros/logo.png", true)).toBe(false);
		expect(isCandidate("0:/macros/notes.txt", true)).toBe(false);
	});

	it("honours the directories the machine reports", () => {
		expect(directoriesOf({ directories: { system: "0:/system", macros: "0:/m/" } })).toEqual({ system: "0:/system/", macros: "0:/m/" });
		expect(directoriesOf(undefined)).toEqual({ system: "0:/sys/", macros: "0:/macros/" });
	});
});

describe("the cache", () => {
	it("re-reads only what changed (size or modified time)", async () => {
		const { io, state } = layout();
		await loadMachineFiles(io);
		expect(state.downloads).toHaveLength(3);
		state.downloads.length = 0;
		const again = await loadMachineFiles(io);
		expect(state.downloads).toEqual([]);
		expect(again.cacheHits).toBe(3);
		expect(again.files).toHaveLength(3);

		state.files["0:/sys/config.g"] = `${CONFIG}M999\n`; // size changes
		await loadMachineFiles(io);
		expect(state.downloads).toEqual(["0:/sys/config.g"]);
		state.downloads.length = 0;

		state.dirs["0:/macros/"].find((e) => e.name === "warm")!.lastModified = new Date("2026-02-02T00:00:00Z"); // same size, newer
		await loadMachineFiles(io);
		expect(state.downloads).toEqual(["0:/macros/warm"]);
	});

	it("forgets a file that is gone", async () => {
		const { io, state } = layout();
		await loadMachineFiles(io);
		state.dirs["0:/macros/"] = state.dirs["0:/macros/"].filter((e) => e.name !== "warm");
		await loadMachineFiles(io);
		expect(cachedScanFiles().map((f) => f.path)).not.toContain("0:/macros/warm");
	});

	it("holds text in memory only", async () => {
		const { io } = layout();
		await loadMachineFiles(io);
		expect(cachedScanFiles().find((f) => f.path === "0:/sys/config.g")?.text).toBe(CONFIG);
		expect(JSON.stringify(localStorage)).not.toContain("M408");
	});
});

describe("concurrency and stopping", () => {
	it("downloads a few at a time, never more than the cap", async () => {
		const dir = Array.from({ length: 12 }, (_, i) => ({ name: `m${i}.g` }));
		const files = Object.fromEntries(dir.map((e) => [`0:/macros/${e.name}`, "G1 X1\n"]));
		const { io, state } = fake({ "0:/sys/": [], "0:/macros/": dir }, files);
		await loadMachineFiles(io);
		expect(state.downloads).toHaveLength(12);
		expect(state.peak).toBeGreaterThan(1);
		expect(state.peak).toBeLessThanOrEqual(CONCURRENCY);
	});

	it("stops reading when told to (connection dropped) and reports it incomplete", async () => {
		const dir = Array.from({ length: 12 }, (_, i) => ({ name: `m${i}.g` }));
		const files = Object.fromEntries(dir.map((e) => [`0:/macros/${e.name}`, "G1 X1\n"]));
		const { io, state } = fake({ "0:/sys/": [], "0:/macros/": dir }, files);
		const load = await loadMachineFiles(io, { shouldContinue: () => state.downloads.length < 4 });
		expect(load.complete).toBe(false);
		expect(state.downloads.length).toBeLessThan(12);
		expect(state.downloads.length).toBeLessThanOrEqual(4 + CONCURRENCY);
	});

	it("scanMachine returns null when stopped, and a report otherwise", async () => {
		const { io } = layout();
		expect(await scanMachine(io, "3.6.3", "3.7.0-rc.2", { shouldContinue: () => false })).toBeNull();
		const scan = await scanMachine(io, "3.6.3", "3.7.0-rc.2");
		expect(scan?.report.byEvent.map((g) => g.event.id)).toContain("m408-removed");
		expect(scan?.report.totals.occurrences).toBeGreaterThan(1); // config.g and the macro
	});
});

describe("scanFilesYielding", () => {
	it("gives the same report as scanning in one go, and yields to the page between chunks", async () => {
		const { scanImpact } = await import("dwc-gcode-core");
		const files = Array.from({ length: 30 }, (_, i) => ({ path: `0:/macros/m${i}.g`, text: i % 2 ? "M408 S0\n" : "G1 X1\n" }));
		const spy = vi.spyOn(globalThis, "setTimeout");
		const yielding = await scanFilesYielding(files, "3.6.3", "3.7.0-rc.2");
		expect(yielding).toEqual(scanImpact(files, "3.6.3", "3.7.0-rc.2"));
		expect(spy.mock.calls.filter(([, ms]) => ms === 0).length).toBeGreaterThanOrEqual(3); // 30 files, 8 per chunk
		spy.mockRestore();
	});
});
