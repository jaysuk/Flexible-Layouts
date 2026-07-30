import { describe, expect, it } from "vitest";

import type { FileListEntry, MachineIO } from "../model/configBackup/collect";
import { collectDiagnostics, collectDirectoryFiles, collectObjectModel, walkDirectory } from "../model/configBackup/collect";

/**
 * A fake MachineIO for testing. The shared dwc-plugin-test-kit's machine stub only implements
 * getFileList/sendCode (not download/upload/delete), so collect.ts is designed around dependency
 * injection instead - this fake exercises that seam directly.
 */
function makeFakeIo(opts: {
	files?: Record<string, Array<FileListEntry>>;
	texts?: Record<string, string>;
	blobs?: Record<string, Blob>;
	sendCode?: (code: string) => Promise<string> | string;
	failReads?: Set<string>;
}): MachineIO & { calls: { getFileList: Array<string>; sendCode: Array<string> } } {
	const calls = { getFileList: [] as Array<string>, sendCode: [] as Array<string> };
	return {
		calls,
		async getFileList(directory) {
			calls.getFileList.push(directory);
			const list = opts.files?.[directory];
			if (!list) { throw new Error(`no such directory: ${directory}`); }
			return list;
		},
		async downloadText(filename) {
			if (opts.failReads?.has(filename)) { throw new Error("read failed"); }
			return opts.texts?.[filename] ?? "";
		},
		async downloadBlob(filename) {
			if (opts.failReads?.has(filename)) { throw new Error("read failed"); }
			return opts.blobs?.[filename] ?? new Blob([]);
		},
		async upload() { /* not used by collect.ts */ },
		async deleteFile() { /* not used by collect.ts */ },
		async sendCode(code) {
			calls.sendCode.push(code);
			return opts.sendCode ? await opts.sendCode(code) : "";
		},
	};
}

function fileEntry(name: string, size: number | bigint = 100): FileListEntry {
	return { isDirectory: false, name, size, lastModified: new Date("2026-07-25T00:00:00Z") };
}
function dirEntry(name: string): FileListEntry {
	return { isDirectory: true, name, size: 0, lastModified: null };
}

describe("walkDirectory - recursion, exclusion, size cap", () => {
	it("recurses into subdirectories and builds relative paths", async () => {
		const io = makeFakeIo({
			files: {
				"0:/macros/": [dirEntry("Bed Leveling"), fileEntry("start.g")],
				"0:/macros/Bed Leveling/": [fileEntry("mesh.g")],
			},
		});
		const result = await walkDirectory(io, "0:/macros/", "macros", { maxFileBytes: 1024 * 1024 });
		const paths = result.files.map((f) => f.relativePath).sort();
		expect(paths).toEqual(["Bed Leveling/mesh.g", "start.g"]);
	});

	it("excludes firmware/log extensions (D7)", async () => {
		const io = makeFakeIo({
			files: { "0:/sys/": [fileEntry("config.g"), fileEntry("firmware.bin"), fileEntry("eventlog.txt.log")] },
		});
		const result = await walkDirectory(io, "0:/sys/", "system", { maxFileBytes: 1024 * 1024 });
		expect(result.files.map((f) => f.relativePath)).toEqual(["config.g"]);
		expect(result.skipped).toHaveLength(2);
		expect(result.skipped.every((s) => s.reason === "excluded-extension")).toBe(true);
	});

	it("excludes files over the per-file size cap", async () => {
		const io = makeFakeIo({ files: { "0:/sys/": [fileEntry("heightmap.csv", 2_000_000)] } });
		const result = await walkDirectory(io, "0:/sys/", "system", { maxFileBytes: 1_000_000 });
		expect(result.files).toHaveLength(0);
		expect(result.skipped[0]).toMatchObject({ reason: "too-large", size: 2_000_000 });
	});

	it("handles bigint sizes from FileListItem", async () => {
		const io = makeFakeIo({ files: { "0:/sys/": [fileEntry("config.g", 12345n)] } });
		const result = await walkDirectory(io, "0:/sys/", "system", { maxFileBytes: 1_000_000 });
		expect(result.files[0].size).toBe(12345);
	});

	it("treats a missing directory as empty, not an error", async () => {
		const io = makeFakeIo({ files: {} });
		const result = await walkDirectory(io, "0:/filaments/", "filaments", { maxFileBytes: 1_000_000 });
		expect(result.files).toHaveLength(0);
		expect(result.skipped).toHaveLength(0);
	});

	it("caps recursion depth", async () => {
		const files: Record<string, Array<FileListEntry>> = { "0:/sys/": [dirEntry("a")] };
		let path = "0:/sys/a/";
		for (let i = 0; i < 12; i++) {
			files[path] = [dirEntry("a")];
			path += "a/";
		}
		const io = makeFakeIo({ files });
		// Should not throw / infinite-loop even though the fixture nests deeper than MAX_WALK_DEPTH.
		const result = await walkDirectory(io, "0:/sys/", "system", { maxFileBytes: 1_000_000 });
		expect(result.files).toHaveLength(0); // all directories, no files anywhere in the chain
	});
});

