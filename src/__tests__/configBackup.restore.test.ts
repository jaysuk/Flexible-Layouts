import { describe, expect, it } from "vitest";

import { buildArchive, computeMachineKey } from "../model/configBackup/archive";
import {
	applyRestorePlan, buildRestorePlan, compareMachines, computeMirrorDeletions, RestoreBlockedError,
} from "../model/configBackup/restore";
import type { MachineIO } from "../model/configBackup/collect";
import type { CollectedFile, ManifestFile, ParsedArchive } from "../model/configBackup/types";

function baseOptions() {
	return {
		redact: false,
		scope: { system: true, macros: true, filaments: true, objectModel: false, diagnostics: false },
		machine: {
			hostname: "voron24", name: "Voron 2.4", firmwareName: "RepRapFirmware", firmwareVersion: "3.7.0",
			electronics: "Duet 3 MB6HC", boards: [{ canAddress: 0, shortName: "MB6HC", firmwareVersion: "3.7.0", uniqueId: "abc-123" }],
		},
		directories: {},
		pluginVersion: "1.7.0",
		dwcVersion: "3.7.0",
	};
}

function collectedFile(kind: "system" | "macros" | "filaments", relativePath: string, content: string): CollectedFile {
	return { source: `0:/${kind === "system" ? "sys" : kind}/${relativePath}`, kind, relativePath, size: content.length, lastModified: null, binary: false, content };
}

async function makeArchive(files: Array<CollectedFile>, skipped: ParsedArchive["manifest"]["skipped"] = []): Promise<ParsedArchive> {
	const { manifest, redactions } = await buildArchive({ files, skipped, objectModelJson: null, diagnostics: null }, baseOptions());
	const textFiles = new Map<string, string>();
	for (const f of files) { textFiles.set(`files/${f.kind === "system" ? "sys" : f.kind}/${f.relativePath}`, f.content!); }
	return { manifest, redactions, textFiles, binaryFiles: new Map(), objectModelJson: null, readmeText: null };
}

const LIVE_DIRS = { system: "0:/sys/", macros: "0:/macros/", filaments: "0:/filaments/" };

describe("buildRestorePlan", () => {
	it("maps archive paths onto the live machine's directories", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "M550 P\"x\"")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		expect(plan.entries[0].targetPath).toBe("0:/sys/config.g");
		expect(plan.entries[0].status).toBe("new");
	});

	it("maps across DIFFERING live directory config (cross-machine restore)", async () => {
		const archive = await makeArchive([collectedFile("macros", "start.g", "G28")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const differentDirs = { system: "0:/sys/", macros: "0:/my-macros/", filaments: "0:/filaments/" };
		const plan = buildRestorePlan(archive, selection, differentDirs, "merge", new Set());
		expect(plan.entries[0].targetPath).toBe("0:/my-macros/start.g");
	});

	it("classifies an existing target as overwrite", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "M550 P\"x\"")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set(["0:/sys/config.g"]));
		expect(plan.entries[0].status).toBe("overwrite");
	});

	it("rejects a traversal-escaping relative path as invalid, never writing it", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		// Tamper with the manifest to simulate a hand-edited/malicious archive.
		(archive.manifest.files[0] as ManifestFile).path = "files/sys/../../../etc/passwd";
		const selection = new Set(["files/sys/../../../etc/passwd"]);
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		expect(plan.entries[0].status).toBe("invalid");
	});

	it("only includes selected files", async () => {
		const archive = await makeArchive([
			collectedFile("system", "config.g", "a"),
			collectedFile("system", "homex.g", "b"),
		]);
		const selection = new Set([archive.manifest.files[0].path]);
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		expect(plan.entries).toHaveLength(1);
	});
});

