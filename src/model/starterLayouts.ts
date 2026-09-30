/**
 * Starter layouts (MISSING-FEATURES-PLAN §B7): ready-made pages a user can drop in instead of starting from a
 * blank grid. A registry rather than one function per sample, so the picker, the first-run welcome and the tests
 * all read the same list, and adding a starter is one entry.
 *
 * Starters are ADDITIVE - each creates a new custom page (optionally in its own profile) and never modifies an
 * existing page, matching the rule `presets.ts` always stated. Titles/descriptions are i18n keys; the page title
 * is resolved once, at creation time, because a custom page stores a plain string.
 */
import { MachineMode } from "@duet3d/objectmodel";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";

import { createDefaultWidget, newItemId, type GridItemModel, type Widget, type WidgetType } from "./document";
import { createCustomPage } from "./pageManager";
import { switchProfile } from "./profiles";
import { createProfile, useLayoutStore } from "./store";

/** Which kind of machine a starter is written for. `any` suits everything. */
export type StarterMode = "fff" | "cnc" | "laser" | "any";

export interface StarterLayout {
	id: string;
	/** i18n keys, under `plugins.flexibleLayouts.`. */
	titleKey: string;
	descKey: string;
	icon: string;
	mode: StarterMode;
	/** Navigation section the new page is filed under. */
	category: string;
	/** Builds a fresh item list every call (new ids each time). */
	build: () => Array<GridItemModel>;
}

// #region item helpers
type Overrides = Record<string, unknown>;

/** A freeform widget: the type's own default config with a few fields overridden - so a schema change to the
 *  defaults flows into the starters instead of leaving them half-configured. */
function widget(type: Exclude<WidgetType, "builtinPanel">, overrides: Overrides = {}): Widget {
	return { ...createDefaultWidget(type), ...overrides } as Widget;
}
function place(x: number, y: number, w: number, h: number, w_: Widget, extra: Partial<GridItemModel> = {}): GridItemModel {
	return { i: newItemId(), x, y, w, h, widget: w_, ...extra };
}
function free(type: Exclude<WidgetType, "builtinPanel">, x: number, y: number, w: number, h: number, overrides: Overrides = {}, extra: Partial<GridItemModel> = {}): GridItemModel {
	return place(x, y, w, h, widget(type, overrides), extra);
}
function panel(component: string, x: number, y: number, w: number, h: number): GridItemModel {
	return place(x, y, w, h, { type: "builtinPanel", component });
}
function button(x: number, y: number, w: number, h: number, label: string, code: string, icon: string, color: string, extra: Overrides = {}): GridItemModel {
	return free("codeButton", x, y, w, h, { label, code, icon, color, ...extra });
}
// #endregion

// #region the layouts
function buildFff(): Array<GridItemModel> {
	return [
		free("status", 0, 0, 3, 4),
		free("heater", 3, 0, 3, 4, { label: "Bed", omPath: "heat.heaters[0]", setCommand: "M140 S{value}", offCommand: "M140 S-273.15", presets: [0, 60, 100] }),
		free("heater", 6, 0, 3, 4, { label: "Nozzle", omPath: "heat.heaters[1]", setCommand: "M104 S{value}", offCommand: "M104 S-273.15", presets: [0, 200, 240], color: "error" }),
		free("fan", 9, 0, 3, 4, { label: "Part fan" }),
		panel("MovementPanel", 0, 4, 8, 9),
		panel("MacroList", 8, 4, 4, 15),
		panel("ExtrudePanel", 0, 13, 8, 6),
		panel("TemperatureChart", 0, 19, 12, 7),
	];
}

