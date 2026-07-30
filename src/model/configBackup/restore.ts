/**
 * Restore planning (pure) and application (I/O via the injectable MachineIO). See
 * CONFIG-BACKUP-PLAN.md §6 Phase 4. `diagnostics/**` and `object-model.json` are structurally
 * excluded from every restore plan - they're never part of `manifest.files[]`, only ever separate
 * zip entries, so there is nothing here that could ever restore them.
 */
import { computeMachineKey } from "./archive";
import type { MachineIdentity } from "./archive";
import { DIR_FOLDER, MIRROR_DENY_LIST, REDACTED_TAG_RE, REDACTED_VALUE } from "./constants";
import type { BackupDirKind } from "./constants";
import type { MachineIO } from "./collect";
import { detectHashAlgo, hashBytes } from "./hash";
import { isPrintingStatus } from "../../util/printLock";
import type {
	ApplyFileResult, ApplyRestoreResult, DeletionCandidate, DiffSeverity, Manifest, ManifestFile,
	MachineDiff, ParsedArchive, RestoreMode, RestorePlan, RestorePlanEntry,
} from "./types";

export class RestoreBlockedError extends Error {
	constructor(reason: string) { super(reason); this.name = "RestoreBlockedError"; }
}

// --- Path helpers ----------------------------------------------------------------------------------

function ensureTrailingSlash(p: string): string {
	return p.endsWith("/") ? p : `${p}/`;
}

function joinPath(dir: string, rel: string): string {
	return `${ensureTrailingSlash(dir)}${rel}`;
}

/** True if a manifest-recorded relative path could escape its target directory once joined. */
function isTraversal(relativePath: string): boolean {
	if (relativePath.startsWith("/") || relativePath.includes("\\")) { return true; }
	if (/^[A-Za-z]:/.test(relativePath)) { return true; } // drive-letter / RRF volume prefix
	return relativePath.split("/").some((seg) => seg === "..");
}

function relativePathFor(f: Pick<ManifestFile, "path" | "kind">): string {
	const prefix = `files/${DIR_FOLDER[f.kind]}/`;
	return f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path;
}

function isDenyListed(targetPath: string): boolean {
	const base = targetPath.split("/").pop() ?? targetPath;
	return MIRROR_DENY_LIST.has(base);
}

// --- Plan building (pure) --------------------------------------------------------------------------

/**
 * Map selected archive files onto the live machine's directories and classify each as new/overwrite/
 * invalid. `liveExistingPaths` is the set of target paths that already exist on the machine (fetched
 * by the caller so this function stays pure/I/O-free).
 */
export function buildRestorePlan(
	archive: ParsedArchive,
	selection: ReadonlySet<string>,
	liveDirectories: Record<BackupDirKind, string>,
	mode: RestoreMode,
	liveExistingPaths: ReadonlySet<string>,
): RestorePlan {
	const entries: Array<RestorePlanEntry> = [];
	for (const f of archive.manifest.files) {
		if (!selection.has(f.path)) { continue; }
		const relativePath = relativePathFor(f);
		if (isTraversal(relativePath)) {
			entries.push({ archivePath: f.path, targetPath: "", kind: f.kind, status: "invalid", size: f.size, redacted: f.redacted });
			continue;
		}
		const targetPath = joinPath(liveDirectories[f.kind], relativePath);
		const status = liveExistingPaths.has(targetPath) ? "overwrite" : "new";
		entries.push({ archivePath: f.path, targetPath, kind: f.kind, status, size: f.size, redacted: f.redacted });
	}
	return { mode, entries, deletions: [] };
}

// --- Machine comparison (pure) ----------------------------------------------------------------------

const LEADING_CODE_LINE_RE = /^\s*(M584|M569)\b/i;
// M584 driver refs are the VALUE of an axis letter (X0.0, E1.0:1.1, …) with no separator from the
// letter, so a leading \b would never match (a letter and the following digit are both "word"
// characters - there's no boundary between them). Matching the digits.digits shape with no anchor
// on the left works regardless of what precedes it.
const M584_DRIVER_RE = /(\d+)\.\d+/g;
// M569 has other float params (T/V/etc.) that also look like N.N, so its driver ref is restricted to
// specifically the P parameter (`M569 P1.0 …`) rather than a blanket sweep of the whole line.
const M569_DRIVER_RE = /\bP(\d+)\.\d+/i;

function scanDriverBoardRefs(configText: string): Map<number, string> {
	const refs = new Map<number, string>(); // board number -> the code that referenced it
	for (const line of configText.split("\n")) {
		const codeMatch = LEADING_CODE_LINE_RE.exec(line);
		if (!codeMatch) { continue; }
		const code = codeMatch[1].toUpperCase();
		if (code === "M569") {
			const m = M569_DRIVER_RE.exec(line);
			if (m) {
				const board = Number(m[1]);
				if (!refs.has(board)) { refs.set(board, code); }
			}
			continue;
		}
		M584_DRIVER_RE.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = M584_DRIVER_RE.exec(line)) !== null) {
			const board = Number(m[1]);
			if (!refs.has(board)) { refs.set(board, code); }
		}
	}
	return refs;
}

