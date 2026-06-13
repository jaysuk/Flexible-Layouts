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
		const res = await machineStore.download(BACKUP_PATH, false, false, false);
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
