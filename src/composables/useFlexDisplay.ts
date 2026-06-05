/**
 * Lightweight responsive-breakpoint composable backed by window.matchMedia.
 *
 * Deliberately avoids `import { useDisplay } from "vuetify"`: the plugin ships as an external
 * IIFE bundle, and the `vuetify` root entry is NOT in DWC's externals map, so importing it
 * would bundle a second copy of Vuetify whose injection keys don't match the host's - breaking
 * useDisplay's provide/inject. matchMedia needs no Vue context and works identically in the
 * in-tree dev build and the packaged ZIP. Thresholds mirror Vuetify's default breakpoints.
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

export function useFlexDisplay() {
	return {
		/** >= 600px */
		smAndUp: useMediaQuery("(min-width: 600px)"),
		/** >= 960px - DWC treats this as the desktop/drawer threshold */
		mdAndUp: useMediaQuery("(min-width: 960px)"),
		/** >= 1280px */
		lgAndUp: useMediaQuery("(min-width: 1280px)"),
	};
}
