/**
 * Keyboard and screen-reader access for click targets that are not `<button>`s - the SVG sectors of the jog pads, a
 * shaped button, a shaped hotspot region (MISSING-FEATURES-PLAN §B8 step 3).
 *
 * `v-svg-button="{ label, disabled?, tabindex? }"` gives the element `role="button"`, an accessible name, a tab stop,
 * and Enter/Space activation that fires the element's OWN click handler - so every guard the click already has (disabled,
 * print lock, the unhomed-axis check, debounce, confirm) applies unchanged. A keyboard press is not a side door.
 * The visible focus ring is the `.fl-svg-button:focus-visible` rule in FlexShell.vue.
 */
import type { Directive } from "vue";

export interface SvgButtonOptions {
	/** The accessible name ("X+10", "Home all"). */
	label: string;
	/** Announced as disabled and skipped by Tab. The click handler still does its own guarding. */
	disabled?: boolean;
	/** Override the tab stop: a roving group makes only one member `0`. Defaults to 0 (or -1 when disabled). */
	tabindex?: 0 | -1;
}

function options(value: SvgButtonOptions | string): SvgButtonOptions {
	return typeof value === "string" ? { label: value } : value;
}

function apply(el: Element, value: SvgButtonOptions | string): void {
	const o = options(value);
	el.classList.add("fl-svg-button");
	el.setAttribute("role", "button");
	el.setAttribute("aria-label", o.label);
	if (o.disabled) { el.setAttribute("aria-disabled", "true"); } else { el.removeAttribute("aria-disabled"); }
	el.setAttribute("tabindex", String(o.tabindex ?? (o.disabled ? -1 : 0)));
}

function onKeydown(e: Event): void {
	const k = e as KeyboardEvent;
	if (k.key !== "Enter" && k.key !== " ") { return; }
	const el = k.currentTarget as Element;
	if (k.target !== el) { return; } // a key pressed inside something nested is not ours
	if (el.getAttribute("aria-disabled") === "true") { return; }
	k.preventDefault(); // Space would otherwise scroll the page
	el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

export const vSvgButton: Directive<Element, SvgButtonOptions | string> = {
	mounted(el, binding) {
		apply(el, binding.value);
		el.addEventListener("keydown", onKeydown);
	},
	updated(el, binding) {
		apply(el, binding.value);
	},
	unmounted(el) {
		el.removeEventListener("keydown", onKeydown);
	},
};

// #region roving focus
/**
 * Arrow-key navigation over a ring pad, so the whole pad is ONE tab stop instead of one per sector.
 *
 * `directions` lists the pad's directions in clockwise order; each is its rings' ids from the OUTER ring inward. Left and
 * Right go round the pad (same ring), Up moves to the next ring out, Down to the next ring in, Home to the outermost ring
 * and End to the innermost. Returns the id to move to, or null when the key is not one of these (or nothing would move).
 */
export function ringNavigation(directions: Array<Array<string>>, current: string, key: string): string | null {
	const d = directions.findIndex((ids) => ids.includes(current));
	if (d < 0) { return null; }
	const k = directions[d].indexOf(current);
	const rings = directions[d].length;
	const at = (dir: number, ring: number): string | undefined => directions[((dir % directions.length) + directions.length) % directions.length][Math.min(rings - 1, Math.max(0, ring))];
	let next: string | undefined;
	switch (key) {
		case "ArrowRight": next = at(d + 1, k); break;
		case "ArrowLeft": next = at(d - 1, k); break;
		case "ArrowUp": next = at(d, k - 1); break;
		case "ArrowDown": next = at(d, k + 1); break;
		case "Home": next = at(d, 0); break;
		case "End": next = at(d, rings - 1); break;
		default: return null;
	}
	return next && next !== current ? next : null;
}
// #endregion
