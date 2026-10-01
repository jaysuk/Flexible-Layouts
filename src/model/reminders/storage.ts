/**
 * Service-interval reminder RULES ("grease the ways every 50 spindle hours") - the rule TYPE plus this
 * browser's local COPY of them.
 *
 * The source of truth is on the machine (rulesFile.ts: `0:/sys/flexible-layouts.maintenance-rules.json`),
 * next to the maintenance log, so every browser that opens the machine sees the same rules and the
 * machine-side macro (rulesMacro.ts) can act on them with no browser open. This localStorage copy is
 * only (a) the offline fallback, and (b) where rules written before the SD file existed are found and
 * migrated from - see rulesStore.ts. Mirrors tlsSetup/storage.ts's localStorage-with-memory-fallback
 * pattern.
 */
import type { MaintenanceCounterKey } from "../maintenance/counters";

const NS = "flexibleLayouts.maintenanceReminders";

export interface MaintenanceIntervalRule {
	id: string;
	/** Free-text description shown in the reminder, e.g. "Grease the ways". */
	label: string;
	counter: MaintenanceCounterKey;
	/** Threshold in whatever unit that counter's baseline already is - seconds for the hour-based
	 *  counters, millimetres for filament and axis travel, a plain count for the rest. (The input box
	 *  converts from hours/metres, see counters.ts's intervalFromInput.) */
	intervalValue: number;
	enabled: boolean;
	/** A single G/M/T-code line the MACHINE runs once when the rule comes due - with no browser open
	 *  (ruleAction.ts validates it, rulesMacro.ts emits it). Absent = the rule only reminds. */
	action?: string;
	/** Hold the action until the machine is idle (`state.status == "idle"`) rather than firing it
	 *  mid-print. Absent means true: running something unprompted during a job has to be asked for. */
	actionWhenIdle?: boolean;
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
	try { window.localStorage.removeItem(`${NS}.migrated`); } catch { /* fall through */ }
	memoryFallback = null;
}

/** Whether THIS browser has already folded its local rules into the machine's rules file. Per-browser
 *  on purpose: each browser that once held its own rules gets exactly one chance to contribute them. */
export function hasMigratedRules(): boolean {
	return ls()?.getItem(`${NS}.migrated`) === "1";
}

export function markRulesMigrated(): void {
	ls()?.setItem(`${NS}.migrated`, "1");
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
		&& typeof r.intervalValue === "number" && typeof r.enabled === "boolean"
		&& (r.action === undefined || typeof r.action === "string")
		&& (r.actionWhenIdle === undefined || typeof r.actionWhenIdle === "boolean");
}

/** The same shape check for a rule read from the SD file. */
export function isMaintenanceIntervalRule(v: unknown): v is MaintenanceIntervalRule {
	return isValidRule(v);
}

export function newRuleId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
