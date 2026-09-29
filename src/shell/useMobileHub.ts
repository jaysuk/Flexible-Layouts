import { computed, type ComputedRef } from "vue";
import { useRouter } from "vue-router";

import { useFlexDisplay } from "../composables/useFlexDisplay";
import { editMode } from "../model/editorState";
import { stockMobileNav } from "../model/mobileNav";

/**
 * Whether DWC-style phone navigation is in effect right now: it is on, the screen is below md, and the
 * user isn't editing (the point of `/` while editing is to edit the dashboard, and editing needs the
 * drawer). This does not look at the route - see {@link useShowMobileHub} for "the hub is on screen".
 */
export function useMobileHubMode(): ComputedRef<boolean> {
	const { mdAndUp } = useFlexDisplay();
	return computed(() => !mdAndUp.value && stockMobileNav.value && !editMode.value);
}

/**
 * Whether the phone hub (tiles to every page) stands in for the dashboard right now: phone hub mode, and
 * the user is at `/`. Used by FlexShell, which hides the status region and app-bar toggles at the hub.
 * The dashboard route override does NOT use this: it decides per route record instead (see
 * `page/pageOverride.ts`), so the hub that is sliding out keeps showing the hub rather than turning into
 * the dashboard the moment the route changes.
 */
export function useShowMobileHub(): ComputedRef<boolean> {
	const router = useRouter();
	const mode = useMobileHubMode();
	return computed(() => mode.value && router.currentRoute.value.path === "/");
}
