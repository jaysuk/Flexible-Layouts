import { computed, type ComputedRef } from "vue";
import { useRouter } from "vue-router";

import { useFlexDisplay } from "../composables/useFlexDisplay";
import { editMode } from "../model/editorState";
import { stockMobileNav } from "../model/mobileNav";

/**
 * Whether the phone hub (tiles to every page) stands in for the dashboard right now: DWC-style phone
 * navigation is on, the screen is below md, and the user is at `/`. Never while editing - the point
 * of being at `/` then is to edit the dashboard. Shared by the dashboard route override (which swaps
 * the content, so DWC's router-view keep-alive and transitions keep working as they do in the stock
 * shell) and FlexShell (which hides the status region and app-bar toggles at the hub).
 */
export function useShowMobileHub(): ComputedRef<boolean> {
	const router = useRouter();
	const { mdAndUp } = useFlexDisplay();
	return computed(() => !mdAndUp.value && stockMobileNav.value && !editMode.value && router.currentRoute.value.path === "/");
}
