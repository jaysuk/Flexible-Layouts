/**
 * Shared types for the config backup/restore feature. See `CONFIG-BACKUP-PLAN.md`.
 */
import type { BackupDirKind } from "./constants";

// --- Manifest -----------------------------------------------------------------------------------

export interface ManifestBoard {
	canAddress: number | null;
	shortName: string;
	firmwareVersion: string;
	/** Present on the mainboard only when reported (Duet 2 boards may report null) - used for machineKey. */
	uniqueId?: string | null;
}

export interface ManifestMachine {
	hostname: string;
	name: string;
	/** Stable per-machine grouping key: `boards[0].uniqueId`, or a cyrb53 fallback hash. */
	machineKey: string;
	firmware: { name: string; version: string; electronics: string };
	boards: Array<ManifestBoard>;
}

export interface ManifestFile {
	/** Path inside the archive, e.g. "files/sys/config.g". */
	path: string;
	/** Path on the machine this file was read from, e.g. "0:/sys/config.g". */
	source: string;
	kind: BackupDirKind;
	size: number;
	sha256?: string;
	lastModified: string | null;
	binary: boolean;
	redacted: boolean;
}

export interface ManifestSkipped {
	source: string;
	kind: BackupDirKind;
	reason: "excluded-extension" | "too-large" | "read-error";
	size?: number;
}

export interface ManifestCounts {
	files: number;
	bytes: number;
	redactions: number;
	skipped: number;
}

export interface Manifest {
	kind: string;
	schemaVersion: number;
	createdAt: string;
	createdBy: { plugin: string; version: string; dwcVersion: string };
	/** false = verbatim (the default). Matches redactions.json's `applied`. */
	redacted: boolean;
	hashAlgo: "sha256" | "cyrb53";
	machine: ManifestMachine;
	directories: Record<BackupDirKind, string>;
	files: Array<ManifestFile>;
	skipped: Array<ManifestSkipped>;
	counts: ManifestCounts;
}

// --- Redactions ----------------------------------------------------------------------------------

export type RedactionTier = 1 | 2 | 3 | 4 | 5;
export type RedactionKind = "gcode-command" | "json-value" | "text-pattern" | "m122-line";
export type RestoreHint = "credential" | "network" | "token" | "opaque";

export interface RedactionEntry {
	/** Matches the `[FL-REDACTED:<id>]` tag in the file (or is looked up via `pointer` for JSON). */
	id: number;
	path: string;
	/** Hint only - the tag (or JSON pointer) is authoritative, this can drift as files are edited. */
	line?: number;
	tier: RedactionTier;
	kind: RedactionKind;
	/**
	 * Real G-code command ("M587"), or a pseudo-code for variable assignments ("GLOBAL" / "VAR") so
	 * repair's live-file lookup can dispatch consistently. Unset for json-value / text-pattern.
	 */
	code?: string;
	/** Parameter letters redacted on this command occurrence (e.g. ["S","P"]), or the variable name. */
	params?: Array<string>;
	/** JSON Pointer (RFC 6901) to the redacted value, for kind "json-value". */
	pointer?: string;
	label: string;
	restoreHint: RestoreHint;
}

export interface RedactionsFile {
	kind: string;
	schemaVersion: number;
	/** false in Verbatim mode: entries were detected but not altered. */
	applied: boolean;
	entries: Array<RedactionEntry>;
}

// --- Collection ----------------------------------------------------------------------------------

export interface CollectedFile {
	/** Machine path, e.g. "0:/sys/config.g". */
	source: string;
	kind: BackupDirKind;
	/** Path relative to the directory root, e.g. "config.g" or "macros/start.g". */
	relativePath: string;
	size: number;
	lastModified: string | null;
	binary: boolean;
	/** Text content (binary files are read separately as Blob during archive assembly). */
	content?: string;
}

export type BackupProgressStage = "listing" | "reading" | "object-model" | "diagnostics" | "packaging";
export type BackupProgressCallback = (stage: BackupProgressStage, done: number, total: number) => void;

export interface BackupScope {
	system: boolean;
	macros: boolean;
	filaments: boolean;
	objectModel: boolean;
	diagnostics: boolean;
}

export interface BackupOptions {
	scope: BackupScope;
	/** "Redact sensitive values" switch (§2.3 Q4) - off by default. */
	redact: boolean;
	maxFileBytes: number;
}

// --- Archive -------------------------------------------------------------------------------------

export interface ParsedArchive {
	manifest: Manifest;
	redactions: RedactionsFile;
	/** path (as in manifest.files[].path) -> raw text content, for every text file. */
	textFiles: Map<string, string>;
	/** path -> Blob, for every binary file. */
	binaryFiles: Map<string, Blob>;
	objectModelJson: string | null;
	readmeText: string | null;
}

// --- Restore ---------------------------------------------------------------------------------------

export type RestoreMode = "merge" | "mirror";

export interface RestorePlanEntry {
	archivePath: string;
	/** Target machine path this file will be written to. */
	targetPath: string;
	kind: BackupDirKind;
	/** "invalid" = the archive path escapes the target directory (traversal) - never written. */
	status: "new" | "overwrite" | "conflict" | "invalid";
	size: number;
	redacted: boolean;
}

export interface RestorePlan {
	mode: RestoreMode;
	entries: Array<RestorePlanEntry>;
	/** Present only in mirror mode: files that will be deleted from the machine. */
	deletions: Array<DeletionCandidate>;
}

export interface DeletionCandidate {
	targetPath: string;
	kind: BackupDirKind;
	size: number;
}

export type DiffSeverity = "info" | "warning" | "danger";

export interface MachineDiffRow {
	label: string;
	backupValue: string;
	liveValue: string;
	severity: DiffSeverity;
}

export interface MachineDiff {
	sameMachine: boolean;
	rows: Array<MachineDiffRow>;
	/** Driver references (M584/M569/M950) in the backup whose board is absent on the live machine. */
	missingDriverRefs: Array<string>;
}

export interface ApplyFileResult {
	targetPath: string;
	status: "written" | "deleted" | "failed";
	error?: string;
}

export interface ApplyRestoreResult {
	results: Array<ApplyFileResult>;
	touchedConfigG: boolean;
}

// --- Repair --------------------------------------------------------------------------------------

export interface RedactionSite {
	entry: RedactionEntry;
	/** Whether the site could be located in the current file text (by tag, JSON pointer, or hint). */
	locatable: boolean;
	/** For gcode-command sites located by tag: the 0-based line index and its current full text. */
	lineIndex?: number;
	currentLine?: string;
}

/**
 * `values` is keyed by parameter letter for multi-param gcode-command entries (e.g. {S:"...",P:"..."}),
 * by the variable name for GLOBAL/VAR entries, or by the fixed key "value" for json-value /
 * text-pattern entries (which have no per-param structure).
 */
export type RepairAction =
	| { type: "keep-live"; values: Record<string, string> }
	| { type: "enter-value"; values: Record<string, string> }
	| { type: "comment-out" }
	| { type: "omit-key" };

export interface RepairDecision {
	entryId: number;
	action: RepairAction;
}