function buildPrintMonitor(): Array<GridItemModel> {
	return [
		panel("JobProgress", 0, 0, 12, 3),
		free("thumbnail", 0, 3, 4, 9),
		panel("JobTimesPanel", 4, 3, 4, 5),
		panel("JobInfoPanel", 4, 8, 4, 6),
		free("gaugeCluster", 8, 3, 4, 6),
		panel("WebcamPanel", 8, 9, 4, 8),
		// Pause / resume stay usable mid-print (the print lock leaves them alone); cancel asks first.
		button(0, 12, 2, 3, "Pause", "M25", "mdi-pause", "warning"),
		button(2, 12, 2, 3, "Resume", "M24", "mdi-play", "success"),
		button(0, 15, 2, 3, "Cancel", "M0", "mdi-stop", "error", { confirm: true }),
		free("emergencyStop", 2, 15, 2, 3),
	];
}

function buildTouch(): Array<GridItemModel> {
	return [
		button(0, 0, 4, 4, "Home all", "G28", "mdi-home", "primary"),
		button(4, 0, 4, 4, "Preheat", "M140 S60\nM104 S200", "mdi-fire", "warning"),
		button(8, 0, 4, 4, "Cool down", "M140 S-273.15\nM104 S-273.15", "mdi-snowflake", "info"),
		button(0, 4, 4, 4, "Fan on", "M106 S255", "mdi-fan", "secondary"),
		button(4, 4, 4, 4, "Fan off", "M107", "mdi-fan-off", "secondary"),
		button(8, 4, 4, 4, "Motors off", "M18", "mdi-engine-off", "secondary"),
		free("emergencyStop", 0, 8, 12, 3),
	];
}

function buildLaser(): Array<GridItemModel> {
	return [
		free("label", 0, 0, 12, 1, { variant: "heading", content: "Laser", align: "start" }),
		free("dro", 0, 1, 6, 5),
		free("wcs", 6, 1, 6, 5),
		button(0, 6, 3, 2, "Home all", "G28", "mdi-home", "primary"),
		button(3, 6, 3, 2, "Set zero XY", "G10 L20 P1 X0 Y0", "mdi-target", "secondary", { confirm: true }),
		free("spindle", 6, 6, 6, 4, { label: "Laser power" }),
		panel("MovementPanel", 0, 8, 6, 9),
		free("emergencyStop", 6, 10, 6, 3),
	];
}

function buildCnc(): Array<GridItemModel> {
	return [
		free("label", 0, 0, 12, 1, { variant: "heading", content: "CNC Control", align: "start" }),

		// Live machine position
		free("value", 0, 1, 4, 3, { omPath: "move.axes[0].machinePosition", label: "X", display: "number", unit: "mm", precision: 2 }),
		free("value", 4, 1, 4, 3, { omPath: "move.axes[1].machinePosition", label: "Y", display: "number", unit: "mm", precision: 2 }),
		free("value", 8, 1, 4, 3, { omPath: "move.axes[2].machinePosition", label: "Z", display: "number", unit: "mm", precision: 2 }),

		// Homing + work-zero buttons
		button(0, 4, 4, 2, "Home All", "G28", "mdi-home", "primary"),
		button(4, 4, 4, 2, "Home XY", "G28 X Y", "mdi-home-outline", "primary"),
		button(8, 4, 4, 2, "Zero Work", "G10 L20 P1 X0 Y0 Z0", "mdi-target", "secondary", { confirm: true }),

		// Spindle control with conditional colour on the speed read-out
		button(0, 6, 6, 2, "Spindle On", "M3 S12000", "mdi-fan", "success"),
		button(6, 6, 6, 2, "Spindle Off", "M5", "mdi-fan-off", "error", { confirm: true }),
		free("value", 0, 8, 4, 3, { omPath: "spindles[0].current", label: "Spindle", display: "number", unit: "rpm", precision: 0 },
			{ conditions: [{ omPath: "spindles[0].current", operator: "gt", value: 0, color: "success" }] }),

		// Set spindle speed + a built-in jog panel
		free("input", 4, 8, 8, 3, { label: "Set spindle RPM", mode: "command", commandTemplate: "M3 S{value}", inputKind: "number", color: "primary" }),
		panel("MovementPanel", 0, 11, 12, 9),
	];
}
// #endregion