/**
 * Compare a backup's recorded machine against the live machine: identity, board set, firmware, and
 * (best-effort) whether the backup's config.g references CAN boards absent from the live machine -
 * the single most common cross-machine restore breakage after a mainboard swap.
 */
export function compareMachines(backup: Manifest, live: MachineIdentity, backupConfigGText?: string): MachineDiff {
	const liveKey = computeMachineKey(live);
	const sameMachine = backup.machine.machineKey === liveKey;
	const rows: Array<{ label: string; backupValue: string; liveValue: string; severity: DiffSeverity }> = [];

	rows.push({ label: "Hostname", backupValue: backup.machine.hostname, liveValue: live.hostname, severity: "info" });
	rows.push({ label: "Machine name", backupValue: backup.machine.name, liveValue: live.name, severity: "info" });
	rows.push({
		label: "Electronics", backupValue: backup.machine.firmware.electronics, liveValue: live.electronics,
		severity: backup.machine.firmware.electronics === live.electronics ? "info" : "danger",
	});
	rows.push({
		label: "Firmware version", backupValue: backup.machine.firmware.version, liveValue: live.firmwareVersion,
		severity: backup.machine.firmware.version === live.firmwareVersion ? "info" : "warning",
	});
	rows.push({
		label: "Board count", backupValue: String(backup.machine.boards.length), liveValue: String(live.boards.length),
		severity: backup.machine.boards.length === live.boards.length ? "info" : "warning",
	});

	const liveCanAddresses = new Set(live.boards.map((b) => b.canAddress).filter((a): a is number => a != null));
	for (const b of backup.machine.boards) {
		if (b.canAddress == null) { continue; }
		if (!liveCanAddresses.has(b.canAddress)) {
			rows.push({
				label: `CAN board ${b.canAddress} (${b.shortName})`, backupValue: "present in backup", liveValue: "not connected",
				severity: b.canAddress === 0 ? "danger" : "warning",
			});
		}
	}

	const missingDriverRefs: Array<string> = [];
	if (backupConfigGText) {
		const refs = scanDriverBoardRefs(backupConfigGText);
		for (const [board, code] of refs) {
			if (!liveCanAddresses.has(board)) {
				missingDriverRefs.push(`Board ${board} is referenced by ${code} in config.g but is not connected to this machine.`);
			}
		}
	}

	return { sameMachine, rows, missingDriverRefs };
}

// --- Mirror-mode deletion computation (pure) ---------------------------------------------------------

export interface LiveFileRef { targetPath: string; kind: BackupDirKind; size: number }

export interface MirrorDeletionResult {
	deletions: Array<DeletionCandidate>;
	/** Directories eligible for mirroring - i.e. the user selected every file the backup holds for them. */
	mirrorEligibleKinds: ReadonlySet<BackupDirKind>;
}

function relativeToBackupRoot(source: string, backupRoot: string): string | null {
	return source.startsWith(backupRoot) ? source.slice(backupRoot.length) : null;
}

/**
 * Compute which live files Mirror mode would delete. A file is only ever a candidate if: its
 * directory was fully selected (partial selections stay merge-only for that directory), the backup
 * actually covers that directory at all, it isn't something the backup deliberately skipped (D7 /
 * size cap - so firmware .bin etc. are never deleted), and it isn't on the protected deny-list.
 */
export function computeMirrorDeletions(
	liveFiles: ReadonlyArray<LiveFileRef>,
	archive: ParsedArchive,
	selection: ReadonlySet<string>,
	liveDirectories: Record<BackupDirKind, string>,
): MirrorDeletionResult {
	const manifest = archive.manifest;
	const byKind = new Map<BackupDirKind, Array<ManifestFile>>();
	for (const f of manifest.files) {
		if (!byKind.has(f.kind)) { byKind.set(f.kind, []); }
		byKind.get(f.kind)!.push(f);
	}

	const mirrorEligibleKinds = new Set<BackupDirKind>();
	for (const [kind, files] of byKind) {
		if (files.every((f) => selection.has(f.path))) { mirrorEligibleKinds.add(kind); }
	}

	// Every target path the backup "accounts for": files it included, plus files it deliberately
	// skipped (D6/D7) - both must survive a mirror restore untouched.
	const accountedFor = new Set<string>();
	for (const f of manifest.files) {
		accountedFor.add(joinPath(liveDirectories[f.kind], relativePathFor(f)));
	}
	for (const s of manifest.skipped) {
		const backupRoot = manifest.directories[s.kind];
		const rel = relativeToBackupRoot(s.source, backupRoot);
		if (rel != null) {
			accountedFor.add(joinPath(liveDirectories[s.kind], rel));
		}
	}

	const deletions: Array<DeletionCandidate> = [];
	for (const lf of liveFiles) {
		if (!mirrorEligibleKinds.has(lf.kind)) { continue; }
		if (!byKind.has(lf.kind)) { continue; } // the backup never covered this directory at all
		if (isDenyListed(lf.targetPath)) { continue; }
		if (accountedFor.has(lf.targetPath)) { continue; }
		deletions.push({ targetPath: lf.targetPath, kind: lf.kind, size: lf.size });
	}
	return { deletions, mirrorEligibleKinds };
}

