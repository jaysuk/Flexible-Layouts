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
 *
 * An entry can optionally scope WHICH counters it resets the baseline for (see {@link services} /
 * {@link mostRecentEntryForCounter}) - "changed the collet" shouldn't silently rebaseline spindle
 * hours too. An entry with no `services` at all (every entry logged before this existed, and any new
 * one where the user didn't narrow it) is treated as servicing EVERY counter, preserving the exact
 * pre-existing behaviour.
 *
 * Write integrity: every write computes a checksum over the entries and, after uploading, reads the
 * file straight back and verifies it - an SD-card write can resolve successfully at the HTTP layer
 * while still landing truncated/corrupted on the card itself, and a maintenance log has an explicit
 * "never silently lose an entry" requirement (see the class doc above). See {@link checkLogIntegrity}.
 */
import { useMachineStore } from "@/stores/machine";

const LOG_PATH_DIR = "0:/sys";
export const MAINT_LOG_PATH = `${LOG_PATH_DIR}/flexible-layouts.maintenance-log.json`;

const LOG_KIND = "flexible-layouts-maintenance-log";
const LOG_SCHEMA = 1;

/** Counter keys an entry can name in {@link MaintenanceEntry.services} - deliberately limited to the
 *  counters that already have an `*AtEntry` snapshot field below, so "services this counter" always
 *  has a baseline value to compare against. */
export type MaintenanceCounterKey = "spindleSeconds" | "printSeconds" | "filamentMm" | "toolChanges";

/** Where to read each counter's LIVE value from the object model. The single source of truth for this
 *  mapping - reminders/nudge.ts and MaintenanceWidget.vue both need it (MaintenancePage.vue has its
 *  own already-established liveSpindleSeconds-style computeds instead, so doesn't need this form). */
export const OM_PATH_FOR_COUNTER: Record<MaintenanceCounterKey, string> = {
	spindleSeconds: "global.flMaintSpindleSec",
	printSeconds: "global.flMaintPrintSec",
	filamentMm: "global.flMaintFilamentMm",
	toolChanges: "global.flMaintToolChanges",
};

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
	/** Snapshot of global.flMaintPrintSec (FFF) at logging time; same null rule. Optional (rather than
	 *  matching spindleSecondsAtEntry/jobSecondsAtEntry's required style) because it's genuinely absent
	 *  - not merely null - on any entry logged before this counter existed; secondsSince() already
	 *  treats a missing key the same as an explicit null, so callers don't need to special-case it. */
	printSecondsAtEntry?: number | null;
	/** Snapshot of global.flMaintFilamentMm (FFF) at logging time; same rule as printSecondsAtEntry. */
	filamentMmAtEntry?: number | null;
	/** Snapshot of global.flMaintToolChanges (FFF) at logging time; same rule as printSecondsAtEntry. */
	toolChangesAtEntry?: number | null;
	/** Which counters this entry resets the "since last service" baseline for. Absent/empty means ALL
	 *  of them (the original, pre-this-field behaviour) - never treat absent as "none". */
	services?: Array<MaintenanceCounterKey>;
}

export interface MaintenanceLog {
	kind: typeof LOG_KIND;
	schemaVersion: number;
	entries: Array<MaintenanceEntry>;
	/** FNV-1a hex digest of `JSON.stringify(entries)` - see the class doc's "write integrity"
	 *  paragraph. Absent on any log written before this existed, or one {@link emptyMaintenanceLog}
	 *  freshly created but never yet written - both read as integrity "none", not "mismatch". */
	checksum?: string;
}

export function emptyMaintenanceLog(): MaintenanceLog {
	return { kind: LOG_KIND, schemaVersion: LOG_SCHEMA, entries: [] };
}

// --- Write integrity -----------------------------------------------------------------------------

/** Deterministic, dependency-free 32-bit FNV-1a hash of the entries array's JSON text. NOT
 *  cryptographic - it only needs to catch an accidental truncated/partial SD write (the documented
 *  risk this exists for), not detect deliberate tampering, so there's no need for anything heavier
 *  (and no need for crypto.subtle's secure-context requirement, which the browser-side cert generator
 *  this codebase used to have was gated behind - see git history). */
