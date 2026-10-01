/**
 * Where the service rules and user counters live: `0:/sys/flexible-layouts.maintenance-rules.json`, on
 * the machine, beside the maintenance log. That is what lets every browser see the same rules and what
 * lets the machine-side macro (rulesMacro.ts) act on them with no browser open.
 *
 * Reads are tolerant (never throw). Writes follow the log's contract (log.ts): refuse to overwrite a
 * file whose checksum already disagrees with itself, read the file straight back after writing and
 * verify it, and - because the file can be edited from two browsers - always re-read the file
 * immediately before changing it ({@link updateMaintenanceRules}) instead of writing back a copy that
 * was loaded minutes ago.
 *
 * MIGRATION: rules used to live in `localStorage`, per browser. The first time a browser sees the file
 * it folds its local rules in (union by id, once - see {@link loadMaintenanceRules}), and the local copy
 * remains only as the offline fallback. A file is only ever created when it is POSITIVELY known to be
 * absent: an unreadable file (offline, SD hiccup) is not an empty one, and writing over it would delete
 * everyone's rules.
 */
import type { MachineIO } from "dwc-config-backup-core";

import { useMachineStore } from "@/stores/machine";

import { isCustomCounter, type CustomCounter } from "../maintenance/customCounters";
import { fnv1aHex } from "../maintenance/log";
import {
	getIntervalRules, hasMigratedRules, isMaintenanceIntervalRule, markRulesMigrated, setIntervalRules,
	type MaintenanceIntervalRule,
} from "./storage";

export const MAINT_RULES_PATH = "0:/sys/flexible-layouts.maintenance-rules.json";
const RULES_DIR = "0:/sys";
const RULES_FILE_NAME = "flexible-layouts.maintenance-rules.json";

const RULES_KIND = "flexible-layouts-maintenance-rules";
const RULES_SCHEMA = 1;

export interface MaintenanceRulesDoc {
	rules: Array<MaintenanceIntervalRule>;
	customCounters: Array<CustomCounter>;
	/** The number the NEXT custom counter takes (`c<n>`). Only ever grows, so a deleted counter's
	 *  RRF global can never be picked up by a new one. */
	nextCustomId: number;
}

export function emptyRulesDoc(): MaintenanceRulesDoc {
	return { rules: [], customCounters: [], nextCustomId: 1 };
}

export type RulesIntegrity = "ok" | "mismatch" | "none";

function bodyOf(doc: MaintenanceRulesDoc): string {
	return JSON.stringify({ rules: doc.rules, customCounters: doc.customCounters, nextCustomId: doc.nextCustomId });
}

export function serializeRulesDoc(doc: MaintenanceRulesDoc): string {
	return JSON.stringify({
		kind: RULES_KIND, schemaVersion: RULES_SCHEMA,
		rules: doc.rules, customCounters: doc.customCounters, nextCustomId: doc.nextCustomId,
		checksum: fnv1aHex(bodyOf(doc)),
	});
}

/** Parses the file text. Null for anything that is not a rules file; malformed entries inside it are
 *  dropped individually rather than failing the whole file. */
export function parseRulesDoc(text: string): { doc: MaintenanceRulesDoc; integrity: RulesIntegrity } | null {
	let obj: unknown;
	try { obj = JSON.parse(text); } catch { return null; }
	if (!obj || typeof obj !== "object") { return null; }
	const o = obj as Record<string, unknown>;
	if (o.kind !== RULES_KIND || !Array.isArray(o.rules)) { return null; }
	const customCounters = Array.isArray(o.customCounters) ? o.customCounters.filter(isCustomCounter) : [];
	const highest = customCounters.reduce((m, c) => Math.max(m, Number(c.id.slice(1)) || 0), 0);
	const doc: MaintenanceRulesDoc = {
		rules: o.rules.filter(isMaintenanceIntervalRule),
		customCounters,
		nextCustomId: Math.max(typeof o.nextCustomId === "number" ? Math.floor(o.nextCustomId) : 1, highest + 1, 1),
	};
	const integrity: RulesIntegrity = typeof o.checksum !== "string"
		? "none"
		: (o.checksum === fnv1aHex(JSON.stringify({ rules: o.rules, customCounters: o.customCounters ?? [], nextCustomId: o.nextCustomId ?? 1 })) ? "ok" : "mismatch");
	return { doc, integrity };
}

// --- I/O -----------------------------------------------------------------------------------------------

export interface RulesIO {
	read(): Promise<string>;
	write(text: string): Promise<void>;
	/** true / false when the directory listing could be read, null when it could not. */
	exists(): Promise<boolean | null>;
}

