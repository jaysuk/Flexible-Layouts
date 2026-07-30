/**
 * Local (browser-only) storage for config-backup destination settings and credentials (§6 Phase 5).
 *
 * Deliberately `localStorage`, NEVER the DWC settings store: settings sync to the SD card and are
 * carried in layout export/import - a credential must never end up in either. For the same reason,
 * NONE of these keys may ever be included in a diagnostics report (FL's diagnosticReport() in
 * FlexSettingsTab.vue passes an explicit `state` object - never spread `localStorage` into it, and
 * never add a `configBackup.*` key to what it captures).
 *
 * Tokens stored here are readable by anything with devtools access on this machine, same as any
 * browser-stored credential - the UI must say so plainly, matching the honesty of the access-level
 * warning elsewhere in this plugin. **Optional encryption** (below) narrows that: with it enabled,
 * what's actually sitting in localStorage is AES-GCM ciphertext, unreadable without the passphrase
 * (which is never itself stored - see the "Encryption" section).
 *
 * IMPORTANT: `crypto.subtle` (what encryption needs) requires a secure context (HTTPS or localhost)
 * in every real browser - the same restriction that blocks Google Drive elsewhere in this plugin.
 * Most Duets are plain HTTP, so encryption will often be unavailable for the same reason Drive is;
 * `isEncryptionAvailable()` detects this and the UI must degrade honestly, not silently.
 */
import { decryptValue, deriveKey, encryptValue, generateSalt, isCryptoAvailable, saltFromBase64, saltToBase64 } from "./encryption";
import type { EncryptedValue } from "./encryption";
import { DUET_BACKUP_API_DEFAULT } from "./constants";

const NS = "flexibleLayouts.configBackup";

/** Minimal Storage-shaped fallback for environments where `window.localStorage` exists but is
 * unusable (some private-browsing modes throw on write; the Vitest/Node test environment used here
 * has also been observed to expose a non-functional stub). In-memory only - lost on reload, which is
 * an acceptable degradation for a browser that can't persist anything anyway. */
function makeMemoryStorage(): Storage {
	const store = new Map<string, string>();
	return {
		getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
		setItem: (k: string, v: string) => { store.set(k, v); },
		removeItem: (k: string) => { store.delete(k); },
		clear: () => { store.clear(); },
		key: (i: number) => Array.from(store.keys())[i] ?? null,
		get length() { return store.size; },
	} as Storage;
}

let memoryFallback: Storage | null = null;

function ls(): Storage | null {
	try {
		const real = window.localStorage;
		if (real && typeof real.setItem === "function" && typeof real.getItem === "function") {
			return real;
		}
	} catch {
		// fall through to the in-memory fallback below
	}
	if (!memoryFallback) { memoryFallback = makeMemoryStorage(); }
	return memoryFallback;
}

/** Test-only: wipe whichever store `ls()` is actually backed by (real or in-memory-fallback) and
 * reset the in-memory session/cache state. A plain `window.localStorage.clear()` in a test's
 * `beforeEach` is NOT enough by itself - when the real localStorage is unusable (observed in this
 * repo's Vitest/happy-dom environment; see the `ls()` fallback above) it's silently a no-op against
 * whichever memory-backed store this module is actually using internally. */
export function resetForTests(): void {
	try { window.localStorage.clear(); } catch { /* fall through */ }
	memoryFallback = null;
	sessionKey = null;
	decryptedCache = null;
}

// --- Encryption -----------------------------------------------------------------------------------
//
// Off by default. When on, every key in ENCRYPTABLE_KEYS is stored as ciphertext; the AES key is
// derived from a passphrase that is NEVER persisted anywhere, only held in memory (`sessionKey`) for
// the current browser session - a reload always re-locks. Getters/setters below stay SYNCHRONOUS
// (matching their pre-encryption signatures, so no call site elsewhere in the plugin needs to
// change) by working against an in-memory plaintext cache that's populated in one batch on unlock,
// rather than decrypting per-field on every read.

