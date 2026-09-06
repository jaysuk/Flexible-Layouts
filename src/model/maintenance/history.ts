/**
 * Daily usage snapshots for trend charting (Item G). Unlike the live counters (accumulated entirely
 * on the controller via the daemon macro - see macros.ts) and the manual log (browser-written, but
 * only on explicit user action - see log.ts), these rollups are written from the BROWSER on a
 * "once per calendar day, whenever DWC happens to be open and connected" basis. That's a deliberate,
 * lower-risk choice: extending the daemon macro with a fourth "is it a new day" trigger would add
 * more firmware-side risk (macros.ts already carries the bulk of this feature's real-world risk) for
 * what is explicitly a nice-to-have. The practical trade-off: a calendar day DWC was never open on
 * gets no snapshot (a gap in the 30-day ring) - acceptable for trend charting, unlike the live
 * counters (must never miss anything) or the maintenance log (must never lose an entry).
 *
 * A day's snapshot is the CUMULATIVE counter values as of whenever it was taken that day (last write
 * wins if DWC is opened more than once in a day) - not that day's activity alone. The trend chart
 * derives per-day activity by diffing consecutive days' cumulative values at render time, the same
 * "subtract to get a delta" principle log.ts's secondsSince() already uses for the live counters.
 */
import { useMachineStore } from "@/stores/machine";

const HISTORY_PATH_DIR = "0:/sys";
export const MAINT_HISTORY_PATH = `${HISTORY_PATH_DIR}/flexible-layouts.maintenance-history.json`;

const HISTORY_KIND = "flexible-layouts-maintenance-history";
const HISTORY_SCHEMA = 1;

/** Ring capacity - oldest day is dropped once a new day's snapshot would exceed this. */
export const MAX_HISTORY_DAYS = 30;

export interface DailySnapshot {
	/** Calendar date this snapshot was taken for, "YYYY-MM-DD" in the BROWSER's local time zone -
	 *  matches how a human reads "today" on the machine they're standing in front of. */
	date: string;
	spindleSeconds: number | null;
	printSeconds: number | null;
	filamentMm: number | null;
	toolChanges: number | null;
	powerOnSeconds: number | null;
	jobsStarted: number | null;
	jobsFinished: number | null;
	jobsCancelled: number | null;
}

export interface MaintenanceHistory {
	kind: typeof HISTORY_KIND;
	schemaVersion: number;
	/** Oldest first, capped to {@link MAX_HISTORY_DAYS}, at most one entry per date. */
	days: Array<DailySnapshot>;
}

export function emptyMaintenanceHistory(): MaintenanceHistory {
	return { kind: HISTORY_KIND, schemaVersion: HISTORY_SCHEMA, days: [] };
}

/** "YYYY-MM-DD" for a Date in ITS OWN local time zone (not UTC - `toISOString()` would silently shift
 *  a snapshot taken near midnight onto the wrong calendar day for the user actually standing there). */
export function dateKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Parse + validate a history file's text. Returns null for anything that isn't this plugin's
 *  history format (same tolerant contract as log.ts's parseMaintenanceLog). */
export function parseMaintenanceHistory(text: string): MaintenanceHistory | null {
	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		return null;
	}
	if (!obj || typeof obj !== "object") {
		return null;
	}
	const h = obj as Partial<MaintenanceHistory>;
	if (h.kind !== HISTORY_KIND || !Array.isArray(h.days)) {
		return null;
	}
	const days = h.days.filter((d): d is DailySnapshot =>
		!!d && typeof d === "object" && typeof (d as DailySnapshot).date === "string");
	return { kind: HISTORY_KIND, schemaVersion: typeof h.schemaVersion === "number" ? h.schemaVersion : 1, days };
}

/** Given the existing history and today's live counter values, returns the updated history - or null
 *  if today's entry already exists and would be unchanged (so callers can skip an SD write entirely
 *  on every subsequent poll within the same day). Replaces (not appends) an existing same-day entry,
 *  so opening DWC twice in one day updates that day's figures rather than duplicating the row. Pure -
 *  no IO, no Date.now() - everything the caller already knows is passed in, for testability. */
