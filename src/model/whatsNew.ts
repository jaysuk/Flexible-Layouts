/**
 * "What's new since you last looked" popup: reuses FL's existing self-update-check pipeline
 * (dwc-plugin-runtime's fetchReleaseHistory, already driving the manual "Release notes" button in
 * Settings) rather than authoring a separate curated feature list - the auto-generated
 * Conventional-Commit release notes already read as human-friendly bullets (e.g. "feat: add XYZ
 * corner touch-probe widget for CNC touch plates").
 *
 * `lastSeenVersion` is a per-browser cache-store flag, the same mechanism (and the same limitation -
 * one shared value across every machine this browser manages) as the existing `seenWelcome` first-run
 * flag in FlexShell.vue. It must be SEEDED at first-run time (alongside `seenWelcome`), not only when
 * this dialog is dismissed - otherwise a browser that's never seen the dialog before has no baseline
 * to compare against and the feature would never fire at all.
 */
import { compareVersions, fetchReleaseHistory, type ReleaseHistoryEntry } from "dwc-plugin-runtime";

import { useCacheStore } from "@/stores/cache";

const PLUGIN_KEY = "flexibleLayouts";
const REPO = { owner: "jaysuk", repo: "Flexible-Layouts" };

/** Per-browser "last version this operator was shown a what's-new summary for". Null if never seeded
 *  (a genuine first run, or an older FL build that predates this feature). */
export function getLastSeenVersion(): string | null {
	const plugins = useCacheStore().plugins as Record<string, Record<string, unknown>> | undefined;
	const v = plugins?.[PLUGIN_KEY]?.lastSeenVersion;
	return typeof v === "string" ? v : null;
}

export function markWhatsNewSeen(version: string): void {
	useCacheStore().setPluginData(PLUGIN_KEY, "lastSeenVersion", version);
}

/** Pure/testable: whether a what's-new popup should be offered. False on a never-seeded browser
 *  (nothing to diff against - seeding happens separately, at first-run time) or when already current. */
export function shouldShowWhatsNew(currentVersion: string, lastSeenVersion: string | null): boolean {
	return lastSeenVersion != null && compareVersions(currentVersion, lastSeenVersion) > 0;
}

/** Cumulative release notes since `sinceVersion`. Never throws - [] on any network/parse failure,
 *  same contract as fetchReleaseHistory itself; callers must not auto-open a dialog on an empty result. */
export async function fetchWhatsNewHistory(sinceVersion: string): Promise<Array<ReleaseHistoryEntry>> {
	return fetchReleaseHistory({ ...REPO, sinceVersion });
}
