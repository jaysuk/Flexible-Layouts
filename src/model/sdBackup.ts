/**
 * Automatic layout backup to the machine's SD card.
 *
 * DWC stores this plugin's layout under its own settings, which get wiped when you switch DWC between
 * (e.g.) 3.6 and 3.7 — taking every custom page/profile with them. A copy we write to the SD card
 * (`0:/sys/…`) is OUR file, untouched by DWC resetting its settings, so it survives that switch and any
 * settings corruption. We write it whenever the user finishes editing (Done), and offer to restore it
 * when the live layout comes up empty but a backup with content exists on the card.
 *
 * The pure helpers (content detection, (de)serialisation) are unit-tested; the read/write/apply
 * functions talk to the (externalised) machine store and are best-effort + silent by design.
 */
import { useMachineStore } from "@/stores/machine";

import { recomputeDependencies } from "./dependencies";
import type { LayoutDocument } from "./document";
import { registerExistingCustomPages, unregisterAllCustomPages } from "./pageManager";
import { replaceAllProfiles, snapshotAllProfiles } from "./store";
import { applyTheme } from "./theme";

const BACKUP_DIR = "0:/sys";
export const BACKUP_PATH = `${BACKUP_DIR}/flexible-layouts.backup.json`;
/** Previous backup, rotated here before each overwrite (one-deep safety net). */
export const BACKUP_BAK_PATH = `${BACKUP_DIR}/flexible-layouts.backup.bak.json`;

const BACKUP_KIND = "flexible-layouts-backup";
const BACKUP_SCHEMA = 1;

export interface FlBackup {
	kind: typeof BACKUP_KIND;
	schemaVersion: number;
	/** Epoch ms the backup was written. */
	savedAt: number;
	activeProfile: string;
	profiles: Record<string, LayoutDocument>;
}

// --- Pure helpers (unit-tested) --------------------------------------------------------------------

/** Whether a single profile holds anything worth preserving (vs a pristine empty layout). */
function profileHasContent(doc: LayoutDocument | undefined): boolean {
	if (!doc) {
		return false;
	}
	for (const page of Object.values(doc.pages ?? {})) {
		if (page && Array.isArray(page.items) && page.items.length > 0) {
			return true;
		}
	}
	if (doc.header?.items?.length) {
		return true;
	}
	if (doc.theme?.enabled || doc.theme?.customColors?.length) {
		return true;
	}
	if (doc.nav && ((doc.nav.hidden?.length ?? 0) > 0 || (doc.nav.order?.length ?? 0) > 0)) {
		return true;
	}
	if (doc.startupPath) {
		return true;
	}
	return false;
}

/**
 * Whether the layout is worth backing up / restoring. More than one profile counts as content (the
 * user deliberately made profiles); otherwise the single profile must hold something.
 */
export function layoutHasContent(profiles: Record<string, LayoutDocument>): boolean {
	const ids = Object.keys(profiles ?? {});
	if (ids.length > 1) {
		return true;
	}
	return ids.some((id) => profileHasContent(profiles[id]));
}

/** Build the backup wrapper for the given profiles. */
export function makeBackup(profiles: Record<string, LayoutDocument>, active: string, savedAt = Date.now()): FlBackup {
	return { kind: BACKUP_KIND, schemaVersion: BACKUP_SCHEMA, savedAt, activeProfile: active, profiles };
}

/** Parse + validate a backup file's text. Returns null for anything that isn't a real FL backup. */
export function parseBackup(text: string): FlBackup | null {
	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		return null;
	}
	if (!obj || typeof obj !== "object") {
		return null;
	}
	const b = obj as Partial<FlBackup>;
	if (b.kind !== BACKUP_KIND || !b.profiles || typeof b.profiles !== "object" || Object.keys(b.profiles).length === 0) {
		return null;
	}
	const active = typeof b.activeProfile === "string" && b.profiles[b.activeProfile]
		? b.activeProfile
		: Object.keys(b.profiles)[0];
	return {
		kind: BACKUP_KIND,
		schemaVersion: typeof b.schemaVersion === "number" ? b.schemaVersion : 1,
		savedAt: typeof b.savedAt === "number" ? b.savedAt : 0,
		activeProfile: active,
		profiles: b.profiles as Record<string, LayoutDocument>,
	};
}

