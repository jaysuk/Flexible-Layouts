/**
 * The one vocabulary for "a thing the maintenance feature counts": which object-model global holds it,
 * what unit it is in, how to label and format it, and how to turn it into a baseline snapshot.
 *
 * A counter KEY is a string with three shapes:
 *  - a fixed name (`spindleSeconds`, `powerOnSeconds`, ...) - one scalar `global.flMaint*`;
 *  - `family:index` (`axisMm:2`, `fanSec:0`, `heaterSec:1`, `heaterFullSec:1`) - one element of a
 *    fixed-size array global, in `move.axes[]` / `fans[]` / `heat.heaters[]` order;
 *  - `custom:<id>` - a user-defined condition counter (see customCounters.ts), `global.flMaint<Id>Sec`.
 *
 * Reminder rules, log-entry `services`, baselines, the due badge and the generated machine-side rules
 * macro all speak this vocabulary, so a new counter only has to be taught here.
 */
import { resolveOmPath } from "../../util/omPath";

/** Capacities of the fixed-size tracking arrays. Kept in this file (macros.ts imports them) so the key
 *  parser and the daemon macro can never disagree about how many elements exist. */
export const MAINTENANCE_MAX_TRACKED_AXES = 12;
export const MAINTENANCE_MAX_TRACKED_FANS = 12;
export const MAINTENANCE_MAX_TRACKED_HEATERS = 12;

export type CounterUnit = "seconds" | "mm" | "count";

interface StaticCounterInfo { om: string; unit: CounterUnit; labelKey: string }

export const STATIC_COUNTERS = {
	spindleSeconds: { om: "global.flMaintSpindleSec", unit: "seconds", labelKey: "spindleHours" },
	printSeconds: { om: "global.flMaintPrintSec", unit: "seconds", labelKey: "printHours" },
	filamentMm: { om: "global.flMaintFilamentMm", unit: "mm", labelKey: "filamentUsed" },
	toolChanges: { om: "global.flMaintToolChanges", unit: "count", labelKey: "toolChanges" },
	powerOnSeconds: { om: "global.flMaintPowerOnSec", unit: "seconds", labelKey: "powerOnHours" },
	filamentErrors: { om: "global.flMaintFilamentErrors", unit: "count", labelKey: "filamentErrors" },
	jobsStarted: { om: "global.flMaintJobsStarted", unit: "count", labelKey: "jobsStarted" },
	jobsFinished: { om: "global.flMaintJobsFinished", unit: "count", labelKey: "jobsCompleted" },
	jobsCancelled: { om: "global.flMaintJobsCancelled", unit: "count", labelKey: "jobsCancelled" },
} as const satisfies Record<string, StaticCounterInfo>;

export type StaticCounterKey = keyof typeof STATIC_COUNTERS;

/** The four counters that have their own `*AtEntry` field on a log entry (and so also feed the CSV
 *  export). Every other counter's baseline lives in `MaintenanceEntry.baselines`. */
export const LEGACY_COUNTER_KEYS = ["spindleSeconds", "printSeconds", "filamentMm", "toolChanges"] as const satisfies ReadonlyArray<StaticCounterKey>;

export const INDEXED_FAMILIES = {
	axisMm: { om: "global.flMaintAxisMm", unit: "mm", max: MAINTENANCE_MAX_TRACKED_AXES },
	fanSec: { om: "global.flMaintFanSec", unit: "seconds", max: MAINTENANCE_MAX_TRACKED_FANS },
	heaterSec: { om: "global.flMaintHeaterSec", unit: "seconds", max: MAINTENANCE_MAX_TRACKED_HEATERS },
	heaterFullSec: { om: "global.flMaintHeaterFullSec", unit: "seconds", max: MAINTENANCE_MAX_TRACKED_HEATERS },
} as const satisfies Record<string, { om: string; unit: CounterUnit; max: number }>;

export type IndexedFamily = keyof typeof INDEXED_FAMILIES;

export type IndexedCounterKey = `${IndexedFamily}:${number}`;
export type CustomCounterKey = `custom:${string}`;
export type MaintenanceCounterKey = StaticCounterKey | IndexedCounterKey | CustomCounterKey;

export type CounterRef =
	| { kind: "static"; key: StaticCounterKey }
	| { kind: "indexed"; family: IndexedFamily; index: number }
	| { kind: "custom"; id: string };

/** A custom counter id becomes part of an RRF variable name, so it is restricted to what that allows
 *  (and what cannot collide with the fixed names): lowercase letters/digits, starting with a letter. */