export function withDailySnapshot(history: MaintenanceHistory, today: DailySnapshot): MaintenanceHistory | null {
	const existingIndex = history.days.findIndex((d) => d.date === today.date);
	if (existingIndex !== -1 && JSON.stringify(history.days[existingIndex]) === JSON.stringify(today)) {
		return null; // nothing changed - skip the write
	}
	const days = existingIndex !== -1
		? history.days.map((d, i) => (i === existingIndex ? today : d))
		: [...history.days, today];
	days.sort((a, b) => a.date.localeCompare(b.date));
	while (days.length > MAX_HISTORY_DAYS) {
		days.shift();
	}
	return { kind: HISTORY_KIND, schemaVersion: HISTORY_SCHEMA, days };
}

/** One day's activity derived by diffing it against the previous day's cumulative snapshot - null for
 *  a counter where either day is missing a value, or where the two snapshots aren't on CONSECUTIVE
 *  calendar dates (a gap in the ring - see the class doc - means we don't actually know how much of
 *  the multi-day delta happened on this particular day, so showing it as "one day's activity" would
 *  be misleading). Clamped to 0 the same way secondsSince() clamps a reset counter. */
export function dailyDelta(day: DailySnapshot, previous: DailySnapshot | undefined, key: Exclude<keyof DailySnapshot, "date">): number | null {
	if (!previous) {
		return null;
	}
	if (!isNextCalendarDay(previous.date, day.date)) {
		return null;
	}
	const a = previous[key];
	const b = day[key];
	if (a == null || b == null) {
		return null;
	}
	return Math.max(0, b - a);
}

function isNextCalendarDay(prevDate: string, date: string): boolean {
	const prev = new Date(`${prevDate}T00:00:00`);
	const cur = new Date(`${date}T00:00:00`);
	const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
	return diffDays === 1;
}

// --- SD read/write (best-effort, mirrors log.ts) --------------------------------------------------

export interface MaintenanceHistoryIO {
	read(): Promise<string>;
	write(text: string): Promise<void>;
}

async function blobToText(v: unknown): Promise<string> {
	if (typeof v === "string") { return v; }
	if (v instanceof Blob) { return v.text(); }
	return String(v);
}

export function defaultMaintenanceHistoryIO(): MaintenanceHistoryIO {
	const machineStore = useMachineStore();
	return {
		async read() {
			return blobToText(await machineStore.download({ filename: MAINT_HISTORY_PATH, type: "text" }, false, false, false));
		},
		async write(text) {
			await machineStore.upload({ filename: MAINT_HISTORY_PATH, content: new Blob([text], { type: "application/json" }) }, false, false, false);
		},
	};
}

/** Reads the history from the SD card. Never throws - an absent/invalid/offline file all yield an
 *  empty history, the same "no data yet" handling every other SD-JSON read in this plugin uses. */
export async function readMaintenanceHistory(io: MaintenanceHistoryIO = defaultMaintenanceHistoryIO()): Promise<MaintenanceHistory> {
	try {
		const text = await io.read();
		return parseMaintenanceHistory(text) ?? emptyMaintenanceHistory();
	} catch {
		return emptyMaintenanceHistory();
	}
}

/** Reads the history, folds in today's snapshot if it's new/changed, and writes it back - a no-op
 *  (no write at all) if today's entry is already up to date. Best-effort like every other write here;
 *  the trend chart is nice-to-have, so a failed write here must never surface as an error to the user
 *  the way a failed manual-log write does. */
export async function recordDailySnapshot(
	today: DailySnapshot, io: MaintenanceHistoryIO = defaultMaintenanceHistoryIO(),
): Promise<boolean> {
	const history = await readMaintenanceHistory(io);
	const updated = withDailySnapshot(history, today);
	if (!updated) {
		return true; // nothing to do - not a failure
	}
	try {
		await io.write(JSON.stringify(updated));
		return true;
	} catch {
		return false;
	}
}
