/**
 * Parses RRF's own event log (enabled via `M929 P"eventlog.txt" S1`, confirmed live against RRF's
 * real G-code dictionary - WARN level already covers job start/finish/cancel) for job-completion
 * statistics. RRF writes this file on the controller regardless of whether DWC is connected, so
 * whatever's accumulated is correct whenever FL happens to read it - the same technique a real
 * third-party plugin (PrintStats by fotomas) already uses; this is a from-scratch TypeScript port of
 * its parsing approach (adapted to this codebase's conventions), not a copy of its Vue2 source.
 *
 * Format (one line per event, WARN-level entries look like
 * `2024-01-01 12:34:56 [warn] Print finished, print time was 2h 15m` in practice - exact wording
 * varies by RRF version, so this only depends on the parts confirmed stable: an ISO date/time prefix
 * (or none, in which case the last-seen date carries forward - RRF omits it on some lines), a
 * `[warn]` tag, and "finished"/"cancelled" plus an optional "print time was Xh Ym" substring.
 */
export interface JobEvent {
	/** Parsed as UTC - RRF's log timestamps have no timezone marker, so this is a best-effort absolute
	 *  ordering, not a precise local time. */
	date: Date;
	finished: boolean;
	cancelled: boolean;
	/** A real print starting (not a simulation - see the "simulat" exclusion below, confirmed against
	 *  RRF's actual source: `GCodes.cpp` logs "Started simulating printing file %s" for a dry run and
	 *  "Started printing file %s" for a real one, both at the same WARN level). */
	started: boolean;
	/** Null when the log line didn't include a duration (seen on some cancelled-job lines). */
	printMinutes: number | null;
}

const TIMESTAMP_RE = /(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/;
const PRINT_TIME_RE = /print time was (\d+)h\s*(\d+)m/i;

function extractPrintTimeMinutes(line: string): number | null {
	const m = PRINT_TIME_RE.exec(line);
	if (!m) { return null; }
	return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Never throws - malformed/unrecognised lines are simply skipped, matching every other
 *  best-effort parser in this codebase. */
export function parseEventLog(text: string): Array<JobEvent> {
	const events: Array<JobEvent> = [];
	let lastSeenDateStr: string | null = null;

	for (const rawLine of (text || "").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || /^power up\b/i.test(line)) { continue; }

		const m = TIMESTAMP_RE.exec(line);
		if (!m && !lastSeenDateStr) { continue; }
		const dateStr: string | null = m ? m[1] : lastSeenDateStr;
		const timeStr = (m && m[2]) ? m[2] : "00:00:00";
		if (dateStr) { lastSeenDateStr = dateStr; }

		const lc = line.toLowerCase();
		if (!lc.includes("[warn]")) { continue; }
		const finished = lc.includes("finished");
		const cancelled = lc.includes("cancelled") || lc.includes("canceled");
		const started = lc.includes("started") && !lc.includes("simulat");
		if (!finished && !cancelled && !started) { continue; }

		const date = new Date(`${dateStr}T${timeStr}Z`);
		if (Number.isNaN(date.getTime())) { continue; }

		events.push({ date, finished, cancelled, started, printMinutes: extractPrintTimeMinutes(line) });
	}
	return events;
}

/** Cumulative job-run seconds across every event with a known duration (finished AND cancelled jobs
 *  both count toward machine-on-time for maintenance purposes - a cancelled job still ran the
 *  spindle/motors for however long it got). */
export function totalJobSeconds(events: Array<JobEvent>): number {
	return events.reduce((sum, e) => sum + (e.printMinutes ?? 0) * 60, 0);
}

export interface JobEventCounts {
	finished: number;
	cancelled: number;
	started: number;
}

export function countJobEvents(events: Array<JobEvent>): JobEventCounts {
	return events.reduce(
		(acc, e) => ({
			finished: acc.finished + (e.finished ? 1 : 0),
			cancelled: acc.cancelled + (e.cancelled ? 1 : 0),
			started: acc.started + (e.started ? 1 : 0),
		}),
		{ finished: 0, cancelled: 0, started: 0 },
	);
}