export const CUSTOM_ID_RE = /^[a-z][a-z0-9]{0,23}$/;

export function parseCounterKey(key: string): CounterRef | null {
	if (Object.prototype.hasOwnProperty.call(STATIC_COUNTERS, key)) {
		return { kind: "static", key: key as StaticCounterKey };
	}
	const sep = key.indexOf(":");
	if (sep < 0) { return null; }
	const head = key.slice(0, sep);
	const tail = key.slice(sep + 1);
	if (head === "custom") {
		return CUSTOM_ID_RE.test(tail) ? { kind: "custom", id: tail } : null;
	}
	if (Object.prototype.hasOwnProperty.call(INDEXED_FAMILIES, head) && /^\d+$/.test(tail)) {
		const index = Number(tail);
		return index < INDEXED_FAMILIES[head as IndexedFamily].max ? { kind: "indexed", family: head as IndexedFamily, index } : null;
	}
	return null;
}

export function isCounterKey(key: unknown): key is MaintenanceCounterKey {
	return typeof key === "string" && parseCounterKey(key) !== null;
}

export function customCounterKey(id: string): CustomCounterKey {
	return `custom:${id}`;
}

/** `flMaintC1Sec` for id `c1` - the RRF global a custom counter accumulates into. */
export function customCounterGlobalName(id: string): string {
	return `flMaint${id.charAt(0).toUpperCase()}${id.slice(1)}Sec`;
}

/** The expression that reads this counter - valid both as an object-model path (resolveOmPath handles
 *  the `[i]`) and as an RRF meta-gcode expression, which is why the generated macro reuses it as is.
 *  Null for a key that is not a counter. */
export function counterExpression(key: string): string | null {
	const ref = parseCounterKey(key);
	if (!ref) { return null; }
	switch (ref.kind) {
		case "static": return STATIC_COUNTERS[ref.key].om;
		case "indexed": return `${INDEXED_FAMILIES[ref.family].om}[${ref.index}]`;
		case "custom": return `global.${customCounterGlobalName(ref.id)}`;
	}
}

export function counterUnit(key: string): CounterUnit {
	const ref = parseCounterKey(key);
	if (!ref) { return "count"; }
	switch (ref.kind) {
		case "static": return STATIC_COUNTERS[ref.key].unit;
		case "indexed": return INDEXED_FAMILIES[ref.family].unit;
		case "custom": return "seconds";
	}
}

/** The live value of a counter, or null when the machine does not report it (tracking not set up, the
 *  array not yet redeployed, an index past what the array holds). Null is "unknown", never 0. */