export function defaultRulesIO(): RulesIO {
	const machineStore = useMachineStore();
	return {
		async read() {
			const v = await machineStore.download({ filename: MAINT_RULES_PATH, type: "text" }, false, false, false);
			return typeof v === "string" ? v : v instanceof Blob ? v.text() : String(v);
		},
		async write(text) {
			await machineStore.upload({ filename: MAINT_RULES_PATH, content: new Blob([text], { type: "application/json" }) }, false, false, false);
		},
		async exists() {
			try {
				const list = await (machineStore as unknown as { getFileList(d: string): Promise<Array<{ name: string }>> }).getFileList(RULES_DIR);
				return list.some((f) => f.name === RULES_FILE_NAME);
			} catch {
				return null;
			}
		},
	};
}

/** Typed view of what the machine IO needs for {@link rulesIOFrom} - lets a test (or the unattended
 *  tooling) drive the same logic from a MachineIO. */
export function rulesIOFrom(io: Pick<MachineIO, "downloadText" | "upload" | "getFileList">): RulesIO {
	return {
		read: () => io.downloadText(MAINT_RULES_PATH),
		write: (text) => io.upload(MAINT_RULES_PATH, new Blob([text], { type: "application/json" })),
		async exists() {
			try { return (await io.getFileList(RULES_DIR)).some((f) => f.name === RULES_FILE_NAME); } catch { return null; }
		},
	};
}

export type RulesSource = "machine" | "cache";

export interface LoadedRules {
	doc: MaintenanceRulesDoc;
	integrity: RulesIntegrity;
	/** "cache" = the machine's file could not be read, so this is the browser's local copy and is
	 *  read-only in effect: {@link updateMaintenanceRules} will not write on top of an unreadable file. */
	source: RulesSource;
}

function union(base: Array<MaintenanceIntervalRule>, extra: Array<MaintenanceIntervalRule>): { rules: Array<MaintenanceIntervalRule>; added: number } {
	const ids = new Set(base.map((r) => r.id));
	const fresh = extra.filter((r) => !ids.has(r.id));
	return { rules: [...base, ...fresh], added: fresh.length };
}

async function writeVerified(io: RulesIO, doc: MaintenanceRulesDoc): Promise<boolean> {
	try {
		await io.write(serializeRulesDoc(doc));
		const back = parseRulesDoc(await io.read());
		return !!back && back.integrity === "ok" && bodyOf(back.doc) === bodyOf(doc);
	} catch {
		return false;
	}
}

/** Loads the rules for display/evaluation. Never throws. See the file header for the migration rules. */
export async function loadMaintenanceRules(io: RulesIO = defaultRulesIO()): Promise<LoadedRules> {
	const local = getIntervalRules();
	let text: string | null = null;
	try { text = await io.read(); } catch { text = null; }
	const parsed = text != null ? parseRulesDoc(text) : null;

	if (parsed) {
		let { doc } = parsed;
		if (!hasMigratedRules()) {
			const merged = union(doc.rules, local);
			if (merged.added > 0 && parsed.integrity !== "mismatch") {
				const next = { ...doc, rules: merged.rules };
				if (await writeVerified(io, next)) { doc = next; markRulesMigrated(); }
			} else if (merged.added === 0) {
				markRulesMigrated();
			}
		}
		setIntervalRules(doc.rules);
		return { doc, integrity: parsed.integrity, source: "machine" };
	}

	if (text == null && (await io.exists()) === false) {
		// Positively no file yet: a first run (or an upgrade). Carry this browser's local rules across.
		const doc: MaintenanceRulesDoc = { ...emptyRulesDoc(), rules: local };
		if (local.length > 0 && (await writeVerified(io, doc))) { markRulesMigrated(); }
		return { doc, integrity: "none", source: "machine" };
	}

	// Unreadable, or not a rules file: never replace it from here. Show what this browser last knew.
	return { doc: { ...emptyRulesDoc(), rules: local }, integrity: "none", source: "cache" };
}

export type RulesWriteResult = "written" | "failed" | "blocked";

/** Applies `change` to the machine's CURRENT rules and writes the result. Returns the new document on
 *  success. "blocked": the file's checksum already disagrees with itself (hand-edited or a partial
 *  write) - left untouched so it can be recovered. "failed": it could not be read safely or written. */
export async function updateMaintenanceRules(
	change: (doc: MaintenanceRulesDoc) => MaintenanceRulesDoc, io: RulesIO = defaultRulesIO(),
): Promise<{ result: RulesWriteResult; doc: MaintenanceRulesDoc | null }> {
	let current: MaintenanceRulesDoc;
	let text: string | null = null;
	try { text = await io.read(); } catch { text = null; }
	const parsed = text != null ? parseRulesDoc(text) : null;
	if (parsed) {
		if (parsed.integrity === "mismatch") { return { result: "blocked", doc: null }; }
		current = parsed.doc;
	} else if (text == null && (await io.exists()) === false) {
		current = { ...emptyRulesDoc(), rules: getIntervalRules() };
	} else {
		return { result: "failed", doc: null };
	}
	const next = change(current);
	if (!(await writeVerified(io, next))) { return { result: "failed", doc: null }; }
	setIntervalRules(next.rules);
	markRulesMigrated();
	return { result: "written", doc: next };
}
