/**
 * Collection: walks the machine's directories, reads file content, and captures the object-model
 * dump + M122 diagnostics. All machine I/O goes through the injectable `MachineIO` interface so this
 * module is unit-testable without a running DWC (the shared dwc-plugin-test-kit's machine stub only
 * implements `getFileList`/`sendCode`, not `download`/`upload`/`delete` - see CONFIG-BACKUP-PLAN.md).
 * `defaultMachineIO()` is the real, DWC-backed implementation used outside tests.
 */
import { useMachineStore } from "@/stores/machine";

import { sanitizeModel } from "dwc-plugin-runtime";

import { BACKUP_DIR_KINDS, BINARY_EXTENSIONS, DEFAULT_DIR_PATH, EXCLUDED_EXTENSIONS, MAX_WALK_DEPTH } from "./constants";
import type { BackupDirKind } from "./constants";
import type { BackupProgressCallback, BackupScope, CollectedFile, ManifestBoard, ManifestSkipped } from "./types";

// --- Machine I/O abstraction -------------------------------------------------------------------------

export interface FileListEntry {
	isDirectory: boolean;
	name: string;
	size: number | bigint;
	lastModified: Date | null;
}

export interface MachineIO {
	getFileList(directory: string): Promise<Array<FileListEntry>>;
	downloadText(filename: string): Promise<string>;
	downloadBlob(filename: string): Promise<Blob>;
	upload(filename: string, content: Blob): Promise<void>;
	deleteFile(filename: string, recursive?: boolean): Promise<void>;
	sendCode(code: string): Promise<string>;
}

/** Real machine I/O, wired to the (externalised) DWC machine store. All calls fully silent (D per house rules). */
export function defaultMachineIO(): MachineIO {
	const machineStore = useMachineStore();
	return {
		async getFileList(directory) {
			return machineStore.getFileList(directory) as unknown as Promise<Array<FileListEntry>>;
		},
		async downloadText(filename) {
			return (await machineStore.download({ filename, type: "text" }, false, false, false, false)) as string;
		},
		async downloadBlob(filename) {
			return (await machineStore.download({ filename, type: "blob" }, false, false, false, false)) as Blob;
		},
		async upload(filename, content) {
			await machineStore.upload({ filename, content }, false, false, false, false);
		},
		async deleteFile(filename, recursive) {
			await machineStore.delete(filename, recursive);
		},
		async sendCode(code) {
			return machineStore.sendCode(code, false, false);
		},
	};
}

// --- Directory walking -----------------------------------------------------------------------------

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export interface WalkOptions {
	maxFileBytes: number;
	maxDepth?: number;
}

export interface WalkResult {
	files: Array<{ source: string; relativePath: string; size: number; lastModified: string | null; binary: boolean }>;
	skipped: Array<ManifestSkipped>;
}

async function walkRec(
	io: MachineIO, dirPath: string, relBase: string, kind: BackupDirKind, opts: WalkOptions, depth: number, result: WalkResult,
): Promise<void> {
	if (depth > (opts.maxDepth ?? MAX_WALK_DEPTH)) {
		return;
	}
	let entries: Array<FileListEntry>;
	try {
		entries = await io.getFileList(dirPath);
	} catch {
		return; // a missing directory (e.g. no 0:/filaments/) is normal, not an error
	}
	for (const entry of entries) {
		const relativePath = relBase ? `${relBase}/${entry.name}` : entry.name;
		const source = `${dirPath}${entry.name}`;
		if (entry.isDirectory) {
			await walkRec(io, `${source}/`, relativePath, kind, opts, depth + 1, result);
			continue;
		}
		const ext = extensionOf(entry.name);
		const size = Number(entry.size);
		if (EXCLUDED_EXTENSIONS.has(ext)) {
			result.skipped.push({ source, kind, reason: "excluded-extension", size });
			continue;
		}
		if (size > opts.maxFileBytes) {
			result.skipped.push({ source, kind, reason: "too-large", size });
			continue;
		}
		result.files.push({
			source, relativePath, size,
			lastModified: entry.lastModified ? entry.lastModified.toISOString() : null,
			binary: BINARY_EXTENSIONS.has(ext),
		});
	}
}

/** Recursively list one backup directory, honouring the exclusion rules (D6/D7). */
export async function walkDirectory(io: MachineIO, root: string, kind: BackupDirKind, opts: WalkOptions): Promise<WalkResult> {
	const result: WalkResult = { files: [], skipped: [] };
	const normalisedRoot = root.endsWith("/") ? root : `${root}/`;
	await walkRec(io, normalisedRoot, "", kind, opts, 0, result);
	return result;
}

