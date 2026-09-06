/**
 * Browser-local on/off for the 30-day trend snapshot (Item G). Mirrors reminders/storage.ts's
 * localStorage-with-memory-fallback pattern and its scope choice: this is a per-browser PREFERENCE
 * ("do I want this recorded"), not machine state, matching history.ts's own class doc about the
 * snapshot mechanism already being a per-browser, best-effort thing.
 *
 * Defaults to ON (unlike the axis/fan/heater detail-tracking flag in macros.ts, which defaults OFF) -
 * this write happens entirely in the browser, costs nothing on the controller, and only fires once
 * per calendar day, so there's no equivalent overhead concern to opt out of by default.
 */
const KEY = "flexibleLayouts.maintenanceTrendEnabled";

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
	try { window.localStorage.removeItem(KEY); } catch { /* fall through */ }
	memoryFallback = null;
}

export function isTrendTrackingEnabled(): boolean {
	const raw = ls()?.getItem(KEY);
	return raw !== "0"; // absent (never configured) or anything but the literal "0" -> on, by default
}

export function setTrendTrackingEnabled(enabled: boolean): void {
	ls()?.setItem(KEY, enabled ? "1" : "0");
}
