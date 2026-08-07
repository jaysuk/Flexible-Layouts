/**
 * Shared tool table: a small local lookup from tool number to geometry/description, persisted in
 * FL's own settings container - never on the controller. RRF's object model knows a tool exists and
 * its measured Z offset, not that slot 3 holds a 6mm compression bit; that's exactly the gap this
 * fills. Consumed by Preflight ("are the tools this file needs known?") and the tool-length probe
 * (Phase 6, "which tool is this offset for?").
 *
 * Deliberately NOT written back to the controller: renaming a tool there means re-issuing M563,
 * which also carries the spindle mapping and could silently rewrite working config if a parameter
 * were dropped.
 */
import { useSettingsStore } from "@/stores/settings";

const PLUGIN_KEY = "flexibleLayouts";
const TOOL_TABLE_KEY = "toolTable";

export type ToolType = "endmill" | "ballnose" | "vbit" | "chamfer" | "drill" | "surfacing" | "engraver" | "other";

export interface ToolTableEntry {
	/** Tool number (T-word). */
	number: number;
	name?: string;
	type?: ToolType;
	/** Cutting diameter (mm). Unset/0 = unknown. */
	diameter?: number;
	/** Number of flutes. Unset/0 = unknown. */
	flutes?: number;
	/** V-bit included angle (degrees) - only meaningful for type "vbit". */
	angle?: number;
	notes?: string;
}

function container(): Record<string, unknown> {
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, Record<string, unknown>>;
	if (!plugins[PLUGIN_KEY]) {
		plugins[PLUGIN_KEY] = {};
	}
	return plugins[PLUGIN_KEY];
}

export function getToolTable(): Array<ToolTableEntry> {
	const c = container();
	return (c[TOOL_TABLE_KEY] as Array<ToolTableEntry> | undefined) ?? [];
}

export function setToolTable(entries: Array<ToolTableEntry>): void {
	container()[TOOL_TABLE_KEY] = [...entries].sort((a, b) => a.number - b.number);
}

export function getToolEntry(toolNumber: number): ToolTableEntry | undefined {
	return getToolTable().find((t) => t.number === toolNumber);
}

/** Insert or replace the entry for `entry.number`. */
export function upsertToolEntry(entry: ToolTableEntry): void {
	const table = getToolTable();
	const idx = table.findIndex((t) => t.number === entry.number);
	if (idx >= 0) {
		const next = [...table];
		next[idx] = entry;
		setToolTable(next);
	} else {
		setToolTable([...table, entry]);
	}
}

export function deleteToolEntry(toolNumber: number): void {
	setToolTable(getToolTable().filter((t) => t.number !== toolNumber));
}