// --- Post-write verification (I/O) --------------------------------------------------------------------
//
// A read-back check immediately after each upload, catching a partial/corrupted write over a flaky
// connection to the printer before the user walks away assuming the restore worked. Failures here are
// reported through the normal "failed" result path (see applyRestorePlan) - the upload call itself
// didn't throw, but the content on the machine isn't trustworthy, which is exactly what a restore
// failure should mean to the user.

const VERIFY_MISMATCH_MESSAGE = "Verification failed: the file on the machine doesn't match what was uploaded (possible corrupted/partial write).";

async function verifyTextWrite(io: MachineIO, targetPath: string, expected: string): Promise<void> {
	const actual = await io.downloadText(targetPath);
	if (actual !== expected) { throw new Error(VERIFY_MISMATCH_MESSAGE); }
}

async function verifyBinaryWrite(io: MachineIO, targetPath: string, expected: Blob): Promise<void> {
	const actualBlob = await io.downloadBlob(targetPath);
	if (actualBlob.size !== expected.size) { throw new Error(VERIFY_MISMATCH_MESSAGE); }
	const algo = await detectHashAlgo();
	const [expectedHash, actualHash] = await Promise.all([
		hashBytes(new Uint8Array(await expected.arrayBuffer()), algo),
		hashBytes(new Uint8Array(await actualBlob.arrayBuffer()), algo),
	]);
	if (expectedHash !== actualHash) { throw new Error(VERIFY_MISMATCH_MESSAGE); }
}

// --- Apply (I/O) -------------------------------------------------------------------------------------

export interface ApplyRestoreOptions {
	archive: ParsedArchive;
	plan: RestorePlan;
	/** archivePath -> final text to upload, for files that went through redaction repair. Falls back
	 * to the archive's own (verbatim or still-redacted) content when a path has no override. */
	contentOverrides?: ReadonlyMap<string, string>;
	machineStatus?: string;
	onProgress?: (done: number, total: number) => void;
}

/**
 * Upload every planned entry, then (mirror mode only) delete the computed candidates. Writes always
 * run before deletes, so a failure partway through leaves a superset of the target state rather than
 * a machine missing files it needs to boot. Every text file is re-scanned for a leftover redaction
 * marker immediately before upload - this is the backstop that keeps a broken/unresolved redacted
 * config off the machine even if a UI bug let it through.
 */
export async function applyRestorePlan(io: MachineIO, opts: ApplyRestoreOptions): Promise<ApplyRestoreResult> {
	if (isPrintingStatus(opts.machineStatus)) {
		throw new RestoreBlockedError("Cannot restore while the machine is printing.");
	}

	const writable = opts.plan.entries.filter((e) => e.status !== "invalid");
	const total = writable.length + opts.plan.deletions.length;
	let done = 0;
	const results: Array<ApplyFileResult> = [];
	let touchedConfigG = false;

	for (const entry of opts.plan.entries) {
		if (entry.status === "invalid") {
			results.push({ targetPath: entry.archivePath, status: "failed", error: "Rejected: path would escape the target directory." });
			continue;
		}
		try {
			const isBinary = opts.archive.binaryFiles.has(entry.archivePath);
			if (isBinary) {
				const blob = opts.archive.binaryFiles.get(entry.archivePath)!;
				await io.upload(entry.targetPath, blob);
				await verifyBinaryWrite(io, entry.targetPath, blob);
			} else {
				const text = opts.contentOverrides?.get(entry.archivePath) ?? opts.archive.textFiles.get(entry.archivePath) ?? "";
				if (text.includes(REDACTED_VALUE) || REDACTED_TAG_RE.test(text)) {
					throw new Error("File still contains an unresolved redacted value; resolve it in the repair step before restoring.");
				}
				await io.upload(entry.targetPath, new Blob([text], { type: "text/plain" }));
				await verifyTextWrite(io, entry.targetPath, text);
				if (entry.targetPath.toLowerCase().endsWith("/config.g")) { touchedConfigG = true; }
			}
			results.push({ targetPath: entry.targetPath, status: "written" });
		} catch (e) {
			results.push({ targetPath: entry.targetPath, status: "failed", error: e instanceof Error ? e.message : String(e) });
		}
		done++;
		opts.onProgress?.(done, total);
	}

	for (const del of opts.plan.deletions) {
		try {
			await io.deleteFile(del.targetPath, false);
			results.push({ targetPath: del.targetPath, status: "deleted" });
		} catch (e) {
			results.push({ targetPath: del.targetPath, status: "failed", error: e instanceof Error ? e.message : String(e) });
		}
		done++;
		opts.onProgress?.(done, total);
	}

	return { results, touchedConfigG };
}