export const STARTER_LAYOUTS: ReadonlyArray<StarterLayout> = [
	{ id: "fff", titleKey: "starters.fff.title", descKey: "starters.fff.desc", icon: "mdi-printer-3d", mode: "fff", category: "control", build: buildFff },
	{ id: "print", titleKey: "starters.print.title", descKey: "starters.print.desc", icon: "mdi-printer-3d-nozzle-heat", mode: "fff", category: "job", build: buildPrintMonitor },
	{ id: "touch", titleKey: "starters.touch.title", descKey: "starters.touch.desc", icon: "mdi-gesture-tap", mode: "any", category: "control", build: buildTouch },
	{ id: "laser", titleKey: "starters.laser.title", descKey: "starters.laser.desc", icon: "mdi-laser-pointer", mode: "laser", category: "control", build: buildLaser },
	{ id: "cnc", titleKey: "starters.cnc.title", descKey: "starters.cnc.desc", icon: "mdi-saw-blade", mode: "cnc", category: "control", build: buildCnc },
];

export function findStarter(id: string): StarterLayout | undefined {
	return STARTER_LAYOUTS.find((s) => s.id === id);
}

/**
 * What kind of machine this is, for recommending starters: DWC's "Dashboard mode" override wins (like the
 * dashboard seeders), otherwise the machine's own mode. Pure - pass the two inputs.
 */
export function starterModeFor(machineMode: string | undefined, dashboardMode?: string): "fff" | "cnc" | "laser" {
	if (dashboardMode === "FFF") { return "fff"; }
	if (dashboardMode === "CNC") { return machineMode === MachineMode.laser ? "laser" : "cnc"; }
	if (machineMode === MachineMode.laser) { return "laser"; }
	if (machineMode === MachineMode.cnc) { return "cnc"; }
	return "fff";
}

export function currentStarterMode(): "fff" | "cnc" | "laser" {
	return starterModeFor(
		useMachineStore().model.state.machineMode,
		(useSettingsStore() as { dashboardMode?: string }).dashboardMode,
	);
}

/** Is this starter a good fit for a machine of `mode`? Laser machines are CNC-like, so the CNC starter fits them too. */
export function isRecommendedStarter(starter: StarterLayout, mode: "fff" | "cnc" | "laser"): boolean {
	return starter.mode === "any" || starter.mode === mode || (mode === "laser" && starter.mode === "cnc");
}

/** The starters ordered for display: ones that fit this machine first, otherwise registry order. */
export function orderedStarters(mode: "fff" | "cnc" | "laser"): Array<StarterLayout & { recommended: boolean }> {
	const tagged = STARTER_LAYOUTS.map((s) => ({ ...s, recommended: isRecommendedStarter(s, mode) }));
	return [...tagged.filter((s) => s.recommended), ...tagged.filter((s) => !s.recommended)];
}

/** Create a new custom page from a starter and return its route path. Never touches an existing page. */
export function createStarterPage(id: string): string {
	const starter = findStarter(id);
	if (!starter) {
		throw new Error(`Unknown starter layout: ${id}`);
	}
	const title = i18n.global.t(`plugins.flexibleLayouts.${starter.titleKey}`);
	const path = createCustomPage({ title, icon: starter.icon, category: starter.category });
	useLayoutStore().setItems(path, starter.build(), "custom");
	return path;
}

/** As `createStarterPage`, but in a NEW profile (named after the starter) that becomes the active one. */
export function createStarterProfile(id: string): string {
	const starter = findStarter(id);
	if (!starter) {
		throw new Error(`Unknown starter layout: ${id}`);
	}
	const profileId = createProfile(i18n.global.t(`plugins.flexibleLayouts.${starter.titleKey}`));
	switchProfile(profileId);
	return createStarterPage(id);
}
