/**
 * Reads the user's own `0:/sys` and `0:/macros` files and hands them to `dwc-gcode-core`'s `scanImpact` (which decides which lines
 * use something that changed between two firmware versions).
 *
 * Deliberately gentle, because it runs on a printer's SD card behind a web server with a handful of connections:
 *  - never `gcodes/` (print files are not the user's configuration) and never a file over `MAX_FILE_BYTES`;
 *  - only files that can be G-code (`.g` and friends in `sys`, plus extension-less names in `macros`), never images or binaries;
 *  - a few downloads at a time (`CONCURRENCY`), and it stops as soon as `shouldContinue()` says no (the connection dropped, a job
 *    started) - the caller passes "connected and strictly idle";
 *  - an in-memory cache keyed `path|size|lastModified`, so a reconnect or a pre-flight against another release re-reads only what
 *    changed. Memory only, never persisted: file contents do not belong in the shared settings.
 *
 * Parsing runs on the main thread in chunks that yield (core parses at roughly 0.01 ms a line and these are small files); there is no
 * worker on purpose. `parseWorker.ts` is the unrelated geometry parser.
 */
import { buildImpactReport, isScannable, scanFile, type FileScan, type ImpactReport, type ScanFile, type SkipReason } from "dwc-gcode-core";
import type { FileListEntry, MachineIO } from "dwc-config-backup-core";

export const MAX_FILE_BYTES = 1024 * 1024;
export const CONCURRENCY = 3;
/** Directory depth limit below `sys`/`macros` - a runaway tree is not something to walk on an SD card. */
const MAX_DEPTH = 6;
/** How many files are parsed between yields to the UI. */
const PARSE_CHUNK = 8;

const G_CODE_EXTENSIONS: ReadonlySet<string> = new Set(["g", "gcode", "gc", "gco", "nc", "ngc", "macro"]);

export type ScanIO = Pick<MachineIO, "getFileList" | "downloadText">;

export interface MachineDirectories {
	system: string;
	macros: string;
}

export const DEFAULT_DIRECTORIES: MachineDirectories = { system: "0:/sys/", macros: "0:/macros/" };

/** The live `sys`/`macros` directories from the object model, falling back to the defaults. */
export function directoriesOf(model: unknown): MachineDirectories {
	const d = (model as { directories?: Partial<MachineDirectories> } | undefined)?.directories;
	const norm = (p: string | undefined, fallback: string): string => (p ? (p.endsWith("/") ? p : `${p}/`) : fallback);
	return { system: norm(d?.system, DEFAULT_DIRECTORIES.system), macros: norm(d?.macros, DEFAULT_DIRECTORIES.macros) };
}

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Whether a file NAME in `directory` is worth downloading: the file must classify as G-code, and look like it. */
export function isCandidate(path: string, inMacros: boolean): boolean {
	if (!isScannable(path).scan) { return false; }
	const ext = extensionOf(path.slice(path.lastIndexOf("/") + 1));
	return G_CODE_EXTENSIONS.has(ext) || (inMacros && ext === "");
}

interface Listed {
	path: string;
	size: number;
	lastModified: string | null;
}

async function walk(io: ScanIO, dir: string, inMacros: boolean, depth: number, out: Array<Listed>, tooLarge: Array<string>): Promise<void> {
	if (depth > MAX_DEPTH) { return; }
	let entries: Array<FileListEntry>;
	try {
		entries = await io.getFileList(dir);
	} catch {
		return; // a missing directory is normal
	}
	for (const entry of entries) {
		const path = `${dir}${entry.name}`;
		if (entry.isDirectory) {
			await walk(io, `${path}/`, inMacros, depth + 1, out, tooLarge);
			continue;
		}
		if (!isCandidate(path, inMacros)) { continue; }
		const size = Number(entry.size);
		if (size > MAX_FILE_BYTES) { tooLarge.push(path); continue; }
		out.push({ path, size, lastModified: entry.lastModified ? entry.lastModified.toISOString() : null });
	}
}

// --- cache -----------------------------------------------------------------------------------------------------------

const cache = new Map<string, { key: string; text: string }>();

const cacheKey = (f: Listed): string => `${f.path}|${f.size}|${f.lastModified ?? ""}`;

/** Forget everything read so far (a test, or a plugin unload). */
export function clearScanCache(): void { cache.clear(); }

