/**
 * Wipes every trace of Flexible Layouts' own persisted state (profiles/pages/widgets, theme, the
 * access-lock configuration, and every FL-owned preference) so the plugin behaves exactly as if it
 * had just been installed. Does not touch DWC's own settings (e.g. which layout is active) - those
 * aren't FL's to reset. Reloading afterwards (the caller's job, not this function's) is what actually
 * re-initialises the app from the now-pristine state.
 */
import { useCacheStore } from "@/stores/cache";
import { useSettingsStore } from "@/stores/settings";

import { defaultAccessConfig, setAccess } from "./access";
import { useLayoutStore } from "./store";
import { applyTheme } from "./theme";
import { writeHistorySnapshot, type HistoryIO } from "./sdBackup";

const PLUGIN_KEY = "flexibleLayouts";
const LOCAL_STORAGE_PREFIX = "flexibleLayouts.";

export async function resetToDefaults(): Promise<void> {
	// Wipes profiles/document/activeProfile AND the access-lock configuration (Admin/Operator
	// passwords, whether it's even enabled) - a fresh install has none of that either.
	const settings = useSettingsStore();
	const plugins = settings.plugins as Record<string, unknown>;
	delete plugins[PLUGIN_KEY];

	// Every FL-owned localStorage key (update-check prefs, SD-backup prefs, the pre-import safety
	// snapshot, the update-hub skip list). Collect first, then remove - mutating while iterating
	// a live, shrinking key list would skip entries.
	try {
		const ls = window.localStorage;
		const staleKeys: Array<string> = [];
		for (let i = 0; i < ls.length; i++) {
			const key = ls.key(i);
			if (key?.startsWith(LOCAL_STORAGE_PREFIX)) {
				staleKeys.push(key);
			}
		}
		for (const key of staleKeys) {
			ls.removeItem(key);
		}
	} catch { /* storage disabled */ }

	// Suppress the welcome dialog - a deliberate admin reset isn't a new user's first load - but
	// clear the "already offered to activate the custom layout" flag so that part behaves like a
	// genuinely fresh install.
	const cacheStore = useCacheStore();
	cacheStore.setPluginData(PLUGIN_KEY, "seenWelcome", true);
	cacheStore.setPluginData(PLUGIN_KEY, "promptedActivate", false);

	// DWC debounces its settings/cache autosave rather than writing on every mutation, so without
	// this, a reload right after the mutations above races the debounce timer and reloads the board's
	// still-old file - the wipe never actually reaches the board and the "reset" silently does
	// nothing. Explicitly flushing both here (optional-chained: the test stubs for these stores don't
	// implement save(), and no-op is exactly the right behaviour there) makes sure the wipe is
	// actually on the board before the caller reloads.
	await (settings as { save?: () => Promise<void> }).save?.();
	await (cacheStore as { save?: () => Promise<void> }).save?.();
}

// --- Scoped resets ---------------------------------------------------------------------------------
//
// resetToDefaults() above is the nuclear option. These reset ONE section, so a user who wants their
// palette back doesn't lose every page and password with it. Each is deliberately narrow and touches
// nothing outside its own section - the tests assert that explicitly, because "reset X" quietly
// clearing Y is exactly the kind of bug that costs someone their layout.
//
// They mutate live state directly; run them through resetSectionWithHistory() (below) to get a
// revertible snapshot first.

/** Sections that can be reset individually. */
export type ResetSection =
	| "theme" | "nav" | "header" | "access" | "startupRoutes" | "updatePrefs" | "sdBackupPrefs";

/** Remove every localStorage key under a prefix. Collect-then-remove: mutating a live, shrinking key
 *  list while iterating it skips entries. */
function removeLocalStorageKeys(prefix: string): void {
	try {
		const ls = window.localStorage;
		const stale: Array<string> = [];
		for (let i = 0; i < ls.length; i++) {
			const key = ls.key(i);
			if (key?.startsWith(prefix)) {
				stale.push(key);
			}
		}
		for (const key of stale) {
			ls.removeItem(key);
		}
	} catch { /* storage disabled */ }
}

/** Palette, custom colours and the dark-base flag, back to a stock (disabled) theme. */
export function resetTheme(): void {
	useLayoutStore().document.value.theme = { enabled: false, colors: {} };
	applyTheme(); // the live Vuetify theme is registered from this; without it the UI keeps the old palette
}

/** Menu ordering, hidden pages and user-created categories. Does NOT delete any page - a hidden page
 *  reappears in the menu, it isn't recreated, because it was never removed. */
export function resetNav(): void {
	useLayoutStore().document.value.nav = { order: [], hidden: [] };
}

/** Top app-bar chrome (pinned widgets, colour, title, logo). Cleared rather than re-seeded: the
 *  seeded default belongs to profile creation, and re-adding widgets here would be a surprise. */
export function resetHeader(): void {
	delete useLayoutStore().document.value.header;
}

/** Access-lock configuration: both tiers off, passwords cleared, e-stop visible again. */
export function resetAccess(): void {
	setAccess(defaultAccessConfig());
}

/** The "open this page on load" and "jump here when a job starts" routes. */
export function resetStartupRoutes(): void {
	const doc = useLayoutStore().document.value;
	delete doc.startupPath;
	delete doc.jobStartPath;
}

/** Update-check preferences (enabled, last check, dismissed release, cached result). */
export function resetUpdatePrefs(): void {
	removeLocalStorageKeys(`${LOCAL_STORAGE_PREFIX}updateCheck.`);
}

/** SD auto-backup preferences (enabled, and which backup the user declined to restore). */
export function resetSdBackupPrefs(): void {
	removeLocalStorageKeys(`${LOCAL_STORAGE_PREFIX}sdBackup.`);
}

const SECTION_RESETS: Record<ResetSection, () => void> = {
	theme: resetTheme,
	nav: resetNav,
	header: resetHeader,
	access: resetAccess,
	startupRoutes: resetStartupRoutes,
	updatePrefs: resetUpdatePrefs,
	sdBackupPrefs: resetSdBackupPrefs,
};

/** Reset one section, without taking a history snapshot. Prefer {@link resetSectionWithHistory}. */
export function resetSection(section: ResetSection): void {
	SECTION_RESETS[section]();
}

/**
 * Reset one section, snapshotting the current layout to the version-history ring first so the reset
 * can be undone. A failed snapshot does NOT block the reset - the user asked for it, the machine may
 * simply be offline, and refusing would be more surprising than proceeding. The return value says
 * which happened so the UI can be honest about whether an undo point exists.
 */
export async function resetSectionWithHistory(
	section: ResetSection, io?: HistoryIO,
): Promise<{ reset: true; snapshot: Awaited<ReturnType<typeof writeHistorySnapshot>> }> {
	const snapshot = await writeHistorySnapshot(`before-reset-${section}`, io).catch(() => "failed" as const);
	resetSection(section);
	return { reset: true, snapshot };
}
