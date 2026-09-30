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

// #region contrast (WCAG 2.x)
/** [r, g, b] 0-255, or null for anything that is not a literal hex / rgb() colour (a theme token cannot be resolved without a DOM). */
export function parseRgb(value: string | undefined | null): [number, number, number] | null {
	if (!value) { return null; }
	const s = value.trim();
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
	if (hex) {
		let h = hex[1];
		if (h.length <= 4) { h = h.split("").map((c) => c + c).join(""); }
		return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
	}
	const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i.exec(s);
	if (rgb) {
		const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
		return r <= 255 && g <= 255 && b <= 255 ? [r, g, b] : null;
	}
	return null;
}

function channel(v: number): number {
	const c = v / 255;
	return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** WCAG relative luminance, 0 (black) - 1 (white). */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, 1 (identical) - 21 (black on white); null if either is not a literal colour. */
export function contrastRatio(a: string | undefined | null, b: string | undefined | null): number | null {
	const ca = parseRgb(a);
	const cb = parseRgb(b);
	if (!ca || !cb) { return null; }
	const la = relativeLuminance(ca);
	const lb = relativeLuminance(cb);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG AA for normal-size text. */
export const MIN_TEXT_CONTRAST = 4.5;

/** True when both are literal colours and the pair falls under AA text contrast. Unknown (a theme token) is never flagged. */
export function lowContrast(text: string | undefined | null, background: string | undefined | null): boolean {
	const ratio = contrastRatio(text, background);
	return ratio !== null && ratio < MIN_TEXT_CONTRAST;
}
// #endregion