const ENC_ENABLED_KEY = `${NS}.encryption.enabled`;
const ENC_SALT_KEY = `${NS}.encryption.salt`;
/** An encrypted known-plaintext ("ok"), so unlock() can verify a passphrase without needing any real
 * credential to already exist (e.g. right after enabling encryption with nothing saved yet). */
const ENC_CANARY_KEY = `${NS}.encryption.canary`;
const CANARY_PLAINTEXT = "ok";

/** Every localStorage suffix (under `${NS}.`) that carries real credential material, and therefore
 * gets encrypted when encryption is on. Preference-only keys (redact toggles, the FIFO limit) are
 * deliberately excluded - nothing sensitive in them, no reason to gate them behind a passphrase. */
const ENCRYPTABLE_SUFFIXES = ["duet.session", "github", "drive.clientId", "dropbox", "webdav"] as const;

let sessionKey: CryptoKey | null = null;
/** Populated in one batch by unlockSession()/enableEncryption(); cleared by lockSession(). */
let decryptedCache: Map<string, unknown> | null = null;

export function isEncryptionAvailable(): boolean {
	return isCryptoAvailable();
}
export function isEncryptionEnabled(): boolean {
	return ls()?.getItem(ENC_ENABLED_KEY) === "1";
}
export function isSessionUnlocked(): boolean {
	return sessionKey != null;
}
export function lockSession(): void {
	sessionKey = null;
	decryptedCache = null;
}

async function decryptAllInto(cache: Map<string, unknown>, key: CryptoKey): Promise<void> {
	for (const suffix of ENCRYPTABLE_SUFFIXES) {
		const raw = ls()?.getItem(`${NS}.${suffix}`);
		if (!raw) { continue; }
		try {
			const enc = JSON.parse(raw) as EncryptedValue;
			const plaintext = await decryptValue(key, enc);
			cache.set(suffix, JSON.parse(plaintext));
		} catch {
			// corrupt entry or (shouldn't happen once canary-verified) wrong key - skip that one field
		}
	}
}

/** Verify `passphrase` against the stored canary and, if correct, unlock the session (decrypting
 * every stored credential into memory in one batch). Returns false on a wrong passphrase or if
 * encryption was never enabled - never throws for a bad guess, that's an expected outcome here. */
export async function unlockSession(passphrase: string): Promise<boolean> {
	if (!isCryptoAvailable()) { return false; }
	const saltB64 = ls()?.getItem(ENC_SALT_KEY);
	const canaryRaw = ls()?.getItem(ENC_CANARY_KEY);
	if (!saltB64 || !canaryRaw) { return false; }
	const key = await deriveKey(passphrase, saltFromBase64(saltB64));
	try {
		const decoded = await decryptValue(key, JSON.parse(canaryRaw) as EncryptedValue);
		if (decoded !== CANARY_PLAINTEXT) { return false; }
	} catch {
		return false; // wrong passphrase - AES-GCM's auth tag failed to verify
	}
	sessionKey = key;
	const cache = new Map<string, unknown>();
	await decryptAllInto(cache, key);
	decryptedCache = cache;
	return true;
}

async function persistEncrypted(suffix: string, value: unknown): Promise<void> {
	if (!sessionKey) { return; } // shouldn't happen - callers must gate writes on isSessionUnlocked()
	const encrypted = await encryptValue(sessionKey, JSON.stringify(value));
	ls()?.setItem(`${NS}.${suffix}`, JSON.stringify(encrypted));
}

/** Turn encryption on: derive a fresh key from `passphrase`, re-encrypt every credential currently
 * stored in plaintext, and unlock the session with the new key. Throws if `crypto.subtle` isn't
 * available (plain-HTTP origin in most browsers - see the module doc comment) - callers must check
 * `isEncryptionAvailable()` first and explain, not let this throw reach the user unexplained. */
