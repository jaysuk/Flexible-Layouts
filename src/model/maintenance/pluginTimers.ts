/**
 * Interop with the Duet3D "Maintenance Timers" DSF plugin (github.com/Duet3D/MaintenanceTimersPlugin),
 * for machines that have it installed: a user-defined timer list kept on the SBC and published as the
 * plugin's `timers` data, with a reset endpoint. The plugin ships no UI of its own, and stock DWC does
 * not display it either, so without this a user who has both gets nothing from the plugin in FL.
 *
 * What the plugin does (read from its source): once a minute it walks `/sys/timers.json`; a timer whose
 * `conditions` (object-model expressions) all hold counts one minute - UP when `initialValue` is 0,
 * DOWN towards 0 otherwise - and runs its `action` G/M/T-code when `value` equals `thresholdValue`.
 * `PUT /machine/MaintenanceTimers/Reset?timerName=<name>` puts a timer back to `initialValue` (403 when
 * `canReset` is false).
 *
 * This only READS the published data and calls that endpoint - it never writes timers.json. Nothing
 * here runs, and nothing is shown, on a machine without the plugin.
 *
 * The plugin serialises with System.Text.Json and no naming policy is set in its source, so whether the
 * published keys are camelCase (as its README documents) or PascalCase is not certain from the code
 * alone; both are accepted.
 */
import { resolveOmPath } from "../../util/omPath";

export const MAINTENANCE_TIMERS_PLUGIN_ID = "MaintenanceTimers";
export const MAINTENANCE_TIMERS_RESET_PATH = "machine/MaintenanceTimers/Reset";

export interface PluginTimer {
	name: string;
	title: string;
	/** Minutes. */
	value: number;
	/** 0 = counts up; anything else = counts down from it. */
	initialValue: number;
	/** Minutes, or -1 when the timer has no threshold. */
	thresholdValue: number;
	action: string;
	conditions: Array<string>;
	canReset: boolean;
}

function pick(raw: Record<string, unknown>, camel: string): unknown {
	return raw[camel] ?? raw[camel.charAt(0).toUpperCase() + camel.slice(1)];
}

function normalize(raw: unknown): PluginTimer | null {
	if (!raw || typeof raw !== "object") { return null; }
	const r = raw as Record<string, unknown>;
	const name = pick(r, "name");
	if (typeof name !== "string" || !name) { return null; }
	const num = (key: string, fallback: number): number => {
		const v = pick(r, key);
		return typeof v === "number" && Number.isFinite(v) ? v : fallback;
	};
	const title = pick(r, "title");
	const conditions = pick(r, "conditions");
	const action = pick(r, "action");
	const canReset = pick(r, "canReset");
	return {
		name,
		title: typeof title === "string" && title ? title : name,
		value: num("value", 0),
		initialValue: num("initialValue", 0),
		thresholdValue: num("thresholdValue", -1),
		action: typeof action === "string" ? action : "",
		conditions: Array.isArray(conditions) ? conditions.filter((c): c is string => typeof c === "string") : [],
		canReset: typeof canReset === "boolean" ? canReset : true,
	};
}

/** The plugin's timers, or null when the plugin is not installed (so callers can hide everything). */
export function readPluginTimers(model: unknown): Array<PluginTimer> | null {
	if (resolveOmPath(model, `plugins.${MAINTENANCE_TIMERS_PLUGIN_ID}`) === undefined) { return null; }
	const data = resolveOmPath(model, `plugins.${MAINTENANCE_TIMERS_PLUGIN_ID}.data.timers`);
	if (!Array.isArray(data)) { return []; }
	return data.map(normalize).filter((t): t is PluginTimer => t !== null);
}

/** Whether a timer has reached its threshold: up-counters at or above it, down-counters at or below it.
 *  A timer with no threshold (-1) never "reaches" anything. */
export function pluginTimerReached(t: PluginTimer): boolean {
	if (t.thresholdValue < 0) { return false; }
	return t.initialValue === 0 ? t.value >= t.thresholdValue : t.value <= t.thresholdValue;
}

export function countReachedPluginTimers(model: unknown): number {
	return (readPluginTimers(model) ?? []).filter(pluginTimerReached).length;
}

/** `95` -> "1.6h", `40` -> "40 min". */
export function formatPluginMinutes(minutes: number): string {
	return Math.abs(minutes) >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${Math.round(minutes)} min`;
}

type Requester = (method: string, path: string, params: Record<string, string | number | boolean> | null, responseType: XMLHttpRequestResponseType) => Promise<unknown>;

/** Asks the plugin to put one timer back to its initial value. Returns false (never throws) when the
 *  plugin refuses (not resettable, unknown name) or cannot be reached. */
export async function resetPluginTimer(request: Requester, name: string): Promise<boolean> {
	try {
		await request("PUT", MAINTENANCE_TIMERS_RESET_PATH, { timerName: name }, "");
		return true;
	} catch {
		return false;
	}
}
