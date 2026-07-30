/**
 * Archive assembly (build) and parsing (read). Ties together collect.ts's raw file data and
 * sanitise.ts's redaction engine into the ZIP format described in CONFIG-BACKUP-PLAN.md §4.
 */
import JSZip from "jszip";

import { ARCHIVE_KIND, ARCHIVE_README, ARCHIVE_SCHEMA_VERSION, BACKUP_DIR_KINDS, DEFAULT_DIR_PATH, DIR_FOLDER, REDACTIONS_KIND, REDACTIONS_SCHEMA_VERSION } from "./constants";
import type { BackupDirKind } from "./constants";
import { cyrb53, detectHashAlgo, hashBytes } from "./hash";
import { sanitiseFile, redactM122 } from "./sanitise";
import type { SanitiseMode } from "./sanitise";
import type {
	BackupScope, CollectedFile, Manifest, ManifestBoard, ManifestFile, ManifestSkipped,
	ParsedArchive, RedactionEntry, RedactionsFile,
} from "./types";
import type { DiagnosticsCapture } from "./collect";

// --- Machine identity --------------------------------------------------------------------------------

export interface MachineIdentity {
	hostname: string;
	name: string;
	firmwareName: string;
	firmwareVersion: string;
	electronics: string;
	boards: Array<ManifestBoard>;
}

/** Stable per-machine grouping key (D5): `boards[0].uniqueId` (the mainboard), or a cyrb53 fallback
 * for boards (e.g. Duet 2) that don't report one. */
export function computeMachineKey(m: MachineIdentity): string {
	const mainboard = m.boards[0];
	if (mainboard?.uniqueId) { return mainboard.uniqueId; }
	return cyrb53(`${mainboard?.shortName ?? ""}|${mainboard?.firmwareVersion ?? ""}|${m.name}`);
}

// --- Base64 helpers ------------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
	return bytes;
}

// --- Build ---------------------------------------------------------------------------------------

export interface BuildArchiveOptions {
	redact: boolean;
	scope: BackupScope;
	machine: MachineIdentity;
	directories: Partial<Record<BackupDirKind, string>>;
	pluginVersion: string;
	dwcVersion: string;
}

export interface CollectedInput {
	files: Array<CollectedFile>;
	skipped: Array<ManifestSkipped>;
	objectModelJson: string | null;
	diagnostics: DiagnosticsCapture | null;
}

export interface BuildArchiveResult {
	blob: Blob;
	manifest: Manifest;
	redactions: RedactionsFile;
	/** Pre-compression byte totals, for the 2 MB pre-flight breakdown (§2.3 Q2). */
	sizeBySection: { system: number; macros: number; filaments: number; objectModel: number; diagnostics: number };
}

