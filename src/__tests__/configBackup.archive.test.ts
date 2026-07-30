import { describe, expect, it } from "vitest";

import { buildArchive, computeMachineKey, readArchive } from "../model/configBackup/archive";
import { resetHashAlgoCache } from "../model/configBackup/hash";
import type { CollectedFile } from "../model/configBackup/types";

function baseOptions(overrides: Partial<Parameters<typeof buildArchive>[1]> = {}) {
	return {
		redact: false,
		scope: { system: true, macros: true, filaments: true, objectModel: true, diagnostics: true },
		machine: {
			hostname: "voron24", name: "Voron 2.4", firmwareName: "RepRapFirmware", firmwareVersion: "3.7.0",
			electronics: "Duet 3 MB6HC", boards: [{ canAddress: 0, shortName: "MB6HC", firmwareVersion: "3.7.0", uniqueId: "abc-123" }],
		},
		directories: {},
		pluginVersion: "1.7.0",
		dwcVersion: "3.7.0",
		...overrides,
	};
}

function configFile(content: string): CollectedFile {
	return { source: "0:/sys/config.g", kind: "system", relativePath: "config.g", size: content.length, lastModified: null, binary: false, content };
}

describe("computeMachineKey", () => {
	it("uses the mainboard's uniqueId when present", () => {
		const key = computeMachineKey({ hostname: "h", name: "n", firmwareName: "f", firmwareVersion: "1", electronics: "e", boards: [{ canAddress: 0, shortName: "MB6HC", firmwareVersion: "3.7.0", uniqueId: "the-id" }] });
		expect(key).toBe("the-id");
	});

	it("falls back to a stable hash when uniqueId is absent (Duet 2)", () => {
		const board = { canAddress: 0, shortName: "DuetWiFi", firmwareVersion: "3.5.0", uniqueId: null };
		const key1 = computeMachineKey({ hostname: "h", name: "myprinter", firmwareName: "f", firmwareVersion: "1", electronics: "e", boards: [board] });
		const key2 = computeMachineKey({ hostname: "h", name: "myprinter", firmwareName: "f", firmwareVersion: "1", electronics: "e", boards: [board] });
		expect(key1).toBe(key2);
		expect(key1).not.toBe("");
	});
});

