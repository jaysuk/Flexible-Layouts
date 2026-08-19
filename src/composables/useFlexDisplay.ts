/**
 * Lightweight responsive-breakpoint composable, upgrading to Vuetify's own `useDisplay()` when it's
 * genuinely available and falling back to a `window.matchMedia`-based implementation otherwise.
 *
 * DWC 3.7.0-beta.3 started externalising the bare `"vuetify"` package to `window.DWC.Vuetify`
 * (previously only `"vuetify/components"` was externalised - see PLUGINS.md's "Importing from DWC"
 * table). That's what makes calling Vuetify's real `useDisplay()` safe now: it reaches the SAME
 * Vuetify instance DWC's own shell uses, so its provide/inject correctly finds DWC's real breakpoint
 * state - no duplicate Vuetify copy, no mismatched injection keys (the exact problem this composable
 * was originally written to avoid).
 *
 * Deliberately does NOT `import { useDisplay } from "vuetify"` as a static ES import, even though
 * that's now externalised - Rollup would bake in a reference to `window.DWC.Vuetify.useDisplay`
 * UNCONDITIONALLY at build time, and simply EVALUATING that import on an older DWC (any 3.7 install
 * before beta.3, where `window.DWC.Vuetify` doesn't exist yet - the plugin manifest's `dwcVersion:
 * "auto-major"` only resolves to "3.7", it can't express "needs beta.3 specifically") would throw at
 * module load time and take down the WHOLE plugin bundle, not just this one composable. Reading
 * `window.DWC.Vuetify.useDisplay` as a plain runtime property access instead - never a static
 * import - is what makes the fallback below actually reachable on an older DWC rather than moot.
 */
import { onMounted, onUnmounted, ref, type Ref } from "vue";

function useMediaQuery(query: string): Ref<boolean> {
	// matchMedia is synchronous and valid at any time in the browser, so seed the ref with the real
	// value immediately. Initialising to `false` and only correcting in onMounted left a window
	// where the shell briefly believed it was on a narrow screen (drawer overlaps content, status
	// panel hidden) - and any remount re-opened that window. Reading the true width up front closes it.
	const mql = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query) : null;
	const matches = ref(mql?.matches ?? true);
	const update = () => { matches.value = mql?.matches ?? true; };

	onMounted(() => {
		// Re-sync in case the width changed between setup and mount, then listen for changes.
		update();
		mql?.addEventListener("change", update);
	});
	onUnmounted(() => {
		mql?.removeEventListener("change", update);
	});

	return matches;
}

/** Only the three breakpoint refs this composable's callers actually use - not Vuetify's whole
 *  useDisplay() return shape, matching this codebase's convention of loosely typing only what's read
 *  from an external surface rather than importing its full type (which here would also mean adding
 *  `vuetify` as a devDependency just for typings). */
interface VuetifyDisplaySubset {
	smAndUp: Ref<boolean>;
	mdAndUp: Ref<boolean>;
	lgAndUp: Ref<boolean>;
}

/** Reads window.DWC.Vuetify.useDisplay as a plain property access (see module doc comment for why
 *  this must never be a static import) and calls it if present. Returns null on any DWC that doesn't
 *  externalise "vuetify" yet. */
function tryRealVuetifyDisplay(): VuetifyDisplaySubset | null {
	const dwc = (typeof window !== "undefined" ? window : undefined) as
		(Window & { DWC?: { Vuetify?: { useDisplay?: () => VuetifyDisplaySubset } } }) | undefined;
	const useDisplay = dwc?.DWC?.Vuetify?.useDisplay;
	return (typeof useDisplay === "function") ? useDisplay() : null;
}

export function useFlexDisplay() {
	const real = tryRealVuetifyDisplay();
	if (real) {
		return { smAndUp: real.smAndUp, mdAndUp: real.mdAndUp, lgAndUp: real.lgAndUp };
	}
	return {
		/** >= 600px */
		smAndUp: useMediaQuery("(min-width: 600px)"),
		/** >= 960px - DWC treats this as the desktop/drawer threshold */
		mdAndUp: useMediaQuery("(min-width: 960px)"),
		/** >= 1280px */
		lgAndUp: useMediaQuery("(min-width: 1280px)"),
	};
}