function hashEntries(entries: Array<MaintenanceEntry>): string {
	const text = JSON.stringify(entries);
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export type MaintenanceIntegrity = "ok" | "mismatch" | "none";

/** Whether a parsed log's checksum (if any) matches its entries. "none" - not a failure - when the
 *  log predates this feature or was never written with one; there's nothing to verify. */
export function checkLogIntegrity(log: MaintenanceLog): MaintenanceIntegrity {
	if (log.checksum == null) {
		return "none";
	}
	return log.checksum === hashEntries(log.entries) ? "ok" : "mismatch";
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
	return {
		kind: LOG_KIND,
		schemaVersion: typeof l.schemaVersion === "number" ? l.schemaVersion : 1,
		entries,
		...(typeof l.checksum === "string" ? { checksum: l.checksum } : {}),
	};
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

export interface MaintenanceLogRead {
	log: MaintenanceLog;
	integrity: MaintenanceIntegrity;
}

/** Reads the log AND reports its checksum integrity - use this from the UI, which needs to warn (and
 *  block further writes) on "mismatch". An absent/invalid/offline file all yield an empty log with
 *  integrity "none", same as the pre-existing "no file yet" handling. */
export async function readMaintenanceLogWithIntegrity(io: MaintenanceIO = defaultMaintenanceIO()): Promise<MaintenanceLogRead> {
	try {
		const text = await io.read();
		const parsed = parseMaintenanceLog(text);
		if (!parsed) {
			return { log: emptyMaintenanceLog(), integrity: "none" };
		}
		return { log: parsed, integrity: checkLogIntegrity(parsed) };
	} catch {
		return { log: emptyMaintenanceLog(), integrity: "none" };
	}
}

/** Reads the log from the SD card. Never throws - an absent/invalid/offline file all yield an empty
 *  log, same as sdBackup's own "no file yet" handling. Every other caller (anything that just needs a
 *  usable log, not the integrity check itself) should use this rather than the richer variant above. */
export async function readMaintenanceLog(io: MaintenanceIO = defaultMaintenanceIO()): Promise<MaintenanceLog> {
	return (await readMaintenanceLogWithIntegrity(io)).log;
}

export type MaintenanceWriteResult = "written" | "failed" | "blocked";

/** Appends one entry and writes the whole file back (log files are small - hundreds of entries over
 *  years of use - so a rewrite-the-whole-file approach is simpler and safer than any partial-append
 *  scheme, and matches every other SD-JSON write in this codebase).
 *
 *  Two integrity checks bracket the write: refuses ("blocked") to touch a file whose EXISTING checksum
 *  already doesn't match - appending on top and rewriting the whole file would stamp a fresh,
 *  valid-looking checksum over data already known to be wrong, destroying the only signal that
 *  something needs manual recovery. After writing, reads the file straight back and verifies it
 *  round-tripped ("failed" if not) - an SD-card upload can resolve successfully at the HTTP layer
 *  while still landing truncated on the card itself. */
export async function appendMaintenanceEntry(
	entry: Omit<MaintenanceEntry, "id">, io: MaintenanceIO = defaultMaintenanceIO(),
): Promise<MaintenanceWriteResult> {
	const { log, integrity } = await readMaintenanceLogWithIntegrity(io);
	if (integrity === "mismatch") {
		return "blocked";
	}
	const id = `${entry.loggedAt}-${Math.random().toString(36).slice(2, 8)}`;
	log.entries.push({ ...entry, id });
	log.checksum = hashEntries(log.entries);
	try {
		await io.write(JSON.stringify(log));
	} catch {
		return "failed";
	}
	try {
		const readBack = parseMaintenanceLog(await io.read());
		if (!readBack || readBack.entries.length !== log.entries.length || checkLogIntegrity(readBack) !== "ok") {
			return "failed";
		}
	} catch {
		return "failed";
	}
	return "written";
}

/** Most recent entry for a category (by loggedAt), or null if nothing's been logged for it yet. */
export function mostRecentEntry(log: MaintenanceLog, category: string): MaintenanceEntry | null {
	const matches = log.entries.filter((e) => e.category === category);
	if (!matches.length) {
		return null;
	}
	return matches.reduce((latest, e) => (e.loggedAt > latest.loggedAt ? e : latest));
}

/** Most recent entry that services a given counter (by loggedAt), independent of category - lets
 *  "since last service" narrow to just the counters an entry actually reset. An entry with no
 *  `services` at all counts as servicing EVERY counter (see the class doc's explanation), so an old
 *  log (or a new entry the user didn't narrow) keeps behaving exactly like {@link mostRecentEntry}
 *  used to for whichever counter is asked about. */
export function mostRecentEntryForCounter(log: MaintenanceLog, counter: MaintenanceCounterKey): MaintenanceEntry | null {
	const matches = log.entries.filter((e) => !e.services || e.services.length === 0 || e.services.includes(counter));
	if (!matches.length) {
		return null;
	}
	return matches.reduce((latest, e) => (e.loggedAt > latest.loggedAt ? e : latest));
}

/** The baseline an entry recorded for one counter key, or null if that entry predates the counter (or
 *  was logged while its value was unavailable) - the same "genuinely missing = null" rule every
 *  `*AtEntry` field already documents individually. */
export function baselineForCounter(entry: MaintenanceEntry, counter: MaintenanceCounterKey): number | null {
	switch (counter) {
		case "spindleSeconds": return entry.spindleSecondsAtEntry;
		case "printSeconds": return entry.printSecondsAtEntry ?? null;
		case "filamentMm": return entry.filamentMmAtEntry ?? null;
		case "toolChanges": return entry.toolChangesAtEntry ?? null;
	}
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

// --- Item E: CSV export --------------------------------------------------------------------------

const CSV_COUNTERS: ReadonlyArray<{ key: MaintenanceCounterKey; header: string }> = [
	{ key: "spindleSeconds", header: "Spindle Seconds" },
	{ key: "printSeconds", header: "Print Seconds" },
	{ key: "filamentMm", header: "Filament mm" },
	{ key: "toolChanges", header: "Tool Changes" },
];

/** RFC 4180-ish escaping: quote (and double up any inner quotes) only when the field actually needs
 *  it - a comma, quote or newline - so a plain field stays readable unquoted. */
function csvField(v: string | number): string {
	const s = String(v);
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Renders the log as CSV: one row per entry, OLDEST FIRST (so each row's "delta" column reads
 *  naturally as "how much this counter accumulated since the previous row", not backwards), with
 *  timestamp/category/note plus every known counter's snapshotted value and its delta from the
 *  previous entry that recorded one. An entry that predates a counter (baseline null/absent) leaves
 *  that counter's cells BLANK, never 0 - a genuine "unknown" must never look like "no change". */
export function maintenanceLogToCsv(log: MaintenanceLog): string {
	const header = ["Logged At", "Category", "Note", ...CSV_COUNTERS.flatMap((c) => [c.header, `${c.header} Delta`])];
	const rows: Array<string> = [header.map(csvField).join(",")];
	const lastSeen: Partial<Record<MaintenanceCounterKey, number>> = {};
	const sorted = [...log.entries].sort((a, b) => a.loggedAt - b.loggedAt);
	for (const entry of sorted) {
		const cells: Array<string> = [new Date(entry.loggedAt).toISOString(), entry.category, entry.note];
		for (const { key } of CSV_COUNTERS) {
			const value = baselineForCounter(entry, key);
			if (value == null) {
				cells.push("", "");
				continue;
			}
			const prev = lastSeen[key];
			cells.push(String(value), prev != null ? String(Math.max(0, value - prev)) : "");
			lastSeen[key] = value;
		}
		rows.push(cells.map(csvField).join(","));
	}
	return rows.join("\r\n") + "\r\n";
}
