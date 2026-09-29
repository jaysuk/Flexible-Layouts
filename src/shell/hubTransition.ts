/**
 * The slide between the phone hub (`/` below md) and a page, as the stock shell does it
 * (DWC `layouts/builtin.vue`'s `hub-forward` / `hub-back`): forward into a page, back out of it to the hub,
 * and no slide for page-to-page navigation.
 *
 * DWC's `DwcRouterView` takes a `transitionName` and wraps the routed page in a `<Transition>`; the shell
 * owns the name and the CSS (`FlexShell.vue`'s unscoped `fl-hub-*` block). The name is set in a
 * navigation guard - before the route component swaps - so the very first frame of the swap already has it.
 * A page that redirects to a default subroute (Settings -> Settings/General) keeps its top-level segment, so
 * it doesn't reset the slide.
 */
import { onUnmounted, ref, type Ref } from "vue";
import { useRouter } from "vue-router";

export const HUB_FORWARD = "fl-hub-forward";
export const HUB_BACK = "fl-hub-back";

/** `/Settings/General` -> `/Settings`, `/` -> `/`. */
export function topLevelPath(path: string): string {
	return "/" + (path.split("/")[1] ?? "");
}

/**
 * Which slide (if any) the navigation `from` -> `to` gets. `canSlide` is whether the hub is in play at all
 * (phone width, DWC-style navigation on, not editing).
 */
export function hubTransitionFor(from: string, to: string, canSlide: boolean): string {
	const toTop = topLevelPath(to);
	const fromTop = topLevelPath(from);
	if (!canSlide || toTop === fromTop) return "";
	if (toTop === "/") return HUB_BACK;
	if (fromTop === "/") return HUB_FORWARD;
	return "";
}

/**
 * The transition name to hand to `DwcRouterView`, kept current by a `beforeEach` guard that lives as long
 * as the calling component. `canSlide` is read at each navigation, not once.
 */
export function useHubTransition(canSlide: () => boolean): Ref<string> {
	const router = useRouter();
	const name = ref("");
	const stop = router.beforeEach((to, from) => {
		name.value = hubTransitionFor(from.path, to.path, canSlide());
	});
	onUnmounted(stop);
	return name;
}
