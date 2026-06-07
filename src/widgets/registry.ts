/**
 * Widget registry.
 *
 * M1 catalogs DWC's built-in panels - every entry's `component` is a globally-registered DWC
 * component name (see DWC's components.d.ts) that the BuiltInPanelWidget resolves at runtime.
 * Only safely-standalone panels are listed; container/dashboard composites that assume a parent
 * context are excluded for now. Later milestones extend this with plugin pages, freeform widgets
 * and object-model value displays.
 */

import i18n from "@/i18n";

import type { Widget, WidgetType } from "../model/document";

export interface PanelCatalogEntry {
	/** Globally-registered DWC component name. */
	component: string;
	/** i18n key under plugins.flexibleLayouts.panels.* for the friendly label. */
	labelKey: string;
	icon: string;
	/** Default grid footprint (in grid units; default grid is 12 cols, 30px rows). */
	defaultSize: { w: number; h: number };
	/** Optional machine-mode hint so the palette can group/annotate. */
	mode?: "fff" | "cnc" | "any";
}

export const BUILTIN_PANELS: ReadonlyArray<PanelCatalogEntry> = [
	{ component: "StatusPanel",          labelKey: "panels.status",          icon: "mdi-information-outline",  defaultSize: { w: 6, h: 6 },  mode: "any" },
	{ component: "ToolsPanel",           labelKey: "panels.tools",           icon: "mdi-wrench",              defaultSize: { w: 6, h: 6 },  mode: "any" },
	{ component: "MovementPanel",        labelKey: "panels.movement",        icon: "mdi-axis-arrow",          defaultSize: { w: 8, h: 9 },  mode: "any" },
	{ component: "ExtrudePanel",         labelKey: "panels.extrude",         icon: "mdi-printer-3d-nozzle",   defaultSize: { w: 6, h: 7 },  mode: "fff" },
	{ component: "FanPanel",             labelKey: "panels.fan",             icon: "mdi-fan",                 defaultSize: { w: 6, h: 5 },  mode: "any" },
	{ component: "FansPanel",            labelKey: "panels.fans",            icon: "mdi-fan",                 defaultSize: { w: 6, h: 5 },  mode: "any" },
	{ component: "ATXPanel",             labelKey: "panels.atx",             icon: "mdi-power",               defaultSize: { w: 3, h: 4 },  mode: "any" },
	{ component: "BabystepPanel",        labelKey: "panels.babystep",        icon: "mdi-arrow-up-down",       defaultSize: { w: 4, h: 4 },  mode: "fff" },
	{ component: "SpeedFactorPanel",     labelKey: "panels.speedFactor",     icon: "mdi-speedometer",         defaultSize: { w: 4, h: 4 },  mode: "any" },
	{ component: "ExtrusionFactorsPanel", labelKey: "panels.extrusionFactors", icon: "mdi-percent",          defaultSize: { w: 4, h: 5 },  mode: "fff" },
	{ component: "SpindleSpeedPanel",    labelKey: "panels.spindleSpeed",    icon: "mdi-saw-blade",           defaultSize: { w: 4, h: 4 },  mode: "cnc" },
	{ component: "JobControlPanel",      labelKey: "panels.jobControl",      icon: "mdi-play-pause",          defaultSize: { w: 6, h: 6 },  mode: "any" },
	{ component: "JobInfoPanel",         labelKey: "panels.jobInfo",         icon: "mdi-information-outline",  defaultSize: { w: 6, h: 7 },  mode: "any" },
	{ component: "JobTimesPanel",        labelKey: "panels.jobTimes",        icon: "mdi-clock-outline",       defaultSize: { w: 6, h: 5 },  mode: "any" },
	{ component: "WebcamPanel",          labelKey: "panels.webcam",          icon: "mdi-webcam",              defaultSize: { w: 6, h: 8 },  mode: "any" },
	{ component: "MacroList",            labelKey: "panels.macros",          icon: "mdi-cog-play",            defaultSize: { w: 4, h: 9 },  mode: "any" },
];

/** Look up a catalog entry by component name. */
export function findPanelEntry(component: string): PanelCatalogEntry | undefined {
	return BUILTIN_PANELS.find((p) => p.component === component);
}

/** Freeform (user-authored) widget types offered in the palette. */
export interface FreeformCatalogEntry {
	type: Exclude<WidgetType, "builtinPanel">;
	labelKey: string;
	icon: string;
	defaultSize: { w: number; h: number };
}

export const FREEFORM_WIDGETS: ReadonlyArray<FreeformCatalogEntry> = [
	{ type: "group",      labelKey: "widgets.group",      icon: "mdi-group",              defaultSize: { w: 6, h: 6 } },
	{ type: "codeButton", labelKey: "widgets.codeButton", icon: "mdi-gesture-tap-button", defaultSize: { w: 3, h: 3 } },
	{ type: "jog",        labelKey: "widgets.jog",        icon: "mdi-circle-double",      defaultSize: { w: 5, h: 8 } },
	{ type: "input",      labelKey: "widgets.input",      icon: "mdi-form-textbox",       defaultSize: { w: 4, h: 2 } },
	{ type: "value",      labelKey: "widgets.value",      icon: "mdi-counter",            defaultSize: { w: 3, h: 3 } },
	{ type: "label",      labelKey: "widgets.label",      icon: "mdi-format-text",        defaultSize: { w: 4, h: 2 } },
	{ type: "chart",      labelKey: "widgets.chart",      icon: "mdi-chart-line",         defaultSize: { w: 6, h: 6 } },
	{ type: "neopixel",   labelKey: "widgets.neopixel",   icon: "mdi-led-strip-variant",  defaultSize: { w: 4, h: 9 } },
	{ type: "globals",    labelKey: "widgets.globals",    icon: "mdi-variable",           defaultSize: { w: 5, h: 6 } },
	{ type: "web",        labelKey: "widgets.web",        icon: "mdi-web",                defaultSize: { w: 6, h: 8 } },
];

/** Human title + icon for a widget, used by the edit-mode tile header and the palette. */
export function describeWidget(widget: Widget): { title: string; icon: string } {
	switch (widget.type) {
		case "builtinPanel": {
			const entry = findPanelEntry(widget.component);
			return {
				title: entry ? i18n.global.t(`plugins.flexibleLayouts.${entry.labelKey}`) : widget.component,
				icon: entry?.icon ?? "mdi-shape",
			};
		}
		case "codeButton":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.codeButton"),
				icon: widget.icon || "mdi-gesture-tap-button",
			};
		case "value":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.value"),
				icon: "mdi-counter",
			};
		case "label":
			return {
				title: widget.content || i18n.global.t("plugins.flexibleLayouts.widgets.label"),
				icon: widget.variant === "image" ? "mdi-image" : "mdi-format-text",
			};
		case "input":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.input"),
				icon: "mdi-form-textbox",
			};
		case "web":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.web"), icon: "mdi-web" };
		case "chart":
			return {
				title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.chart"),
				icon: "mdi-chart-line",
			};
		case "pluginPage":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.pluginPage"),
				icon: "mdi-puzzle",
			};
		case "group":
			return {
				title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.group"),
				icon: "mdi-group",
			};
		case "jog":
			return {
				title: i18n.global.t("plugins.flexibleLayouts.widgets.jog"),
				icon: "mdi-circle-double",
			};
		case "neopixel":
			return {
				title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.neopixel"),
				icon: "mdi-led-strip-variant",
			};
		case "globals":
			return {
				title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.globals"),
				icon: "mdi-variable",
			};
	}
}