/** Stable change-key over the meaningful payload (ignores savedAt) so unchanged layouts aren't rewritten. */
function payloadKey(profiles: Record<string, LayoutDocument>, active: string): string {
	return JSON.stringify({ a: active, p: profiles });
}

// --- Opt-out + per-backup dismissal (localStorage, mirrors updateCheck) -----------------------------

const ENABLED_KEY = "flexibleLayouts.sdBackup.enabled";
const IGNORED_KEY = "flexibleLayouts.sdBackup.ignoredSavedAt";

function ls(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function isAutoBackupEnabled(): boolean {
	return ls()?.getItem(ENABLED_KEY) !== "0";
}
export function setAutoBackupEnabled(on: boolean): void {
	ls()?.setItem(ENABLED_KEY, on ? "1" : "0");
}
function ignoredSavedAt(): number {
	return Number(ls()?.getItem(IGNORED_KEY) ?? "0") || 0;
}
function setIgnoredSavedAt(at: number): void {
	ls()?.setItem(IGNORED_KEY, String(at));
}

// --- SD read / write / restore (best-effort) -------------------------------------------------------

// The full file (incl. savedAt) and its change-key from the last read/write, so we can (a) skip
// rewriting an unchanged layout and (b) rotate the prior file into .bak before overwriting.
let lastFile: string | null = null;
let lastKey: string | null = null;

async function blobToText(v: unknown): Promise<string> {
	if (typeof v === "string") {
		return v;
	}
	if (v instanceof Blob) {
		return v.text();
	}
	return String(v);
}

export type WriteResult = "written" | "skipped-empty" | "unchanged" | "offline" | "failed";

/** Write the full layout to the SD card. Skips empty layouts and no-op rewrites; rotates a .bak. */
export async function writeBackup(): Promise<WriteResult> {
	const machineStore = useMachineStore();
	if (!machineStore.isConnected) {
		return "offline";
	}
	const { profiles, active } = snapshotAllProfiles();
	if (!layoutHasContent(profiles)) {
		return "skipped-empty"; // never clobber a good backup with a pristine/empty layout
	}
	const key = payloadKey(profiles, active);
	if (key === lastKey) {
		return "unchanged";
	}
	const file = JSON.stringify(makeBackup(profiles, active));
	try {
		if (lastFile) {
			// Best-effort one-deep rotation; a failed rotate must not stop the main write.
			await machineStore.upload({ filename: BACKUP_BAK_PATH, content: new Blob([lastFile], { type: "application/json" }) }, false, false, false)
				.catch(() => { /* ignore */ });
		}
		await machineStore.upload({ filename: BACKUP_PATH, content: new Blob([file], { type: "application/json" }) }, false, false, false);
		lastFile = file;
		lastKey = key;
		return "written";
	} catch {
		return "failed";
	}
}

/** Read the backup from the SD card (null if absent/invalid). Seeds the change-tracking state. */
export async function readBackup(): Promise<FlBackup | null> {
	const machineStore = useMachineStore();
	if (!machineStore.isConnected) {
		return null;
	}
	try {
		// DWC's download() defaults to auto-parsing the response as JSON when a bare filename string is
		// passed (no `type`) - which silently breaks parseBackup() below (it gets "[object Object]"
		// instead of the file's text and fails to parse, indistinguishable from "no backup exists").
		// Requesting `type: "text"` explicitly gets the raw file content back instead.
		const res = await machineStore.download({ filename: BACKUP_PATH, type: "text" }, false, false, false);
		const text = await blobToText(res);
		const parsed = parseBackup(text);
		if (parsed) {
			lastFile = text;
			lastKey = payloadKey(parsed.profiles, parsed.activeProfile);
		}
		return parsed;
	} catch {
		return null; // no file yet / not found
	}
}

/** Apply a backup over the live layout: replace all profiles and re-wire routes/theme/deps. */
export function applyBackup(backup: FlBackup): void {
	unregisterAllCustomPages();
	replaceAllProfiles(JSON.parse(JSON.stringify(backup.profiles)), backup.activeProfile);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
	// The just-restored layout is now the on-disk state; reflect that so the next Done doesn't rewrite it.
	lastKey = payloadKey(backup.profiles, backup.activeProfile);
	lastFile = JSON.stringify(makeBackup(backup.profiles, backup.activeProfile, backup.savedAt));
}

/**
 * Decide whether to offer a restore on load: only when the live layout is empty (settings wiped /
 * corrupt / fresh) AND a backup with content exists that the user hasn't already dismissed.
 */
export async function checkForRestore(): Promise<FlBackup | null> {
	if (layoutHasContent(snapshotAllProfiles().profiles)) {
		return null; // the user already has a layout — don't nag
	}
	const backup = await readBackup();
	if (!backup || !layoutHasContent(backup.profiles)) {
		return null;
	}
	if (backup.savedAt && ignoredSavedAt() >= backup.savedAt) {
		return null; // already declined this exact backup
	}
	return backup;
}

/** Remember that the user declined this backup, so we don't re-prompt for the same one. */
export function dismissRestore(backup: FlBackup): void {
	setIgnoredSavedAt(backup.savedAt || Date.now());
}

// --- Version history (rotating snapshots) ----------------------------------------------------------
//
// The auto-backup above keeps exactly two generations (current + .bak) and exists to survive DWC
// wiping its settings. This is the deliberate, user-facing layer on top: an N-deep ring of dated
// snapshots you can revert to. Same `FlBackup` payload, so a history file and a backup file are the
// same format and `parseBackup`/`applyBackup` serve both.
//
// It lives on the SD card rather than in DWC's settings because the settings blob is rewritten on
// every change and syncs to the card anyway - putting N full layout documents in there would bloat
// every write. On the card it also survives a browser change, which browser-local storage would not.
//
// NOT a per-edit undo: FlexPage.vue keeps a 60-deep in-memory undo for that. These are checkpoints
// (before an import, before a reset, on leaving edit mode, or an explicit "save version").

export const HISTORY_DIR = `${BACKUP_DIR}/flexible-layouts.history`;
export const DEFAULT_HISTORY_LIMIT = 10;

export interface HistoryEntry {
	/** Filename within HISTORY_DIR - the id used to restore this snapshot. */
	name: string;
	savedAt: number;
	/** Free-text label, "" when the snapshot was automatic. */
	label: string;
}

/** Filesystem-safe label: the filename is the source of truth, so this is deliberately lossy. */
function sanitiseLabel(label: string): string {
	return label
		.replace(/[^A-Za-z0-9._-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

/** `<epochMs>.json`, or `<epochMs>-<label>.json` when labelled. */
export function historyFilename(savedAt: number, label = ""): string {
	const safe = sanitiseLabel(label);
	return safe ? `${savedAt}-${safe}.json` : `${savedAt}.json`;
}

/** Inverse of {@link historyFilename}. Null for anything that isn't one of ours. */
export function parseHistoryFilename(name: string): { savedAt: number; label: string } | null {
	const m = /^(\d+)(?:-(.*))?\.json$/.exec(name);
	if (!m) {
		return null;
	}
	const savedAt = Number(m[1]);
	if (!Number.isFinite(savedAt) || savedAt <= 0) {
		return null;
	}
	return { savedAt, label: m[2] ?? "" };
}

/**
 * Which entries to delete to bring the ring down to `limit`, oldest first. Pure so the retention
 * rule is testable without touching a card.
 */
export function selectPrunable(entries: ReadonlyArray<HistoryEntry>, limit = DEFAULT_HISTORY_LIMIT): Array<HistoryEntry> {
	if (limit <= 0) {
		return [...entries];
	}
	const newestFirst = [...entries].sort((a, b) => b.savedAt - a.savedAt);
	return newestFirst.slice(limit);
}

/**
 * The file operations the history ring needs. Injected so the ring can be tested against a fake;
 * `defaultHistoryIO()` is the real, machine-store-backed implementation.
 */
export interface HistoryIO {
	list(dir: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
	read(path: string): Promise<string>;
	write(path: string, text: string): Promise<void>;
	remove(path: string): Promise<void>;
}

export function defaultHistoryIO(): HistoryIO {
	const machineStore = useMachineStore();
	return {
		async list(dir) {
			return machineStore.getFileList(dir) as unknown as Promise<Array<{ name: string; isDirectory: boolean }>>;
		},
		async read(path) {
			// `type: "text"` for the same reason as readBackup() above - without it DWC auto-parses
			// JSON and the caller gets "[object Object]" instead of the file's text.
			return blobToText(await machineStore.download({ filename: path, type: "text" }, false, false, false));
		},
		async write(path, text) {
			await machineStore.upload({ filename: path, content: new Blob([text], { type: "application/json" }) }, false, false, false);
		},
		async remove(path) {
			await machineStore.delete(path);
		},
	};
}

/** Snapshots on the card, newest first. Missing directory / unreadable card yields an empty list. */
export async function listHistory(io: HistoryIO = defaultHistoryIO()): Promise<Array<HistoryEntry>> {
	let files: Array<{ name: string; isDirectory: boolean }>;
	try {
		files = await io.list(HISTORY_DIR);
	} catch {
		return []; // directory doesn't exist yet, or we're offline - both mean "no history"
	}
	const entries: Array<HistoryEntry> = [];
	for (const f of files ?? []) {
		if (f.isDirectory) {
			continue;
		}
		const parsed = parseHistoryFilename(f.name);
		if (parsed) {
			entries.push({ name: f.name, savedAt: parsed.savedAt, label: parsed.label });
		}
	}
	return entries.sort((a, b) => b.savedAt - a.savedAt);
}

export type HistoryWriteResult = "written" | "skipped-empty" | "failed";

/**
 * Snapshot the live layout into the ring, then prune to `limit`. Skips a pristine/empty layout for
 * the same reason writeBackup() does - there's nothing to come back to. A failed prune does NOT
 * fail the write: the snapshot is the valuable half.
 */
export async function writeHistorySnapshot(
	label = "", io: HistoryIO = defaultHistoryIO(), limit = DEFAULT_HISTORY_LIMIT,
): Promise<HistoryWriteResult> {
	const { profiles, active } = snapshotAllProfiles();
	if (!layoutHasContent(profiles)) {
		return "skipped-empty";
	}
	const savedAt = Date.now();
	const backup = makeBackup(profiles, active, savedAt);
	try {
		await io.write(`${HISTORY_DIR}/${historyFilename(savedAt, label)}`, JSON.stringify(backup));
	} catch {
		return "failed";
	}
	await pruneHistory(limit, io).catch(() => 0);
	return "written";
}

/** Delete the oldest snapshots beyond `limit`. Returns how many were removed. */
export async function pruneHistory(limit = DEFAULT_HISTORY_LIMIT, io: HistoryIO = defaultHistoryIO()): Promise<number> {
	const doomed = selectPrunable(await listHistory(io), limit);
	let removed = 0;
	for (const entry of doomed) {
		try {
			await io.remove(`${HISTORY_DIR}/${entry.name}`);
			removed++;
		} catch { /* a file we couldn't delete stays in the ring; not worth failing the caller over */ }
	}
	return removed;
}

export type HistoryRestoreResult = "restored" | "not-found" | "invalid";

/**
 * Revert to a snapshot. The CURRENT layout is snapshotted first, so reverting is itself revertible -
 * without that, one mis-click would be unrecoverable. A failed pre-snapshot aborts the restore
 * rather than proceeding: silently discarding the user's live layout is exactly the outcome the
 * pre-snapshot exists to prevent.
 */
export async function restoreHistorySnapshot(name: string, io: HistoryIO = defaultHistoryIO()): Promise<HistoryRestoreResult> {
	let text: string;
	try {
		text = await io.read(`${HISTORY_DIR}/${name}`);
	} catch {
		return "not-found";
	}
	const backup = parseBackup(text);
	if (!backup) {
		return "invalid";
	}
	const pre = await writeHistorySnapshot("before-restore", io);
	if (pre === "failed") {
		return "not-found"; // couldn't secure the current state - don't overwrite it
	}
	applyBackup(backup);
	return "restored";
}