export async function buildArchive(collected: CollectedInput, opts: BuildArchiveOptions): Promise<BuildArchiveResult> {
	const mode: SanitiseMode = opts.redact ? "redact" : "scan";
	const hashAlgo = await detectHashAlgo();
	const zip = new JSZip();
	let nextIdCounter = 0;
	const nextId = () => nextIdCounter++;

	const allRedactions: Array<RedactionEntry> = [];
	const manifestFiles: Array<ManifestFile> = [];
	const sizeBySection = { system: 0, macros: 0, filaments: 0, objectModel: 0, diagnostics: 0 };

	for (const file of collected.files) {
		const archivePath = `files/${DIR_FOLDER[file.kind]}/${file.relativePath}`;
		let content = file.content ?? "";
		let redactions: Array<RedactionEntry> = [];
		if (!file.binary) {
			const result = sanitiseFile(archivePath, content, mode, nextId);
			content = result.content;
			redactions = result.redactions;
		}
		allRedactions.push(...redactions);

		const bytes = file.binary ? base64ToBytes(content) : new TextEncoder().encode(content);
		const sha = await hashBytes(bytes, hashAlgo);
		zip.file(archivePath, content, file.binary ? { base64: true } : undefined);

		manifestFiles.push({
			path: archivePath, source: file.source, kind: file.kind, size: bytes.byteLength,
			sha256: sha, lastModified: file.lastModified, binary: file.binary, redacted: redactions.length > 0,
		});
		sizeBySection[file.kind] += bytes.byteLength;
	}

	if (collected.objectModelJson != null) {
		zip.file("object-model.json", collected.objectModelJson);
		sizeBySection.objectModel = new TextEncoder().encode(collected.objectModelJson).byteLength;
	}

	if (collected.diagnostics) {
		const mb = sanitiseM122(collected.diagnostics.mainboard, "diagnostics/m122-mainboard.txt", mode, nextId);
		allRedactions.push(...mb.redactions);
		zip.file("diagnostics/m122-mainboard.txt", mb.content);
		sizeBySection.diagnostics += new TextEncoder().encode(mb.content).byteLength;
		for (const b of collected.diagnostics.canBoards) {
			const path = `diagnostics/m122-can-${b.canAddress}.txt`;
			const r = sanitiseM122(b.text, path, mode, nextId);
			allRedactions.push(...r.redactions);
			zip.file(path, r.content);
			sizeBySection.diagnostics += new TextEncoder().encode(r.content).byteLength;
		}
	}

	const redactionsFile: RedactionsFile = {
		kind: REDACTIONS_KIND, schemaVersion: REDACTIONS_SCHEMA_VERSION, applied: opts.redact, entries: allRedactions,
	};
	zip.file("redactions.json", JSON.stringify(redactionsFile, null, 2));
	zip.file("README.txt", ARCHIVE_README);

	const directories: Record<BackupDirKind, string> = {
		system: opts.directories.system ?? DEFAULT_DIR_PATH.system,
		macros: opts.directories.macros ?? DEFAULT_DIR_PATH.macros,
		filaments: opts.directories.filaments ?? DEFAULT_DIR_PATH.filaments,
	};

	const manifest: Manifest = {
		kind: ARCHIVE_KIND,
		schemaVersion: ARCHIVE_SCHEMA_VERSION,
		createdAt: new Date().toISOString(),
		createdBy: { plugin: "FlexibleLayouts", version: opts.pluginVersion, dwcVersion: opts.dwcVersion },
		redacted: opts.redact,
		hashAlgo,
		machine: {
			hostname: opts.machine.hostname,
			name: opts.machine.name,
			machineKey: computeMachineKey(opts.machine),
			firmware: { name: opts.machine.firmwareName, version: opts.machine.firmwareVersion, electronics: opts.machine.electronics },
			boards: opts.machine.boards,
		},
		directories,
		files: manifestFiles,
		skipped: collected.skipped,
		counts: {
			files: manifestFiles.length,
			bytes: manifestFiles.reduce((sum, f) => sum + f.size, 0),
			redactions: allRedactions.length,
			skipped: collected.skipped.length,
		},
	};
	zip.file("manifest.json", JSON.stringify(manifest, null, 2));

	const blob = await zip.generateAsync({
		type: "blob", mimeType: "application/zip", compression: "DEFLATE", compressionOptions: { level: 9 },
	});

	return { blob, manifest, redactions: redactionsFile, sizeBySection };
}

function sanitiseM122(text: string, path: string, mode: SanitiseMode, nextId: () => number) {
	return redactM122(text, mode, path, nextId);
}

// --- Read ----------------------------------------------------------------------------------------

function inferKindFromPath(path: string): BackupDirKind | null {
	for (const kind of BACKUP_DIR_KINDS) {
		if (path.startsWith(`files/${DIR_FOLDER[kind]}/`)) { return kind; }
	}
	return null;
}

/**
 * Parse a backup archive. Tolerant by design: a missing/corrupt `manifest.json` falls back to
 * walking the `files/**` entries directly (kind inferred from the path prefix), and a missing
 * `redactions.json` yields an empty, `applied: false` record - so a hand-edited ZIP still restores.
 */
