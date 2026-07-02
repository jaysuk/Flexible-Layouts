/**
 * DWC-consistent panel chrome: whether a freeform widget is wrapped in DWC's own PanelCard - the
 * same v-card + icon/title header bar every built-in panel uses - so custom widgets are visually
 * indistinguishable from stock panels. Default is per widget-type: panel-like widgets (readouts,
 * machine controls, dashboard tiles) get it; compact inline controls and decorative/shape/embed
 * widgets designed to blend into the page or nestle stay chromeless by default. A per-item override
 * always wins over the default (see effectiveChromeForItem).
 */
import type { Widget } from "../model/document";

/**
 * Widget types that default to NO panel chrome: compact inline controls (a title bar over a single
 * slider/toggle is just noise), decorative content meant to blend into the page (headings, images),
 * shape/nestling-oriented controls (jog, shaped buttons), and widgets that already provide their own
 * visual frame - an embedded plugin page, an iframe, or a group's own card - where wrapping again
 * would double-box.
 */
const CHROME_OFF_TYPES = new Set<Widget["type"]>([
	"codeButton", "jog", "octopusJog", "slider", "toggle", "stepper", "input",
	"label", "hotspot", "web", "note", "thumbnail",
	"group", "profileSwitch", "themeToggle", "pluginPage", "embeddable",
	"codeInput", "editModeToggle", "uploadButton", "accessChip",
]);

/** Per-type default. Built-in DWC panels are already PanelCard-based, so they're never re-wrapped. */
export function defaultChromeForWidget(widget: Widget): boolean {
	if (widget.type === "builtinPanel") {
		return false;
	}
	return !CHROME_OFF_TYPES.has(widget.type);
}

/**
 * Effective chrome for a placed item: explicit per-item choice wins, else the per-type default.
 * Built-in panels are never chromed regardless of any stored override (double-boxing is never
 * desired there, and the properties dialog doesn't offer the toggle for that type).
 */
export function effectiveChromeForItem(widget: Widget, explicit?: boolean): boolean {
	if (widget.type === "builtinPanel") {
		return false;
	}
	return explicit ?? defaultChromeForWidget(widget);
}
