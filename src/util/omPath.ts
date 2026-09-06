/**
 * Resolve a dotted/bracketed path against the live object model.
 *
 * Accepts paths like `heat.heaters[0].current`, `move.axes[2].machinePosition`,
 * `state.status` or `sensors.analog[0].lastReading`. Returns `undefined` for any missing/invalid
 * segment so callers can show a placeholder rather than throwing. Kept dependency-free and pure so
 * it can be wrapped in a computed for reactive read-outs.
 */
// Splitting a path allocates a replaced string plus three arrays (split/map/filter). This runs for
// every widget's every path on every object-model update - several times a second, forever - and the
// paths themselves come from saved config, so the same handful of strings are re-parsed endlessly.
// Cache the segment arrays instead; the cap keeps a pathological layout from growing this unbounded.
const SEGMENT_CACHE_LIMIT = 512;
const segmentCache = new Map<string, ReadonlyArray<string>>();

function segmentsFor(path: string): ReadonlyArray<string> {
	const cached = segmentCache.get(path);
	if (cached) {
		return cached;
	}
	// Normalise `a[0].b` -> `a.0.b`, then split on dots.
	const segments: ReadonlyArray<string> = path
		.replace(/\[(\d+)\]/g, ".$1")
		.split(".")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (segmentCache.size >= SEGMENT_CACHE_LIMIT) {
		segmentCache.clear();
	}
	segmentCache.set(path, segments);
	return segments;
}

export function resolveOmPath(root: unknown, path: string): unknown {
	if (!path) {
		return undefined;
	}
	const segments = segmentsFor(path);

	let current: unknown = root;
	for (const seg of segments) {
		if (current === null || current === undefined) {
			return undefined;
		}
		if (typeof current !== "object") {
			return undefined;
		}
		// Parts of the object model are Maps, not plain objects (global, plugins, ...) - plain
		// property access on those silently returns undefined for every key.
		current = current instanceof Map ? current.get(seg) : (current as Record<string, unknown>)[seg];
	}
	return current;
}

/** Enumerate an object-model node's children uniformly across plain objects, arrays and Maps. */
export function omChildren(node: unknown): Array<[string, unknown]> {
	if (node === null || node === undefined || typeof node !== "object") {
		return [];
	}
	if (node instanceof Map) {
		return Array.from(node.entries()).map(([k, v]) => [String(k), v]);
	}
	if (Array.isArray(node)) {
		return node.map((v, i) => [String(i), v]);
	}
	return Object.entries(node as Record<string, unknown>);
}

/** Build a path string from segments (numeric segments become `[n]`). Inverse of resolveOmPath. */
export function buildOmPath(segments: Array<string>): string {
	let out = "";
	for (const seg of segments) {
		if (/^\d+$/.test(seg)) {
			out += `[${seg}]`;
		} else {
			out += out ? `.${seg}` : seg;
		}
	}
	return out;
}

/** Curated object-model read-outs offered as quick-picks in the value widget editor. */
export interface OmPreset {
	labelKey: string;
	path: string;
	unit?: string;
	icon: string;
}

export const OM_VALUE_PRESETS: ReadonlyArray<OmPreset> = [
	{ labelKey: "tool0Current", path: "heat.heaters[1].current", unit: "°C", icon: "mdi-printer-3d-nozzle-heat" },
	{ labelKey: "tool0Active",  path: "heat.heaters[1].active",  unit: "°C", icon: "mdi-printer-3d-nozzle" },
	{ labelKey: "bedCurrent",   path: "heat.heaters[0].current", unit: "°C", icon: "mdi-radiator" },
	{ labelKey: "bedActive",    path: "heat.heaters[0].active",  unit: "°C", icon: "mdi-radiator" },
	{ labelKey: "posX",         path: "move.axes[0].machinePosition", unit: "mm", icon: "mdi-axis-x-arrow" },
	{ labelKey: "posY",         path: "move.axes[1].machinePosition", unit: "mm", icon: "mdi-axis-y-arrow" },
	{ labelKey: "posZ",         path: "move.axes[2].machinePosition", unit: "mm", icon: "mdi-axis-z-arrow" },
	{ labelKey: "speedFactor",  path: "move.speedFactor",  unit: "", icon: "mdi-speedometer" },
	{ labelKey: "status",       path: "state.status",      unit: "", icon: "mdi-information-outline" },
	{ labelKey: "fan0",         path: "fans[0].actualValue", unit: "", icon: "mdi-fan" },
	{ labelKey: "jobProgress",  path: "job.filePosition",  unit: "", icon: "mdi-progress-clock" },
	{ labelKey: "chamberCurrent", path: "heat.heaters[2].current", unit: "°C", icon: "mdi-thermometer" },
];