export async function readArchive(blobOrFile: Blob): Promise<ParsedArchive> {
	const zip = await JSZip.loadAsync(blobOrFile);

	let manifest: Manifest | null = null;
	const manifestEntry = zip.file("manifest.json");
	if (manifestEntry) {
		try {
			const parsed = JSON.parse(await manifestEntry.async("string"));
			if (parsed && parsed.kind === ARCHIVE_KIND) {
				if (typeof parsed.schemaVersion === "number" && parsed.schemaVersion > ARCHIVE_SCHEMA_VERSION) {
					throw new Error(`This backup was created by a newer version of Flexible Layouts (schema ${parsed.schemaVersion}); please update the plugin before restoring it.`);
				}
				manifest = parsed as Manifest;
			}
		} catch (e) {
			if (e instanceof Error && e.message.startsWith("This backup was created")) { throw e; }
			manifest = null; // corrupt manifest.json - fall back to walking files/**
		}
	}

	let redactions: RedactionsFile;
	const redactionsEntry = zip.file("redactions.json");
	if (redactionsEntry) {
		try {
			redactions = JSON.parse(await redactionsEntry.async("string"));
		} catch {
			redactions = { kind: REDACTIONS_KIND, schemaVersion: REDACTIONS_SCHEMA_VERSION, applied: false, entries: [] };
		}
	} else {
		redactions = { kind: REDACTIONS_KIND, schemaVersion: REDACTIONS_SCHEMA_VERSION, applied: false, entries: [] };
	}

	const textFiles = new Map<string, string>();
	const binaryFiles = new Map<string, Blob>();

	if (manifest) {
		for (const f of manifest.files) {
			const entry = zip.file(f.path);
			if (!entry) { continue; }
			if (f.binary) {
				binaryFiles.set(f.path, await entry.async("blob"));
			} else {
				textFiles.set(f.path, await entry.async("string"));
			}
		}
	} else {
		// Fallback: reconstruct a manifest-shaped file list by walking files/** directly.
		const reconstructed: Array<ManifestFile> = [];
		const entries = Object.values(zip.files).filter((e) => !e.dir && e.name.startsWith("files/"));
		for (const entry of entries) {
			const kind = inferKindFromPath(entry.name);
			if (!kind) { continue; }
			const ext = entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase();
			const binary = ["png", "jpg", "jpeg", "gif", "bmp", "ico", "dat"].includes(ext);
			const relativePath = entry.name.slice(`files/${DIR_FOLDER[kind]}/`.length);
			if (binary) {
				binaryFiles.set(entry.name, await entry.async("blob"));
			} else {
				textFiles.set(entry.name, await entry.async("string"));
			}
			reconstructed.push({
				path: entry.name, source: "", kind, size: 0, lastModified: null, binary, redacted: false,
			});
			void relativePath;
		}
		manifest = {
			kind: ARCHIVE_KIND, schemaVersion: ARCHIVE_SCHEMA_VERSION, createdAt: "", redacted: false, hashAlgo: "cyrb53",
			createdBy: { plugin: "unknown", version: "unknown", dwcVersion: "unknown" },
			machine: { hostname: "unknown", name: "unknown", machineKey: "unknown", firmware: { name: "unknown", version: "unknown", electronics: "unknown" }, boards: [] },
			directories: { system: DEFAULT_DIR_PATH.system, macros: DEFAULT_DIR_PATH.macros, filaments: DEFAULT_DIR_PATH.filaments },
			files: reconstructed, skipped: [],
			counts: { files: reconstructed.length, bytes: 0, redactions: 0, skipped: 0 },
		};
	}

	const objectModelEntry = zip.file("object-model.json");
	const readmeEntry = zip.file("README.txt");

	return {
		manifest,
		redactions,
		textFiles,
		binaryFiles,
		objectModelJson: objectModelEntry ? await objectModelEntry.async("string") : null,
		readmeText: readmeEntry ? await readmeEntry.async("string") : null,
	};
}