describe("compareMachines", () => {
	const backupManifest = {
		machine: {
			hostname: "old-host", name: "Old Printer", machineKey: "same-key",
			firmware: { name: "RepRapFirmware", version: "3.7.0", electronics: "Duet 3 MB6HC" },
			boards: [
				{ canAddress: 0, shortName: "MB6HC", firmwareVersion: "3.7.0", uniqueId: "same-key" },
				{ canAddress: 1, shortName: "TOOL1LC", firmwareVersion: "3.7.0" },
			],
		},
	} as any;

	it("recognises the same machine by machineKey", () => {
		const live = { hostname: "old-host", name: "Old Printer", firmwareName: "RepRapFirmware", firmwareVersion: "3.7.0", electronics: "Duet 3 MB6HC", boards: [{ canAddress: 0, shortName: "MB6HC", firmwareVersion: "3.7.0", uniqueId: "same-key" }, { canAddress: 1, shortName: "TOOL1LC", firmwareVersion: "3.7.0" }] };
		const diff = compareMachines(backupManifest, live);
		expect(diff.sameMachine).toBe(true);
	});

	it("flags a swapped mainboard as a different machine with a danger row", () => {
		const live = { hostname: "new-host", name: "New Printer", firmwareName: "RepRapFirmware", firmwareVersion: "3.7.0", electronics: "Duet 2 WiFi", boards: [{ canAddress: 0, shortName: "DuetWiFi", firmwareVersion: "3.5.0", uniqueId: "different-key" }] };
		const diff = compareMachines(backupManifest, live);
		expect(diff.sameMachine).toBe(false);
		expect(diff.rows.find((r) => r.label === "Electronics")?.severity).toBe("danger");
		// The backup's CAN toolboard (1) is missing on the live machine.
		expect(diff.rows.some((r) => r.label.includes("CAN board 1"))).toBe(true);
	});

	it("detects a config.g driver reference to a board absent on the live machine", () => {
		const live = { hostname: "h", name: "n", firmwareName: "f", firmwareVersion: "3.7.0", electronics: "e", boards: [{ canAddress: 0, shortName: "MB6HC", firmwareVersion: "3.7.0" }] };
		const configG = 'M584 X0.0 Y0.1 Z0.2 E1.0\nM569 P1.0 S1';
		const diff = compareMachines(backupManifest, live, configG);
		expect(diff.missingDriverRefs.some((r) => r.includes("Board 1"))).toBe(true);
		expect(diff.missingDriverRefs.some((r) => r.includes("Board 0"))).toBe(false);
	});
});

describe("computeMirrorDeletions", () => {
	it("never deletes firmware .bin (backup would have excluded it anyway)", async () => {
		const archive = await makeArchive(
			[collectedFile("system", "config.g", "ok")],
			[{ source: "0:/sys/firmware.bin", kind: "system", reason: "excluded-extension", size: 999999 }],
		);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const liveFiles = [
			{ targetPath: "0:/sys/config.g", kind: "system" as const, size: 10 },
			{ targetPath: "0:/sys/firmware.bin", kind: "system" as const, size: 999999 },
		];
		const { deletions } = computeMirrorDeletions(liveFiles, archive, selection, LIVE_DIRS);
		expect(deletions.find((d) => d.targetPath === "0:/sys/firmware.bin")).toBeUndefined();
	});

	it("never touches a directory the backup didn't cover (no filaments in backup)", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const liveFiles = [{ targetPath: "0:/filaments/PLA/config.g", kind: "filaments" as const, size: 10 }];
		const { deletions } = computeMirrorDeletions(liveFiles, archive, selection, LIVE_DIRS);
		expect(deletions).toHaveLength(0);
	});

	it("downgrades a partially-selected directory to merge-only (no deletions)", async () => {
		const archive = await makeArchive([
			collectedFile("system", "config.g", "a"),
			collectedFile("system", "homex.g", "b"),
		]);
		const selection = new Set([archive.manifest.files[0].path]); // only config.g selected, not homex.g
		const liveFiles = [{ targetPath: "0:/sys/stale.g", kind: "system" as const, size: 5 }];
		const { deletions, mirrorEligibleKinds } = computeMirrorDeletions(liveFiles, archive, selection, LIVE_DIRS);
		expect(mirrorEligibleKinds.has("system")).toBe(false);
		expect(deletions).toHaveLength(0);
	});

	it("deletes a stale file not present in a fully-selected directory", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const liveFiles = [
			{ targetPath: "0:/sys/config.g", kind: "system" as const, size: 10 },
			{ targetPath: "0:/sys/old-unused-macro.g", kind: "system" as const, size: 5 },
		];
		const { deletions } = computeMirrorDeletions(liveFiles, archive, selection, LIVE_DIRS);
		expect(deletions).toEqual([{ targetPath: "0:/sys/old-unused-macro.g", kind: "system", size: 5 }]);
	});

	it("never deletes the FL SD-backup safety-net files (deny-list)", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const liveFiles = [{ targetPath: "0:/sys/flexible-layouts.backup.json", kind: "system" as const, size: 5 }];
		const { deletions } = computeMirrorDeletions(liveFiles, archive, selection, LIVE_DIRS);
		expect(deletions).toHaveLength(0);
	});
});