export async function enableEncryption(passphrase: string): Promise<void> {
	if (!isCryptoAvailable()) { throw new Error("Encryption isn't available on this connection (requires HTTPS or localhost)."); }
	// Snapshot whatever's currently stored in plaintext BEFORE writing the salt/canary, so a
	// concurrent read mid-migration can't see a half-encrypted, half-plaintext state.
	const plaintextSnapshot = new Map<string, unknown>();
	for (const suffix of ENCRYPTABLE_SUFFIXES) {
		const raw = ls()?.getItem(`${NS}.${suffix}`);
		if (!raw) { continue; }
		try { plaintextSnapshot.set(suffix, JSON.parse(raw)); } catch { /* already-corrupt value - drop it */ }
	}
	const salt = generateSalt();
	const key = await deriveKey(passphrase, salt);
	const canary = await encryptValue(key, CANARY_PLAINTEXT);
	ls()?.setItem(ENC_SALT_KEY, saltToBase64(salt));
	ls()?.setItem(ENC_CANARY_KEY, JSON.stringify(canary));
	sessionKey = key;
	const cache = new Map<string, unknown>();
	for (const [suffix, value] of plaintextSnapshot) {
		await persistEncrypted(suffix, value);
		cache.set(suffix, value);
	}
	decryptedCache = cache;
	ls()?.setItem(ENC_ENABLED_KEY, "1");
}

/** Turn encryption off: decrypt everything back to plaintext storage. Requires the session to
 * already be unlocked (the UI must unlock before offering this). */
export async function disableEncryption(): Promise<void> {
	if (!sessionKey || !decryptedCache) { throw new Error("Unlock first."); }
	for (const suffix of ENCRYPTABLE_SUFFIXES) {
		const value = decryptedCache.get(suffix);
		if (value === undefined) { ls()?.removeItem(`${NS}.${suffix}`); continue; }
		ls()?.setItem(`${NS}.${suffix}`, JSON.stringify(value));
	}
	ls()?.removeItem(ENC_ENABLED_KEY);
	ls()?.removeItem(ENC_SALT_KEY);
	ls()?.removeItem(ENC_CANARY_KEY);
	sessionKey = null;
	decryptedCache = null;
}

// --- Generic get/set, encryption-aware -----------------------------------------------------------

function isEncryptable(suffix: string): boolean {
	return (ENCRYPTABLE_SUFFIXES as readonly string[]).includes(suffix);
}

