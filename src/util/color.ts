/**
 * Colour helpers shared by the widgets and the colour picker.
 *
 * A widget/panel colour can be either a Vuetify theme token (e.g. "primary", "warning") or a literal
 * CSS colour (e.g. "#ff8800", "rgb(…)") — the latter is what the free colour picker and the named
 * theme colours store. `resolveColor` turns either form into a value usable in a CSS `color:` /
 * `stroke:` declaration. (Vuetify's own `color` prop already accepts both, so components that pass the
 * value straight to `:color` don't need this.)
 */

/** True when the value is a literal CSS colour (hex / rgb / hsl) rather than a theme-token name. */
export function isCssColor(value: string): boolean {
	return /^\s*(#|rgb|hsl)/i.test(value);
}

/**
 * Resolve a widget colour to a CSS colour string. Theme-token names become the live theme variable
 * so they track light/dark + the active palette; literal colours are returned as-is. Falsy input
 * falls back to the given token (default "primary").
 */
export function resolveColor(value?: string, fallback = "primary"): string {
	if (!value) {
		return `rgb(var(--v-theme-${fallback}))`;
	}
	return isCssColor(value) ? value.trim() : `rgb(var(--v-theme-${value}))`;
}
