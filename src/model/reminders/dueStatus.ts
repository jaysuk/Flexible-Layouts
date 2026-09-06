/**
 * Pure due/overdue arithmetic for service-interval reminders (Item H) - the one gap neither FL nor
 * Vigil had before this: knowing when maintenance is actually DUE, not just how many hours have
 * accumulated. Deliberately separated from storage.ts/nudge.ts (no Vue, no localStorage, no OM) so
 * the threshold logic itself is trivially unit-testable.
 */

export type DueStatus = "unknown" | "ok" | "dueSoon" | "overdue";

/** A rule counts as "due soon" once it's within this fraction of its interval - e.g. 0.9 means a
 *  warning at 90% of the way to the threshold, giving the operator advance notice rather than the
 *  reminder appearing for the first time already overdue. */
const DUE_SOON_FRACTION = 0.9;

/** `delta` is whatever {@link import("../maintenance/log").secondsSince} already computed (live value
 *  minus the logged baseline) - null propagates to "unknown" rather than a false "overdue", the same
 *  "genuinely don't know" convention every other figure in this feature already follows. An interval
 *  of 0 or less is treated as "unknown" too - not configured, not "always overdue". */
export function computeDueStatus(delta: number | null, intervalValue: number): DueStatus {
	if (delta == null || intervalValue <= 0) {
		return "unknown";
	}
	if (delta >= intervalValue) {
		return "overdue";
	}
	if (delta >= intervalValue * DUE_SOON_FRACTION) {
		return "dueSoon";
	}
	return "ok";
}