describe("buildArchive / readArchive round-trip", () => {
	it("round-trips a simple verbatim archive", async () => {
		const { blob, manifest } = await buildArchive(
			{ files: [configFile('M550 P"Voron"\nM587 S"HomeNet" P"secret"')], skipped: [], objectModelJson: JSON.stringify({ ok: true }), diagnostics: { mainboard: "diag text", canBoards: [] } },
			baseOptions(),
		);
		expect(manifest.redacted).toBe(false);
		expect(manifest.counts.files).toBe(1);
		// Verbatim mode: content unchanged, but the scan still recorded what it found.
		expect(manifest.counts.redactions).toBeGreaterThan(0);

		const parsed = await readArchive(blob);
		expect(parsed.manifest.kind).toBe("flexible-layouts-config-backup");
		expect(parsed.textFiles.get("files/sys/config.g")).toContain('M587 S"HomeNet" P"secret"'); // verbatim: unchanged
		expect(parsed.objectModelJson).toBe(JSON.stringify({ ok: true }));
		expect(parsed.redactions.applied).toBe(false);
		expect(parsed.redactions.entries.length).toBeGreaterThan(0);
	});

	it("round-trips a redacted archive with content actually altered", async () => {
		const { manifest, blob } = await buildArchive(
			{ files: [configFile('M587 S"HomeNet" P"secret"')], skipped: [], objectModelJson: null, diagnostics: null },
			baseOptions({ redact: true }),
		);
		expect(manifest.redacted).toBe(true);
		const parsed = await readArchive(blob);
		const content = parsed.textFiles.get("files/sys/config.g")!;
		expect(content).toContain('S"[REDACTED]"');
		expect(content).toContain('P"[REDACTED]"');
		expect(content).toMatch(/\[FL-REDACTED:\d+\]/);
		expect(parsed.redactions.applied).toBe(true);
	});

	it("round-trips binary file content byte-for-byte", async () => {
		const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
		let binary = "";
		bytes.forEach((b) => { binary += String.fromCharCode(b); });
		const base64 = btoa(binary);
		const file: CollectedFile = { source: "0:/sys/logo.png", kind: "system", relativePath: "logo.png", size: bytes.length, lastModified: null, binary: true, content: base64 };
		const { blob } = await buildArchive({ files: [file], skipped: [], objectModelJson: null, diagnostics: null }, baseOptions());
		const parsed = await readArchive(blob);
		const restoredBlob = parsed.binaryFiles.get("files/sys/logo.png")!;
		const buf = new Uint8Array(await restoredBlob.arrayBuffer());
		expect(Array.from(buf)).toEqual(Array.from(bytes));
	});

	it("computes SHA-256 hashes (crypto.subtle is available in this test environment)", async () => {
		const { manifest } = await buildArchive({ files: [configFile("hello")], skipped: [], objectModelJson: null, diagnostics: null }, baseOptions());
		expect(manifest.hashAlgo).toBe("sha256");
		expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("readArchive - tolerant parsing", () => {
	it("falls back to walking files/** when manifest.json is missing", async () => {
		const JSZip = (await import("jszip")).default;
		const zip = new JSZip();
		zip.file("files/sys/config.g", 'M550 P"NoManifest"');
		const blob = await zip.generateAsync({ type: "blob" });
		const parsed = await readArchive(blob);
		expect(parsed.textFiles.get("files/sys/config.g")).toBe('M550 P"NoManifest"');
		expect(parsed.manifest.files[0].kind).toBe("system");
	});

	it("tolerates a missing redactions.json", async () => {
		const JSZip = (await import("jszip")).default;
		const zip = new JSZip();
		zip.file("manifest.json", JSON.stringify({
			kind: "flexible-layouts-config-backup", schemaVersion: 1, createdAt: "", redacted: false, hashAlgo: "cyrb53",
			createdBy: { plugin: "x", version: "1", dwcVersion: "1" },
			machine: { hostname: "h", name: "n", machineKey: "k", firmware: { name: "f", version: "1", electronics: "e" }, boards: [] },
			directories: { system: "0:/sys/", macros: "0:/macros/", filaments: "0:/filaments/" },
			files: [], skipped: [], counts: { files: 0, bytes: 0, redactions: 0, skipped: 0 },
		}));
		const blob = await zip.generateAsync({ type: "blob" });
		const parsed = await readArchive(blob);
		expect(parsed.redactions.applied).toBe(false);
		expect(parsed.redactions.entries).toEqual([]);
	});

	it("rejects an archive from a future schema version with a clear message", async () => {
		const JSZip = (await import("jszip")).default;
		const zip = new JSZip();
		zip.file("manifest.json", JSON.stringify({ kind: "flexible-layouts-config-backup", schemaVersion: 999 }));
		const blob = await zip.generateAsync({ type: "blob" });
		await expect(readArchive(blob)).rejects.toThrow(/newer version of Flexible Layouts/);
	});

	it("falls back to files/** walk when manifest.json is corrupt JSON", async () => {
		const JSZip = (await import("jszip")).default;
		const zip = new JSZip();
		zip.file("manifest.json", "{not valid json");
		zip.file("files/macros/start.g", "G28");
		const blob = await zip.generateAsync({ type: "blob" });
		const parsed = await readArchive(blob);
		expect(parsed.textFiles.get("files/macros/start.g")).toBe("G28");
	});
});

describe("hash fallback", () => {
	it("falls back to cyrb53 when crypto.subtle throws", async () => {
		resetHashAlgoCache();
		const original = crypto.subtle.digest;
		// @ts-expect-error - deliberately breaking crypto.subtle to exercise the fallback path
		crypto.subtle.digest = () => { throw new Error("not available on this origin"); };
		try {
			const { manifest } = await buildArchive({ files: [configFile("hello")], skipped: [], objectModelJson: null, diagnostics: null }, baseOptions());
			expect(manifest.hashAlgo).toBe("cyrb53");
			expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]+$/);
		} finally {
			crypto.subtle.digest = original;
			resetHashAlgoCache();
		}
	});
});
