/**
 * Global theme/palette applied from the layout document.
 *
 * Wraps DWC's registerTheme so the user's chosen palette (document.theme) becomes the active
 * Vuetify theme. registerTheme tokens are reactive CSS variables, so colour edits update the whole
 * UI live. Activation is via settings.themeName; deactivation clears it and unregisters.
 */
import { registerTheme, unregisterTheme } from "@/plugins";
import { useSettingsStore } from "@/stores/settings";

import { useLayoutStore } from "./store";

const THEME_NAME = "flex-custom";

/** Vuetify colour tokens the palette editor exposes. */
export const THEME_TOKENS = [
	"primary",
	"secondary",
	"background",
	"surface",
	"error",
	"info",
	"success",
	"warning",
	// DWC 3.7.0-alpha.7 themeable accents. `card-actions` (renamed from alpha.6's `dialog-action`)
	// recolours every button inside a v-card-actions row (Cancel/OK/Apply, …); `card-title` the panel
	// & dialog titles; `main-menu-category`/`main-menu-route` the nav drawer; `macro-directory` the
	// macro-list folder avatars; `chart-grid` the temperature-chart gridlines.
	"card-actions",
	"card-title",
	"main-menu-category",
	"main-menu-route",
	"macro-directory",
	"chart-grid",
] as const;

/**
 * Re-apply the document's theme: unregister any previous instance, then (if enabled) register the
 * current palette and make it active. Idempotent and safe to call after every edit or at load.
 */
export function applyTheme(): void {
	const doc = useLayoutStore().document.value;
	const settings = useSettingsStore();

	// unregisterTheme is a no-op when not registered, so this also covers the first call and HMR.
	unregisterTheme(THEME_NAME);

	if (!doc.theme.enabled) {
		if (settings.themeName === THEME_NAME) {
			settings.themeName = null;
		}
		return;
	}

	// Only forward non-empty tokens so blanks inherit the dark/light base instead of going black.
	const colors: Record<string, string> = {};
	for (const [token, value] of Object.entries(doc.theme.colors)) {
		if (value) {
			colors[token] = value;
		}
	}

	try {
		registerTheme(THEME_NAME, {
			dark: !!doc.theme.dark,
			colors,
			caption: "Flexible Layouts",
		});
		settings.themeName = THEME_NAME;
	} catch (e) {
		console.warn("[FlexibleLayouts] could not apply theme:", (e as Error).message);
	}
}
