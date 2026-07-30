/**
 * Local (browser-only) storage for this feature's own small bits of state: the cached certificate
 * expiry date (recorded whenever this dialog successfully uploads a cert - the only reliable source,
 * since on WiFi the SD copy of the certificate is deleted once imported into the WiFi module's flash,
 * so there's nothing left on the SD card to re-read later) and the expiry-reminder settings.
 *
 * Mirrors the same localStorage-with-memory-fallback pattern established in
 * `../configBackup/credentials.ts` (duplicated rather than imported - this is a small, generic,
 * self-contained helper, and tlsSetup is otherwise a deliberately separate feature area).
 */

const NS = "flexibleLayouts.tlsSetup";

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
		if (real && typeof real.setItem === "function" && typeof real.getItem === "function") { return real; }
	} catch {
		// fall through to the in-memory fallback below
	}
	if (!memoryFallback) { memoryFallback = makeMemoryStorage(); }
	return memoryFallback;
}

export function resetForTests(): void {
	try { window.localStorage.clear(); } catch { /* fall through */ }
	memoryFallback = null;
}

export function getCertExpiryDate(): string | null {
	return ls()?.getItem(`${NS}.certExpiryAt`) ?? null;
}
export function setCertExpiryDate(iso: string): void {
	ls()?.setItem(`${NS}.certExpiryAt`, iso);
}

export interface CertReminderSettings {
	enabled: boolean;
	warningDays: number;
}
const DEFAULT_REMINDER_SETTINGS: CertReminderSettings = { enabled: true, warningDays: 30 };

export function getCertReminderSettings(): CertReminderSettings {
	const raw = ls()?.getItem(`${NS}.reminder`);
	if (!raw) { return { ...DEFAULT_REMINDER_SETTINGS }; }
	try { return { ...DEFAULT_REMINDER_SETTINGS, ...(JSON.parse(raw) as Partial<CertReminderSettings>) }; } catch { return { ...DEFAULT_REMINDER_SETTINGS }; }
}
export function setCertReminderSettings(settings: CertReminderSettings): void {
	ls()?.setItem(`${NS}.reminder`, JSON.stringify(settings));
}