export function liveCounterValue(model: unknown, key: string): number | null {
	const expr = counterExpression(key);
	if (!expr) { return null; }
	const v = resolveOmPath(model, expr);
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Formats an amount in the counter's own unit: hours, metres or a plain count. */
export function formatCounterAmount(key: string, amount: number): string {
	switch (counterUnit(key)) {
		case "seconds": return (amount / 3600).toFixed(1) + "h";
		case "mm": return (amount / 1000).toFixed(1) + " m";
		case "count": return String(Math.round(amount));
	}
}

/** What a person types in the interval box, per unit: hours, metres, count. */
export function intervalFromInput(key: string, entered: number): number {
	switch (counterUnit(key)) {
		case "seconds": return Math.round(entered * 3600);
		case "mm": return Math.round(entered * 1000);
		case "count": return Math.round(entered);
	}
}

export function intervalToInput(key: string, stored: number): number {
	switch (counterUnit(key)) {
		case "seconds": return stored / 3600;
		case "mm": return stored / 1000;
		case "count": return stored;
	}
}

/** Key under `plugins.flexibleLayouts.maintenance.*` naming the unit the interval box is in. */
export function intervalUnitLabelKey(key: string): string {
	switch (counterUnit(key)) {
		case "seconds": return "intervalUnitHours";
		case "mm": return "intervalUnitMetres";
		case "count": return "intervalUnitCount";
	}
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface CounterCatalogueOptions {
	/** `state.machineMode === "FFF"` - decides which of the print/spindle counters make sense. */
	isFff: boolean;
	customCounters?: ReadonlyArray<{ id: string; title: string }>;
}

export interface CounterChoice { key: MaintenanceCounterKey; title: string }

function nonNullIndices(list: unknown): Array<number> {
	if (!Array.isArray(list)) { return []; }
	const out: Array<number> = [];
	list.forEach((item, i) => { if (item != null) { out.push(i); } });
	return out;
}

/** Every counter this machine can be measured by right now, with a human title. Per-axis/fan/heater
 *  entries come from the machine's own configuration (axis letters, populated fan/heater slots) capped
 *  at the tracking-array capacity, so a 4-axis machine offers 4 axis counters and no padding. */
export function counterCatalogue(model: unknown, t: Translate, options: CounterCatalogueOptions): Array<CounterChoice> {
	const label = (key: StaticCounterKey): string => t(`plugins.flexibleLayouts.maintenance.${STATIC_COUNTERS[key].labelKey}`);
	const out: Array<CounterChoice> = [];
	const fixed: Array<StaticCounterKey> = options.isFff
		? ["printSeconds", "filamentMm", "toolChanges", "filamentErrors"]
		: ["spindleSeconds", "printSeconds"];
	for (const key of [...fixed, "powerOnSeconds" as const, "jobsStarted" as const, "jobsFinished" as const, "jobsCancelled" as const]) {
		out.push({ key, title: label(key) });
	}
	const axes = resolveOmPath(model, "move.axes");
	if (Array.isArray(axes)) {
		axes.slice(0, MAINTENANCE_MAX_TRACKED_AXES).forEach((axis, i) => {
			const letter = (axis as { letter?: string } | null)?.letter ?? String(i);
			out.push({ key: `axisMm:${i}`, title: t("plugins.flexibleLayouts.maintenance.counterAxisTravel", { axis: letter }) });
		});
	}
	for (const i of nonNullIndices(resolveOmPath(model, "fans")).filter((n) => n < MAINTENANCE_MAX_TRACKED_FANS)) {
		out.push({ key: `fanSec:${i}`, title: t("plugins.flexibleLayouts.maintenance.counterFanRuntime", { index: i }) });
	}
	for (const i of nonNullIndices(resolveOmPath(model, "heat.heaters")).filter((n) => n < MAINTENANCE_MAX_TRACKED_HEATERS)) {
		out.push({ key: `heaterSec:${i}`, title: t("plugins.flexibleLayouts.maintenance.counterHeaterOn", { index: i }) });
		out.push({ key: `heaterFullSec:${i}`, title: t("plugins.flexibleLayouts.maintenance.counterHeaterFull", { index: i }) });
	}
	for (const c of options.customCounters ?? []) {
		out.push({ key: customCounterKey(c.id), title: c.title });
	}
	return out;
}

/** Title for one key, for a rule/badge row. Falls back to the raw key rather than hiding a rule that
 *  points at something the machine no longer reports (a removed axis, a deleted custom counter). */
export function counterTitle(key: string, model: unknown, t: Translate, customCounters: ReadonlyArray<{ id: string; title: string }> = []): string {
	const ref = parseCounterKey(key);
	if (!ref) { return key; }
	if (ref.kind === "static") {
		return t(`plugins.flexibleLayouts.maintenance.${STATIC_COUNTERS[ref.key].labelKey}`);
	}
	if (ref.kind === "custom") {
		return customCounters.find((c) => c.id === ref.id)?.title ?? key;
	}
	if (ref.family === "axisMm") {
		const letter = (resolveOmPath(model, `move.axes[${ref.index}]`) as { letter?: string } | null | undefined)?.letter ?? String(ref.index);
		return t("plugins.flexibleLayouts.maintenance.counterAxisTravel", { axis: letter });
	}
	const textKey = { fanSec: "counterFanRuntime", heaterSec: "counterHeaterOn", heaterFullSec: "counterHeaterFull" }[ref.family];
	return t(`plugins.flexibleLayouts.maintenance.${textKey}`, { index: ref.index });
}

/** Baselines for every counter that has no `*AtEntry` field of its own, read from the live model right
 *  now - what a new log entry stores under `baselines`. Only finite numbers are kept, so a counter that
 *  is not reported is simply absent (and reads back as "unknown"), never a made-up 0. */
export function snapshotExtraBaselines(model: unknown, customIds: ReadonlyArray<string> = []): Record<string, number> {
	const out: Record<string, number> = {};
	const add = (key: string): void => {
		const v = liveCounterValue(model, key);
		if (v != null) { out[key] = v; }
	};
	for (const key of Object.keys(STATIC_COUNTERS)) {
		if (!(LEGACY_COUNTER_KEYS as ReadonlyArray<string>).includes(key)) { add(key); }
	}
	for (const [family, info] of Object.entries(INDEXED_FAMILIES)) {
		for (let i = 0; i < info.max; i++) { add(`${family}:${i}`); }
	}
	for (const id of customIds) { add(customCounterKey(id)); }
	return out;
}