describe("collectDirectoryFiles - reading content", () => {
	it("reads text file content", async () => {
		const io = makeFakeIo({
			files: { "0:/sys/": [fileEntry("config.g")] },
			texts: { "0:/sys/config.g": "M550 P\"Voron\"" },
		});
		const { files } = await collectDirectoryFiles(io, "system", "0:/sys/", { maxFileBytes: 1_000_000 });
		expect(files[0].content).toBe("M550 P\"Voron\"");
		expect(files[0].binary).toBe(false);
	});

	it("base64-encodes binary file content", async () => {
		const io = makeFakeIo({
			files: { "0:/sys/": [fileEntry("logo.png")] },
			blobs: { "0:/sys/logo.png": new Blob([new Uint8Array([137, 80, 78, 71])]) },
		});
		const { files } = await collectDirectoryFiles(io, "system", "0:/sys/", { maxFileBytes: 1_000_000 });
		expect(files[0].binary).toBe(true);
		expect(files[0].content).toBe(btoa(String.fromCharCode(137, 80, 78, 71)));
	});

	it("records a read failure as a skip rather than throwing", async () => {
		const io = makeFakeIo({
			files: { "0:/sys/": [fileEntry("broken.g")] },
			failReads: new Set(["0:/sys/broken.g"]),
		});
		const { files, skipped } = await collectDirectoryFiles(io, "system", "0:/sys/", { maxFileBytes: 1_000_000 });
		expect(files).toHaveLength(0);
		expect(skipped[0]).toMatchObject({ reason: "read-error" });
	});
});

describe("collectObjectModel", () => {
	it("sanitises and serialises the model, converting Maps to objects", () => {
		const model = { network: { hostname: "voron24", name: "Voron 2.4" }, global: new Map([["x", 1]]) };
		const json = collectObjectModel(model);
		const parsed = JSON.parse(json);
		expect(parsed.network.hostname).toBe("<redacted>");
		expect(parsed.global).toEqual({ x: 1 });
	});
});

describe("collectDiagnostics - M122 capture", () => {
	it("captures the mainboard and every non-zero CAN board, in order", async () => {
		const io = makeFakeIo({
			sendCode: (code) => (code === "M122" ? "mainboard diag" : `diag for ${code}`),
		});
		const result = await collectDiagnostics(io, [{ canAddress: 0 }, { canAddress: 1 }, { canAddress: 2 }]);
		expect(result.mainboard).toBe("mainboard diag");
		expect(result.canBoards).toEqual([
			{ canAddress: 1, text: "diag for M122 B1" },
			{ canAddress: 2, text: "diag for M122 B2" },
		]);
		expect(io.calls.sendCode).toEqual(["M122", "M122 B1", "M122 B2"]);
	});

	it("skips boards with null canAddress and the mainboard itself (0)", async () => {
		const io = makeFakeIo({ sendCode: () => "ok" });
		const result = await collectDiagnostics(io, [{ canAddress: null }, { canAddress: 0 }]);
		expect(result.canBoards).toHaveLength(0);
	});

	it("isolates a single board's failure without aborting the rest", async () => {
		const io = makeFakeIo({
			sendCode: (code) => {
				if (code === "M122 B1") { throw new Error("CAN timeout"); }
				return `ok:${code}`;
			},
		});
		const result = await collectDiagnostics(io, [{ canAddress: 1 }, { canAddress: 2 }]);
		expect(result.canBoards[0].text).toContain("Failed to capture M122 B1");
		expect(result.canBoards[0].text).toContain("CAN timeout");
		expect(result.canBoards[1].text).toBe("ok:M122 B2");
	});

	it("captures a mainboard failure as error text rather than throwing", async () => {
		const io = makeFakeIo({
			sendCode: () => { throw new Error("no response"); },
		});
		const result = await collectDiagnostics(io, []);
		expect(result.mainboard).toContain("Failed to capture M122");
		expect(result.mainboard).toContain("no response");
	});
});