describe("applyRestorePlan", () => {
	function fakeIo(): MachineIO & { uploaded: Array<{ path: string; text?: string }>; deleted: Array<string> } {
		const uploaded: Array<{ path: string; text?: string }> = [];
		const deleted: Array<string> = [];
		// Round-trips uploaded content back out on download, like a real filesystem - applyRestorePlan
		// now verifies every write by reading it back, so a fake that always returned "" would make
		// every single write register as a verification failure.
		const store = new Map<string, Blob>();
		return {
			uploaded, deleted,
			async getFileList() { return []; },
			async downloadText(filename) { return (await store.get(filename)?.text()) ?? ""; },
			async downloadBlob(filename) { return store.get(filename) ?? new Blob(); },
			async upload(filename, content) {
				uploaded.push({ path: filename, text: content instanceof Blob ? await content.text() : undefined });
				store.set(filename, content);
			},
			async deleteFile(filename) { deleted.push(filename); store.delete(filename); },
			async sendCode() { return ""; },
		};
	}

	it("uploads planned files and skips invalid entries", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "M550 P\"x\"")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		const io = fakeIo();
		const result = await applyRestorePlan(io, { archive, plan });
		expect(io.uploaded).toHaveLength(1);
		expect(io.uploaded[0].path).toBe("0:/sys/config.g");
		expect(result.touchedConfigG).toBe(true);
	});

	it("reports progress once per file/deletion, ending at the total count", async () => {
		const archive = await makeArchive([
			collectedFile("system", "config.g", "a"),
			collectedFile("system", "homex.g", "b"),
		]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "mirror", new Set());
		plan.deletions.push({ targetPath: "0:/sys/stale.g", kind: "system", size: 1 });
		const io = fakeIo();
		const progressCalls: Array<[number, number]> = [];
		await applyRestorePlan(io, { archive, plan, onProgress: (done, total) => progressCalls.push([done, total]) });
		// 2 file writes + 1 deletion = 3 total steps, called once per step, always with the same total.
		expect(progressCalls).toEqual([[1, 3], [2, 3], [3, 3]]);
	});

	it("counts a failed step towards progress too (so the bar always reaches 100%)", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "M551 P\"[REDACTED]\"")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		const io = fakeIo();
		const progressCalls: Array<[number, number]> = [];
		await applyRestorePlan(io, { archive, plan, onProgress: (done, total) => progressCalls.push([done, total]) });
		expect(progressCalls).toEqual([[1, 1]]);
	});

	it("writes before deletes (mirror mode ordering)", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "mirror", new Set());
		plan.deletions.push({ targetPath: "0:/sys/stale.g", kind: "system", size: 1 });
		const order: Array<string> = [];
		const io = fakeIo();
		io.upload = async (filename) => { order.push(`upload:${filename}`); };
		io.deleteFile = async (filename) => { order.push(`delete:${filename}`); };
		await applyRestorePlan(io, { archive, plan });
		expect(order).toEqual(["upload:0:/sys/config.g", "delete:0:/sys/stale.g"]);
	});

	it("blocks the whole restore while printing", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		const plan = buildRestorePlan(archive, new Set(), LIVE_DIRS, "merge", new Set());
		const io = fakeIo();
		await expect(applyRestorePlan(io, { archive, plan, machineStatus: "processing" })).rejects.toThrow(RestoreBlockedError);
	});

	it("refuses to upload a file that still contains an unresolved redaction marker", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "M551 P\"[REDACTED]\"")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		const io = fakeIo();
		const result = await applyRestorePlan(io, { archive, plan });
		expect(io.uploaded).toHaveLength(0);
		expect(result.results[0].status).toBe("failed");
		expect(result.results[0].error).toMatch(/unresolved redacted value/);
	});

	it("uses contentOverrides (post-repair text) instead of the archive's raw content", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "M551 P\"[REDACTED]\" ; [FL-REDACTED:0]")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		const io = fakeIo();
		const overrides = new Map([[plan.entries[0].archivePath, 'M551 P"realpassword"']]);
		await applyRestorePlan(io, { archive, plan, contentOverrides: overrides });
		expect(io.uploaded[0].text).toBe('M551 P"realpassword"');
	});

	it("flags a text write as failed when the read-back content doesn't match (verification)", async () => {
		const archive = await makeArchive([collectedFile("system", "config.g", "ok")]);
		const selection = new Set(archive.manifest.files.map((f) => f.path));
		const plan = buildRestorePlan(archive, selection, LIVE_DIRS, "merge", new Set());
		const io = fakeIo();
		io.downloadText = async () => "corrupted";
		const result = await applyRestorePlan(io, { archive, plan });
		expect(result.results[0].status).toBe("failed");
		expect(result.results[0].error).toMatch(/Verification failed/);
	});

	it("flags a binary write as failed when the read-back size doesn't match (verification)", async () => {
		const archivePath = "files/sys/logo.bin";
		const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
		const archive: ParsedArchive = {
			manifest: {
				kind: "flexible-layouts-config-backup", schemaVersion: 1, createdAt: "",
				createdBy: { plugin: "", version: "", dwcVersion: "" }, redacted: false, hashAlgo: "sha256",
				machine: { hostname: "h", name: "n", machineKey: "k", firmware: { name: "", version: "", electronics: "" }, boards: [] },
				directories: LIVE_DIRS, files: [], skipped: [], counts: { files: 0, bytes: 0, redactions: 0, skipped: 0 },
			},
			redactions: { kind: "flexible-layouts-redactions", schemaVersion: 1, applied: false, entries: [] },
			textFiles: new Map(),
			binaryFiles: new Map([[archivePath, blob]]),
			objectModelJson: null,
			readmeText: null,
		};
		const plan = {
			mode: "merge" as const,
			entries: [{ archivePath, targetPath: "0:/sys/logo.bin", kind: "system" as const, status: "new" as const, size: 4, redacted: false }],
			deletions: [],
		};
		const io = fakeIo();
		io.downloadBlob = async () => new Blob([new Uint8Array([9, 9])]);
		const result = await applyRestorePlan(io, { archive, plan });
		expect(result.results[0].status).toBe("failed");
		expect(result.results[0].error).toMatch(/Verification failed/);
	});
});

describe("computeMachineKey re-export sanity", () => {
	it("is deterministic", () => {
		const m = { hostname: "h", name: "n", firmwareName: "f", firmwareVersion: "1", electronics: "e", boards: [{ canAddress: 0, shortName: "s", firmwareVersion: "1", uniqueId: "id-1" }] };
		expect(computeMachineKey(m)).toBe("id-1");
	});
});
