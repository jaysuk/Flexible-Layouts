/**
 * The manual maintenance log: "changed the collet", "greased the ways", etc. Durable SD-card JSON
 * storage, mirroring sdBackup.ts's exact upload/download shape and "never throw, best-effort" error
 * handling convention - but a single append-only file, not sdBackup's N-deep pruning ring, since a
 * maintenance log must never silently discard old entries the way version-history snapshots are
 * allowed to.
 *
 * "Hours since last service" is computed by SUBTRACTION at render time (see {@link secondsSince}):
 * each entry snapshots the live spindle-seconds/job-seconds counters at the moment it was logged, and
 * the live counters themselves are read straight from the object model / event log whenever needed -
 * logging an entry never resets or mutates either counter. This keeps the read path a pure "live value
 * minus a stored baseline" at all times, with the log file only ever supplying historical baselines.
 */
import { useMachineStore } from "@/stores/machine";

const LOG_PATH_DIR = "0:/sys";
export const MAINT_LOG_PATH = `${LOG_PATH_DIR}/flexible-layouts.maintenance-log.json`;

const LOG_KIND = "flexible-layouts-maintenance-log";
const LOG_SCHEMA = 1;

export interface MaintenanceEntry {
	id: string;
	/** Epoch ms, browser clock. */
	loggedAt: number;
	category: string;
	note: string;
	/** Snapshot of global.flMaintSpindleSec at logging time; null if offline/unavailable when logged. */
	spindleSecondsAtEntry: number | null;
	/** Snapshot of the M929-event-log-derived cumulative job-run total at logging time; same null rule. */
	jobSecondsAtEntry: number | null;
}

export interface MaintenanceLog {
	kind: typeof LOG_KIND;
	schemaVersion: number;
	entries: Array<MaintenanceEntry>;
}

export function emptyMaintenanceLog(): MaintenanceLog {
	return { kind: LOG_KIND, schemaVersion: LOG_SCHEMA, entries: [] };
}

/** Parse + validate a log file's text. Returns null for anything that isn't a real FL maintenance
 *  log (same "tolerant, never throw" contract as sdBackup.ts's parseBackup). */
export function parseMaintenanceLog(text: string): MaintenanceLog | null {
	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		return null;
	}
	if (!obj || typeof obj !== "object") {
		return null;
	}
	const l = obj as Partial<MaintenanceLog>;
	if (l.kind !== LOG_KIND || !Array.isArray(l.entries)) {
		return null;
	}
	const entries = l.entries.filter((e): e is MaintenanceEntry =>
		!!e && typeof e === "object" && typeof (e as MaintenanceEntry).id === "string" && typeof (e as MaintenanceEntry).loggedAt === "number");
	return { kind: LOG_KIND, schemaVersion: typeof l.schemaVersion === "number" ? l.schemaVersion : 1, entries };
}

// --- SD read/write (best-effort, mirrors sdBackup.ts) -----------------------------------------------

export interface MaintenanceIO {
	read(): Promise<string>;
	write(text: string): Promise<void>;
}

async function blobToText(v: unknown): Promise<string> {
	if (typeof v === "string") { return v; }
	if (v instanceof Blob) { return v.text(); }
	return String(v);
}

export function defaultMaintenanceIO(): MaintenanceIO {
	const machineStore = useMachineStore();
	return {
		async read() {
			// type: "text" for the same reason as sdBackup.ts's readBackup() - a bare filename auto-parses
			// as JSON and silently breaks the parser above.
			return blobToText(await machineStore.download({ filename: MAINT_LOG_PATH, type: "text" }, false, false, false));
		},
		async write(text) {
			await machineStore.upload({ filename: MAINT_LOG_PATH, content: new Blob([text], { type: "application/json" }) }, false, false, false);
		},
	};
}

/** Reads the log from the SD card. Never throws - an absent/invalid/offline file all yield an empty
 *  log, same as sdBackup's own "no file yet" handling. */
export async function readMaintenanceLog(io: MaintenanceIO = defaultMaintenanceIO()): Promise<MaintenanceLog> {
	try {
		const text = await io.read();
		return parseMaintenanceLog(text) ?? emptyMaintenanceLog();
	} catch {
		return emptyMaintenanceLog();
	}
}

export type MaintenanceWriteResult = "written" | "failed";

/** Appends one entry and writes the whole file back (log files are small - hundreds of entries over
 *  years of use - so a rewrite-the-whole-file approach is simpler and safer than any partial-append
 *  scheme, and matches every other SD-JSON write in this codebase). */
export async function appendMaintenanceEntry(
	entry: Omit<MaintenanceEntry, "id">, io: MaintenanceIO = defaultMaintenanceIO(),
): Promise<MaintenanceWriteResult> {
	const log = await readMaintenanceLog(io);
	const id = `${entry.loggedAt}-${Math.random().toString(36).slice(2, 8)}`;
	log.entries.push({ ...entry, id });
	try {
		await io.write(JSON.stringify(log));
		return "written";
	} catch {
		return "failed";
	}
}

/** Most recent entry for a category (by loggedAt), or null if nothing's been logged for it yet. */
export function mostRecentEntry(log: MaintenanceLog, category: string): MaintenanceEntry | null {
	const matches = log.entries.filter((e) => e.category === category);
	if (!matches.length) {
		return null;
	}
	return matches.reduce((latest, e) => (e.loggedAt > latest.loggedAt ? e : latest));
}

/** "Since last service": a live counter minus a stored baseline. Null (not 0, and not thrown) if
 *  either side is unknown - a live counter that hasn't started tracking yet, or a baseline that was
 *  logged while offline - rather than presenting a misleadingly precise number. */
export function secondsSince(liveTotal: number | null, baseline: number | null): number | null {
	if (liveTotal == null || baseline == null) {
		return null;
	}
	return Math.max(0, liveTotal - baseline);
}
