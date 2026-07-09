/**
 * Wipes every trace of Flexible Layouts' own persisted state (profiles/pages/widgets, theme, the
 * access-lock configuration, and every FL-owned preference) so the plugin behaves exactly as if it
 * had just been installed. Does not touch DWC's own settings (e.g. which layout is active) - those
 * aren't FL's to reset. Reloading afterwards (the caller's job, not this function's) is what actually
 * re-initialises the app from the now-pristine state.
 */
import { useCacheStore } from "@/stores/cache";
import { useSettingsStore } from "@/stores/settings";

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
