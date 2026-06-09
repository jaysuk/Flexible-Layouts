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
	{ component: "TemperatureChart",     labelKey: "panels.temperatureChart", icon: "mdi-chart-line",         defaultSize: { w: 8, h: 7 },  mode: "any" },
	{ component: "EventList",            labelKey: "panels.console",         icon: "mdi-console-line",        defaultSize: { w: 6, h: 8 },  mode: "any" },
];

/** Look up a catalog entry by component name. */
export function findPanelEntry(component: string): PanelCatalogEntry | undefined {
	return BUILTIN_PANELS.find((p) => p.component === component);
}

/** Palette categories, in display order. */
export type WidgetCategory = "controls" | "machine" | "readouts" | "dashboard" | "layout";
export const WIDGET_CATEGORIES: ReadonlyArray<WidgetCategory> = ["controls", "machine", "readouts", "dashboard", "layout"];

/** Freeform (user-authored) widget types offered in the palette. */
export interface FreeformCatalogEntry {
	type: Exclude<WidgetType, "builtinPanel">;
	labelKey: string;
	icon: string;
	defaultSize: { w: number; h: number };
	category: WidgetCategory;
}

export const FREEFORM_WIDGETS: ReadonlyArray<FreeformCatalogEntry> = [
	// Controls — interactive, send commands
	{ type: "codeButton", labelKey: "widgets.codeButton", icon: "mdi-gesture-tap-button", defaultSize: { w: 3, h: 3 }, category: "controls" },
	{ type: "jog",        labelKey: "widgets.jog",        icon: "mdi-circle-double",      defaultSize: { w: 5, h: 8 }, category: "controls" },
	{ type: "slider",     labelKey: "widgets.slider",     icon: "mdi-tune-variant",       defaultSize: { w: 4, h: 2 }, category: "controls" },
	{ type: "toggle",     labelKey: "widgets.toggle",     icon: "mdi-toggle-switch",      defaultSize: { w: 3, h: 2 }, category: "controls" },
	{ type: "stepper",    labelKey: "widgets.stepper",    icon: "mdi-plus-minus-variant", defaultSize: { w: 3, h: 2 }, category: "controls" },
	{ type: "input",      labelKey: "widgets.input",      icon: "mdi-form-textbox",       defaultSize: { w: 4, h: 2 }, category: "controls" },
	{ type: "neopixel",   labelKey: "widgets.neopixel",   icon: "mdi-led-strip-variant",  defaultSize: { w: 4, h: 9 }, category: "controls" },

	// Machine — printer/CNC specific
	{ type: "extruder",   labelKey: "widgets.extruder",   icon: "mdi-printer-3d-nozzle",  defaultSize: { w: 4, h: 6 }, category: "machine" },
	{ type: "fan",        labelKey: "widgets.fan",        icon: "mdi-fan",                defaultSize: { w: 4, h: 2 }, category: "machine" },
	{ type: "heater",     labelKey: "widgets.heater",     icon: "mdi-radiator",           defaultSize: { w: 4, h: 3 }, category: "machine" },
	{ type: "spindle",    labelKey: "widgets.spindle",    icon: "mdi-saw-blade",          defaultSize: { w: 4, h: 3 }, category: "machine" },
	{ type: "wcs",        labelKey: "widgets.wcs",        icon: "mdi-axis-arrow",         defaultSize: { w: 4, h: 3 }, category: "machine" },
	{ type: "toolSelect", labelKey: "widgets.toolSelect", icon: "mdi-tools",              defaultSize: { w: 4, h: 2 }, category: "machine" },
	{ type: "jobControl", labelKey: "widgets.jobControl", icon: "mdi-play-pause",         defaultSize: { w: 4, h: 3 }, category: "machine" },
	{ type: "macros",     labelKey: "widgets.macros",     icon: "mdi-cog-play",           defaultSize: { w: 4, h: 5 }, category: "machine" },
	{ type: "files",      labelKey: "widgets.files",      icon: "mdi-file-document-multiple", defaultSize: { w: 4, h: 6 }, category: "machine" },
	{ type: "jobs",       labelKey: "widgets.jobs",       icon: "mdi-folder-play",        defaultSize: { w: 6, h: 8 }, category: "machine" },
	{ type: "explorer",   labelKey: "widgets.explorer",   icon: "mdi-folder-cog-outline", defaultSize: { w: 6, h: 8 }, category: "machine" },
	{ type: "console",    labelKey: "widgets.console",    icon: "mdi-console-line",       defaultSize: { w: 6, h: 5 }, category: "machine" },

	// Read-outs — display object-model values
	{ type: "value",      labelKey: "widgets.value",      icon: "mdi-counter",            defaultSize: { w: 3, h: 3 }, category: "readouts" },
	{ type: "dro",        labelKey: "widgets.dro",        icon: "mdi-axis-arrow-info",    defaultSize: { w: 3, h: 4 }, category: "readouts" },
	{ type: "table",      labelKey: "widgets.table",      icon: "mdi-table",              defaultSize: { w: 4, h: 4 }, category: "readouts" },
	{ type: "gaugeCluster", labelKey: "widgets.gaugeCluster", icon: "mdi-gauge",          defaultSize: { w: 5, h: 4 }, category: "readouts" },
	{ type: "progress",   labelKey: "widgets.progress",   icon: "mdi-progress-helper",    defaultSize: { w: 4, h: 2 }, category: "readouts" },
	{ type: "status",     labelKey: "widgets.status",     icon: "mdi-circle-slice-8",     defaultSize: { w: 3, h: 2 }, category: "readouts" },
	{ type: "indicators", labelKey: "widgets.indicators", icon: "mdi-led-on",             defaultSize: { w: 4, h: 3 }, category: "readouts" },
	{ type: "chart",      labelKey: "widgets.chart",      icon: "mdi-chart-line",         defaultSize: { w: 6, h: 6 }, category: "readouts" },
	{ type: "sparkline",  labelKey: "widgets.sparkline",  icon: "mdi-chart-bell-curve",   defaultSize: { w: 4, h: 3 }, category: "readouts" },
	{ type: "clock",      labelKey: "widgets.clock",      icon: "mdi-clock-outline",      defaultSize: { w: 3, h: 2 }, category: "readouts" },

	// Dashboard — info, media, notices
	{ type: "alert",      labelKey: "widgets.alert",      icon: "mdi-alert-circle",       defaultSize: { w: 5, h: 2 }, category: "dashboard" },
	{ type: "messageBox", labelKey: "widgets.messageBox", icon: "mdi-message-alert",      defaultSize: { w: 5, h: 3 }, category: "dashboard" },
	{ type: "note",       labelKey: "widgets.note",       icon: "mdi-text-box-outline",   defaultSize: { w: 5, h: 4 }, category: "dashboard" },
	{ type: "eventLog",   labelKey: "widgets.eventLog",   icon: "mdi-console-line",       defaultSize: { w: 6, h: 5 }, category: "dashboard" },
	{ type: "label",      labelKey: "widgets.label",      icon: "mdi-format-text",        defaultSize: { w: 4, h: 2 }, category: "dashboard" },
	{ type: "webcam",     labelKey: "widgets.webcam",     icon: "mdi-webcam",             defaultSize: { w: 6, h: 6 }, category: "dashboard" },
	{ type: "thumbnail",  labelKey: "widgets.thumbnail",  icon: "mdi-image-frame",        defaultSize: { w: 4, h: 5 }, category: "dashboard" },
	{ type: "hotspot",    labelKey: "widgets.hotspot",    icon: "mdi-image-filter-center-focus", defaultSize: { w: 6, h: 6 }, category: "dashboard" },
	{ type: "http",       labelKey: "widgets.http",       icon: "mdi-web-box",            defaultSize: { w: 4, h: 2 }, category: "dashboard" },
	{ type: "web",        labelKey: "widgets.web",        icon: "mdi-web",                defaultSize: { w: 6, h: 8 }, category: "dashboard" },

	// Layout & app
	{ type: "group",      labelKey: "widgets.group",      icon: "mdi-group",              defaultSize: { w: 6, h: 6 }, category: "layout" },
	{ type: "globals",    labelKey: "widgets.globals",    icon: "mdi-variable",           defaultSize: { w: 5, h: 6 }, category: "layout" },
	{ type: "profileSwitch", labelKey: "widgets.profileSwitch", icon: "mdi-layers-triple", defaultSize: { w: 3, h: 2 }, category: "layout" },
	{ type: "themeToggle", labelKey: "widgets.themeToggle", icon: "mdi-theme-light-dark", defaultSize: { w: 3, h: 2 }, category: "layout" },
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
		case "slider":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.slider"),
				icon: "mdi-tune-variant",
			};
		case "toggle":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.toggle"),
				icon: "mdi-toggle-switch",
			};
		case "stepper":
			return {
				title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.stepper"),
				icon: "mdi-plus-minus-variant",
			};
		case "progress":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.progress"), icon: "mdi-progress-helper" };
		case "status":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.status"), icon: "mdi-circle-slice-8" };
		case "alert":
			return { title: widget.message || i18n.global.t("plugins.flexibleLayouts.widgets.alert"), icon: "mdi-alert-circle" };
		case "webcam":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.webcam"), icon: "mdi-webcam" };
		case "macros":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.macros"), icon: "mdi-cog-play" };
		case "console":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.console"), icon: "mdi-console-line" };
		case "heater":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.heater"), icon: "mdi-radiator" };
		case "clock":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.clock"), icon: "mdi-clock-outline" };
		case "thumbnail":
			return { title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.thumbnail"), icon: "mdi-image-frame" };
		case "table":
			return { title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.table"), icon: "mdi-table" };
		case "extruder":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.extruder"), icon: "mdi-printer-3d-nozzle" };
		case "wcs":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.wcs"), icon: "mdi-axis-arrow" };
		case "toolSelect":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.toolSelect"), icon: "mdi-tools" };
		case "fan":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.fan"), icon: "mdi-fan" };
		case "jobControl":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.jobControl"), icon: "mdi-play-pause" };
		case "files":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.files"), icon: "mdi-file-document-multiple" };
		case "jobs":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.jobs"), icon: "mdi-folder-play" };
		case "explorer":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.explorer"), icon: "mdi-folder-cog-outline" };
		case "gaugeCluster":
			return { title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.gaugeCluster"), icon: "mdi-gauge" };
		case "indicators":
			return { title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.indicators"), icon: "mdi-led-on" };
		case "sparkline":
			return { title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.sparkline"), icon: "mdi-chart-bell-curve" };
		case "note":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.note"), icon: "mdi-text-box-outline" };
		case "hotspot":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.hotspot"), icon: "mdi-image-filter-center-focus" };
		case "http":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.http"), icon: "mdi-web-box" };
		case "eventLog":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.eventLog"), icon: "mdi-console-line" };
		case "dro":
			return { title: widget.title || i18n.global.t("plugins.flexibleLayouts.widgets.dro"), icon: "mdi-axis-arrow-info" };
		case "spindle":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.spindle"), icon: "mdi-saw-blade" };
		case "messageBox":
			return { title: i18n.global.t("plugins.flexibleLayouts.widgets.messageBox"), icon: "mdi-message-alert" };
		case "profileSwitch":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.profileSwitch"), icon: "mdi-layers-triple" };
		case "themeToggle":
			return { title: widget.label || i18n.global.t("plugins.flexibleLayouts.widgets.themeToggle"), icon: "mdi-theme-light-dark" };
	}
}