/** The files read by the last successful load, for a pre-flight against another release without touching the machine. */
export function cachedScanFiles(): Array<ScanFile> {
	return [...cache.entries()].map(([path, v]) => ({ path, text: v.text }));
}

// --- loading ---------------------------------------------------------------------------------------------------------

export interface LoadOptions {
	directories?: MachineDirectories;
	/** Checked between every request; return false to stop (connection lost, a job started). */
	shouldContinue?: () => boolean;
	concurrency?: number;
	onProgress?: (done: number, total: number) => void;
}

export interface LoadResult {
	files: Array<ScanFile>;
	/** False when `shouldContinue` stopped the load - the files are then only the ones read so far. */
	complete: boolean;
	/** Files over `MAX_FILE_BYTES`, not read. */
	tooLarge: Array<string>;
	/** Files that could not be downloaded. */
	unreadable: Array<string>;
	/** How many came from the cache without a download. */
	cacheHits: number;
}

export async function loadMachineFiles(io: ScanIO, options: LoadOptions = {}): Promise<LoadResult> {
	const dirs = options.directories ?? DEFAULT_DIRECTORIES;
	const shouldContinue = options.shouldContinue ?? (() => true);
	const listed: Array<Listed> = [];
	const tooLarge: Array<string> = [];
	await walk(io, dirs.system, false, 0, listed, tooLarge);
	if (!shouldContinue()) { return { files: [], complete: false, tooLarge, unreadable: [], cacheHits: 0 }; }
	await walk(io, dirs.macros, true, 0, listed, tooLarge);

	// Drop what is no longer there, so the cache cannot grow past the card.
	const present = new Set(listed.map((f) => f.path));
	for (const path of [...cache.keys()]) { if (!present.has(path)) { cache.delete(path); } }

	const unreadable: Array<string> = [];
	let cacheHits = 0, done = 0, stopped = false;
	const queue = listed.filter((f) => {
		if (cache.get(f.path)?.key === cacheKey(f)) { cacheHits++; return false; }
		return true;
	});
	const total = listed.length;
	done = cacheHits;

	let next = 0;
	async function worker(): Promise<void> {
		while (!stopped) {
			if (!shouldContinue()) { stopped = true; return; }
			const f = queue[next++];
			if (f === undefined) { return; }
			try {
				cache.set(f.path, { key: cacheKey(f), text: await io.downloadText(f.path) });
			} catch {
				unreadable.push(f.path);
				cache.delete(f.path);
			}
			options.onProgress?.(++done, total);
		}
	}
	await Promise.all(Array.from({ length: Math.max(1, Math.min(options.concurrency ?? CONCURRENCY, queue.length || 1)) }, () => worker()));

	const files = listed.filter((f) => cache.has(f.path)).map((f) => ({ path: f.path, text: cache.get(f.path)!.text }));
	return { files, complete: !stopped, tooLarge, unreadable, cacheHits };
}

// --- scanning --------------------------------------------------------------------------------------------------------

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** `scanImpact` in chunks that give the page a turn between them. Same result as `scanImpact(files, ...)`. */
export async function scanFilesYielding(
	files: ReadonlyArray<ScanFile>, from: string, to: string, options: { acknowledged?: ReadonlySet<string> | ReadonlyArray<string> } = {},
): Promise<ImpactReport> {
	const scans: Array<FileScan> = [];
	const skipped: Array<{ path: string; reason: SkipReason }> = [];
	let sinceYield = 0;
	for (const file of files) {
		const verdict = isScannable(file.path);
		if (!verdict.scan) { skipped.push({ path: file.path, reason: verdict.reason }); continue; }
		const scan = scanFile(file, from, to);
		if (scan !== null) { scans.push(scan); }
		if (++sinceYield >= PARSE_CHUNK) { sinceYield = 0; await yieldToUi(); }
	}
	return buildImpactReport(scans, skipped, from, to, options);
}

export interface MachineScan {
	report: ImpactReport;
	load: LoadResult;
}

/** List, read (through the cache) and scan the machine's own files between two versions. `null` if `shouldContinue` stopped it. */
export async function scanMachine(
	io: ScanIO, from: string, to: string, options: LoadOptions & { acknowledged?: ReadonlySet<string> | ReadonlyArray<string> } = {},
): Promise<MachineScan | null> {
	const load = await loadMachineFiles(io, options);
	if (!load.complete) { return null; }
	const report = await scanFilesYielding(load.files, from, to, { acknowledged: options.acknowledged });
	return { report, load };
}