function getJson<T>(suffix: string): T | null {
	if (isEncryptable(suffix) && isEncryptionEnabled()) {
		if (!decryptedCache) { return null; } // locked - callers see "not configured" until unlocked
		const cached = decryptedCache.get(suffix);
		return cached === undefined ? null : (cached as T);
	}
	const raw = ls()?.getItem(`${NS}.${suffix}`);
	if (!raw) { return null; }
	try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Synchronous by design (see the module doc comment) - when encryption is on, this updates the
 * in-memory cache immediately and persists the encrypted form in the background. Silently no-ops if
 * encryption is on but the session is locked; UI must gate save actions on `isSessionUnlocked()`. */
function setJson(suffix: string, value: unknown | null): void {
	if (isEncryptable(suffix) && isEncryptionEnabled()) {
		if (!sessionKey || !decryptedCache) { return; }
		if (value == null) { decryptedCache.delete(suffix); ls()?.removeItem(`${NS}.${suffix}`); return; }
		decryptedCache.set(suffix, value);
		void persistEncrypted(suffix, value);
		return;
	}
	if (value == null) { ls()?.removeItem(`${NS}.${suffix}`); return; }
	ls()?.setItem(`${NS}.${suffix}`, JSON.stringify(value));
}

// --- Per-destination "redact sensitive values" preference (§2.3 Q4 - default off, remembered per destination)

export type BackupDestinationId = "local" | "duet" | "github" | "drive" | "dropbox" | "webdav";

export function getRedactPreference(destination: BackupDestinationId): boolean {
	return ls()?.getItem(`${NS}.redact.${destination}`) === "1";
}
export function setRedactPreference(destination: BackupDestinationId, on: boolean): void {
	ls()?.setItem(`${NS}.redact.${destination}`, on ? "1" : "0");
}

/** Whether the user has already acknowledged sending an unredacted backup to this destination once. */
export function hasAcknowledgedUnredacted(destination: BackupDestinationId): boolean {
	return ls()?.getItem(`${NS}.unredactedAck.${destination}`) === "1";
}
export function setAcknowledgedUnredacted(destination: BackupDestinationId): void {
	ls()?.setItem(`${NS}.unredactedAck.${destination}`, "1");
}

// --- Last backup timestamp (for the "last backup was N days ago" reminder) -----------------------------
//
// Plain metadata, not a credential - never encrypted, never gated behind isEncryptionEnabled().

export function getLastBackupAt(): string | null {
	return ls()?.getItem(`${NS}.lastBackupAt`) ?? null;
}
export function setLastBackupAt(iso: string): void {
	ls()?.setItem(`${NS}.lastBackupAt`, iso);
}

// --- Automatic backup nudges (§ auto-backup triggers) -------------------------------------------------
//
// "Automatic" here always means a one-click reminder, never a silent upload/download - the user chose
// this explicitly (2026-07 session) after being shown the alternative (silent local, silent to a
// configured destination). Plain metadata/preferences, never encrypted.

export interface AutoBackupNudgeSettings {
	configSaved: boolean;
	overdue: boolean;
	overdueDays: number;
	newMachine: boolean;
}
const DEFAULT_NUDGE_SETTINGS: AutoBackupNudgeSettings = { configSaved: true, overdue: true, overdueDays: 7, newMachine: true };

export function getAutoBackupNudgeSettings(): AutoBackupNudgeSettings {
	const raw = ls()?.getItem(`${NS}.autoNudge`);
	if (!raw) { return { ...DEFAULT_NUDGE_SETTINGS }; }
	try { return { ...DEFAULT_NUDGE_SETTINGS, ...(JSON.parse(raw) as Partial<AutoBackupNudgeSettings>) }; } catch { return { ...DEFAULT_NUDGE_SETTINGS }; }
}
export function setAutoBackupNudgeSettings(settings: AutoBackupNudgeSettings): void {
	ls()?.setItem(`${NS}.autoNudge`, JSON.stringify(settings));
}

/** Every machine key a backup has ever been taken for, from this browser - used to detect "this
 * machine has never been backed up" without confusing it with "no backup has ever been taken at all"
 * (the latter is covered by the overdue nudge instead, so the two don't fire redundantly together). */
export function getBackedUpMachineKeys(): Array<string> {
	const raw = ls()?.getItem(`${NS}.backedUpMachineKeys`);
	if (!raw) { return []; }
	try { return JSON.parse(raw) as Array<string>; } catch { return []; }
}
export function addBackedUpMachineKey(key: string): void {
	const keys = new Set(getBackedUpMachineKeys());
	keys.add(key);
	ls()?.setItem(`${NS}.backedUpMachineKeys`, JSON.stringify(Array.from(keys)));
}

// --- Duet backup service -----------------------------------------------------------------------------

export interface DuetCloudSession { token: string; username: string; expiresAt: number }

export function getDuetCloudSession(): DuetCloudSession | null {
	const session = getJson<DuetCloudSession>("duet.session");
	if (session && session.expiresAt > Date.now()) { return session; }
	return null;
}
export function setDuetCloudSession(session: DuetCloudSession | null): void {
	setJson("duet.session", session);
}

/** Hardcoded to the shared production Duet backup service - deliberately not user-configurable, never
 * shown or editable in the UI (unlike every other destination's settings). */
export function getDuetCloudApiUrl(): string {
	return DUET_BACKUP_API_DEFAULT;
}

export function getDuetCloudFifoLimit(): number {
	const raw = Number(ls()?.getItem(`${NS}.duet.fifoLimit`));
	return Number.isFinite(raw) && raw > 0 ? raw : 5;
}
export function setDuetCloudFifoLimit(limit: number): void {
	ls()?.setItem(`${NS}.duet.fifoLimit`, String(limit));
}

// --- GitHub -------------------------------------------------------------------------------------------

export interface GithubSettings {
	token: string;
	repo: string;
	branch: string;
	/** Overrides the auto-detected hostname as the `machines/<name>/…` folder for this machine's
	 * GitHub backups. Blank/unset falls back to the live machine's hostname at backup time. */
	machineName?: string;
}

export function getGithubSettings(): GithubSettings | null {
	return getJson<GithubSettings>("github");
}
export function setGithubSettings(settings: GithubSettings | null): void {
	setJson("github", settings);
}

// --- Google Drive --------------------------------------------------------------------------------------

/** Only the OAuth CLIENT ID is persisted - the access token itself is memory-only (§6 Phase 8). */
export function getGoogleDriveClientId(): string | null {
	return getJson<string>("drive.clientId");
}
export function setGoogleDriveClientId(clientId: string): void {
	setJson("drive.clientId", clientId);
}

// --- Dropbox -------------------------------------------------------------------------------------------

/** A long-lived access token generated directly in the Dropbox App Console - no interactive OAuth
 * redirect, so (unlike Google Drive) this works fine from a plain-HTTP DWC origin. */
export interface DropboxSettings { token: string }

export function getDropboxSettings(): DropboxSettings | null {
	return getJson<DropboxSettings>("dropbox");
}
export function setDropboxSettings(settings: DropboxSettings | null): void {
	setJson("dropbox", settings);
}

// --- WebDAV (Nextcloud / ownCloud / Synology / any WebDAV server) --------------------------------------

export interface WebDavSettings { url: string; username: string; password: string }

export function getWebDavSettings(): WebDavSettings | null {
	return getJson<WebDavSettings>("webdav");
}
export function setWebDavSettings(settings: WebDavSettings | null): void {
	setJson("webdav", settings);
}

// --- Raw encrypted export (SD sync uses this - see credentialsSdSync.ts) ------------------------------

/** The raw encrypted blob for a key (ciphertext only, no decryption) - used to copy credentials to/
 * from the printer's SD card without ever needing the passphrase on the writing/reading path itself
 * (the receiving browser still needs the correct passphrase to actually unlock and use them). */
export interface EncryptedCredentialBundle {
	salt: string;
	canary: EncryptedValue;
	values: Partial<Record<typeof ENCRYPTABLE_SUFFIXES[number], EncryptedValue>>;
}

export function exportEncryptedBundle(): EncryptedCredentialBundle | null {
	if (!isEncryptionEnabled()) { return null; }
	const saltB64 = ls()?.getItem(ENC_SALT_KEY);
	const canaryRaw = ls()?.getItem(ENC_CANARY_KEY);
	if (!saltB64 || !canaryRaw) { return null; }
	const values: EncryptedCredentialBundle["values"] = {};
	for (const suffix of ENCRYPTABLE_SUFFIXES) {
		const raw = ls()?.getItem(`${NS}.${suffix}`);
		if (!raw) { continue; }
		try { values[suffix] = JSON.parse(raw) as EncryptedValue; } catch { /* skip corrupt entry */ }
	}
	return { salt: saltB64, canary: JSON.parse(canaryRaw) as EncryptedValue, values };
}

/** Import an encrypted bundle (from the printer's SD card, or another browser) wholesale. This does
 * NOT decrypt or verify anything - it's a raw ciphertext copy, so the passphrase from wherever the
 * bundle came from is still required afterwards to unlock it here. Overwrites any encrypted
 * credentials already stored locally. */
export function importEncryptedBundle(bundle: EncryptedCredentialBundle): void {
	ls()?.setItem(ENC_SALT_KEY, bundle.salt);
	ls()?.setItem(ENC_CANARY_KEY, JSON.stringify(bundle.canary));
	for (const suffix of ENCRYPTABLE_SUFFIXES) {
		const value = bundle.values[suffix];
		if (value) { ls()?.setItem(`${NS}.${suffix}`, JSON.stringify(value)); }
	}
	ls()?.setItem(ENC_ENABLED_KEY, "1");
	sessionKey = null; // still locked - the bundle's passphrase must be entered to use it
	decryptedCache = null;
}
