/**
 * Local (browser-only) storage for service-interval reminder RULES ("grease the ways every 50
 * spindle hours"). Mirrors tlsSetup/storage.ts's exact localStorage-with-memory-fallback pattern and
 * its accepted trade-off: these are reminder PREFERENCES, not machine state, so - unlike the counters
 * and the manual log, which both live on the SD card and follow the machine between browsers - a
 * rule configured in one browser won't appear in another. The baseline each rule measures FROM is
 * still genuinely machine state (Item D's per-counter service log); only the threshold config itself
 * is browser-local, the same scope certExpiryNudge's own reminder settings already accepted.
 */
import type { MaintenanceCounterKey } from "../maintenance/log";

const NS = "flexibleLayouts.maintenanceReminders";

export interface MaintenanceIntervalRule {
	id: string;
	/** Free-text description shown in the reminder, e.g. "Grease the ways". */
	label: string;
	counter: MaintenanceCounterKey;
	/** Threshold in whatever unit that counter's baseline already is - seconds for spindle/print
	 *  hours, millimetres for filament, a plain count for tool changes. */
	intervalValue: number;
	enabled: boolean;
}

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
	try { window.localStorage.removeItem(`${NS}.rules`); } catch { /* fall through */ }
	memoryFallback = null;
}

export function getIntervalRules(): Array<MaintenanceIntervalRule> {
	const raw = ls()?.getItem(`${NS}.rules`);
	if (!raw) { return []; }
	try {
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? parsed.filter(isValidRule) : [];
	} catch {
		return [];
	}
}

export function setIntervalRules(rules: Array<MaintenanceIntervalRule>): void {
	ls()?.setItem(`${NS}.rules`, JSON.stringify(rules));
}

function isValidRule(v: unknown): v is MaintenanceIntervalRule {
	if (!v || typeof v !== "object") { return false; }
	const r = v as Partial<MaintenanceIntervalRule>;
	return typeof r.id === "string" && typeof r.label === "string" && typeof r.counter === "string"
		&& typeof r.intervalValue === "number" && typeof r.enabled === "boolean";
}

export function newRuleId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
