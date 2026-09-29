/**
 * "Full page" support: scroll the document to its bottom edge so a viewport-filling page opens flush
 * with the status region scrolled off the top - the same thing DWC's own `scrollPageToBottom()`
 * (src/router/index.ts) does for the stock Explorer, G-code viewer and height map. That helper lives
 * in `@/router`, which isn't part of the plugin API surface, so it's mirrored here.
 *
 * The destination's content settles asynchronously (canvases sized on a debounce, the status row
 * reflowing live), so the document keeps growing after the first scroll; it's repeated over the first
 * second to chase the growing bottom - the first pass animates, the catch-up passes jump instantly so
 * they don't queue competing smooth animations.
 */
import { useSettingsStore } from "@/stores/settings";

/** Delays (ms) of the catch-up passes that follow the initial animated scroll. */
const CATCH_UP_MS = [300, 700, 1100];

/**
 * Whether the user's own "auto-scroll" preference (Settings > Behaviour) allows page-level scrolling.
 * Compared as a string rather than via DWC's `AutoScrollMode` enum so this also holds on a DWC build
 * that predates the setting (undefined => allowed).
 */
function autoScrollAllowed(): boolean {
	const behaviour = (useSettingsStore() as unknown as { behaviour?: { autoScrollMode?: string } }).behaviour;
	return behaviour?.autoScrollMode !== "off";
}

/**
 * Scroll to the bottom of the document (and keep chasing it briefly). A no-op when `enabled` is false
 * (e.g. below md, where the stacked layout has no status row to scroll past) or the user turned
 * auto-scroll off. Returns whether a scroll was scheduled.
 */
export function scrollPageToBottom(enabled = true): boolean {
	if (!enabled || !autoScrollAllowed() || typeof window === "undefined") {
		return false;
	}
	const scrollToEnd = (smooth: boolean) => {
		window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" });
	};
	requestAnimationFrame(() => scrollToEnd(true));
	for (const delay of CATCH_UP_MS) {
		setTimeout(() => scrollToEnd(false), delay);
	}
	return true;
}