/** Walk + read every file under one directory kind. Read failures are recorded as skips, not thrown. */
export async function collectDirectoryFiles(
	io: MachineIO, kind: BackupDirKind, root: string, opts: WalkOptions,
): Promise<{ files: Array<CollectedFile>; skipped: Array<ManifestSkipped> }> {
	const walk = await walkDirectory(io, root, kind, opts);
	const files: Array<CollectedFile> = [];
	for (const f of walk.files) {
		try {
			const content = f.binary ? await blobToBase64(await io.downloadBlob(f.source)) : await io.downloadText(f.source);
			files.push({ source: f.source, kind, relativePath: f.relativePath, size: f.size, lastModified: f.lastModified, binary: f.binary, content });
		} catch {
			walk.skipped.push({ source: f.source, kind, reason: "read-error", size: f.size });
		}
	}
	return { files, skipped: walk.skipped };
}

async function blobToBase64(blob: Blob): Promise<string> {
	const buf = await blob.arrayBuffer();
	const bytes = new Uint8Array(buf);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

// --- Object model dump -------------------------------------------------------------------------------

function mapAwareReplacer(_key: string, value: unknown): unknown {
	return value instanceof Map ? Object.fromEntries(value as Map<string, unknown>) : value;
}

/** Sanitised, pretty-printed object-model dump. Always sanitised (Tier 6, §3.6) regardless of the
 * backup's redact switch - it never gets restored to a machine, and it shares the privacy scrubber
 * used by every plugin's diagnostics reports. */
export function collectObjectModel(model: unknown): string {
	return JSON.stringify(sanitizeModel(model), mapAwareReplacer, 2);
}

// --- M122 diagnostics -------------------------------------------------------------------------------

const M122_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), ms);
		promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
	});
}

export interface DiagnosticsCapture {
	mainboard: string;
	/** One entry per CAN-FD board (canAddress != null && != 0), in the order boards[] lists them. */
	canBoards: Array<{ canAddress: number; text: string }>;
}

/** Capture M122 for the mainboard, then `M122 B<n>` for each CAN-FD board, sequentially. A failed
 * board's reply is replaced with the error text rather than aborting the whole capture. */
export async function collectDiagnostics(io: MachineIO, boards: Array<Pick<ManifestBoard, "canAddress">>): Promise<DiagnosticsCapture> {
	let mainboard: string;
	try {
		mainboard = await withTimeout(io.sendCode("M122"), M122_TIMEOUT_MS, "M122 timed out");
	} catch (e) {
		mainboard = `Failed to capture M122: ${e instanceof Error ? e.message : String(e)}`;
	}
	const canBoards: Array<{ canAddress: number; text: string }> = [];
	for (const b of boards) {
		if (b.canAddress == null || b.canAddress === 0) {
			continue;
		}
		let text: string;
		try {
			text = await withTimeout(io.sendCode(`M122 B${b.canAddress}`), M122_TIMEOUT_MS, `M122 B${b.canAddress} timed out`);
		} catch (e) {
			text = `Failed to capture M122 B${b.canAddress}: ${e instanceof Error ? e.message : String(e)}`;
		}
		canBoards.push({ canAddress: b.canAddress, text });
	}
	return { mainboard, canBoards };
}

// --- Orchestration -----------------------------------------------------------------------------------

export interface CollectAllResult {
	files: Array<CollectedFile>;
	skipped: Array<ManifestSkipped>;
	objectModelJson: string | null;
	diagnostics: DiagnosticsCapture | null;
}

interface CollectAllOptions {
	scope: BackupScope;
	maxFileBytes: number;
	directories: Partial<Record<BackupDirKind, string>>;
	model: unknown;
	boards: Array<Pick<ManifestBoard, "canAddress">>;
	onProgress?: BackupProgressCallback;
}

/** Run the full collection pass according to the backup scope, reporting progress as it goes. */
export async function collectAll(io: MachineIO, opts: CollectAllOptions): Promise<CollectAllResult> {
	const files: Array<CollectedFile> = [];
	const skipped: Array<ManifestSkipped> = [];
	const scopeKinds = BACKUP_DIR_KINDS.filter((k) => opts.scope[k]);

	scopeKinds.forEach((_kind, i) => opts.onProgress?.("listing", i, scopeKinds.length));
	for (let i = 0; i < scopeKinds.length; i++) {
		const kind = scopeKinds[i];
		opts.onProgress?.("reading", i, scopeKinds.length);
		const root = opts.directories[kind] ?? DEFAULT_DIR_PATH[kind];
		const result = await collectDirectoryFiles(io, kind, root, { maxFileBytes: opts.maxFileBytes });
		files.push(...result.files);
		skipped.push(...result.skipped);
	}

	let objectModelJson: string | null = null;
	if (opts.scope.objectModel) {
		opts.onProgress?.("object-model", 0, 1);
		objectModelJson = collectObjectModel(opts.model);
		opts.onProgress?.("object-model", 1, 1);
	}

	let diagnostics: DiagnosticsCapture | null = null;
	if (opts.scope.diagnostics) {
		opts.onProgress?.("diagnostics", 0, 1);
		diagnostics = await collectDiagnostics(io, opts.boards);
		opts.onProgress?.("diagnostics", 1, 1);
	}

	opts.onProgress?.("packaging", 0, 1);
	return { files, skipped, objectModelJson, diagnostics };
}
