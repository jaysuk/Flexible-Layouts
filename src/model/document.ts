/**
 * Flexible Layouts persisted document model.
 *
 * A single LayoutDocument captures every customisation the user makes: the grid layout of each
 * page, per-panel colours, the global theme, navigation order/visibility and the list of plugin
 * dependencies. It is stored in DWC's settings store (so it round-trips through settings
 * export/import) and can additionally be exported as a standalone `.dwclayout.json` file for
 * sharing. `schemaVersion` gates migrations so older documents keep loading across plugin updates.
 */

/** Bump whenever the shape below changes incompatibly; add a migration in migrateDocument(). */
export const DOCUMENT_SCHEMA_VERSION = 1;

/**
 * A widget is the thing that lives inside a grid cell.
 *
 * - `builtinPanel`  - a stock DWC panel rendered by name
 * - `codeButton`    - a freeform button that sends G/M-code (covers macros via M98)
 * - `value`         - a live read-out of any object-model field (number / label / gauge)
 * - `label`         - static text / heading / image / spacer
 *
 * `pluginPage` (embedding other plugins' pages) lands in a later milestone.
 */
export type Widget =
	| { type: "builtinPanel"; component: string }
	| {
		type: "codeButton";
		/** G/M-code for action "gcode" (default). */
		code: string;
		label: string;
		color?: string;
		icon?: string;
		/** Ask for confirmation before acting (useful for destructive commands). */
		confirm?: boolean;
		/** What the button does. Defaults to sending `code` as G-code. */
		action?: "gcode" | "http" | "url";
		/** Target URL for action "http" (GET) or "url" (open in new tab). */
		url?: string;
	}
	| {
		type: "value";
		/** Object-model path, e.g. `heat.heaters[0].current` or `move.axes[2].machinePosition`. */
		omPath: string;
		label?: string;
		display: "number" | "label" | "gauge";
		unit?: string;
		precision?: number;
		/** Gauge bounds (display === "gauge"). */
		min?: number;
		max?: number;
		color?: string;
		/** Numeric transform applied before display: value * scale + offset. */
		scale?: number;
		offset?: number;
		/** Render booleans / 0-1 as text. */
		boolOn?: string;
		boolOff?: string;
		/** Exact value -> text mapping (e.g. status codes). Checked before numeric formatting. */
		map?: Array<{ value: string; text: string }>;
	}
	| {
		type: "label";
		variant: "text" | "heading" | "image" | "spacer";
		/** Text content, or image URL when variant === "image". */
		content?: string;
		align?: "start" | "center" | "end";
		color?: string;
	}
	| {
		/** A reusable custom panel: a titled container holding its own mini-grid of widgets. */
		type: "group";
		title?: string;
		items: Array<GridItemModel>;
		cols?: number;
		rowHeight?: number;
	}
	| {
		/** Embed a page or tab registered by another DWC plugin. */
		type: "pluginPage";
		/** `page` resolves a route by `path`; `settingTab`/`jobTab` resolve a component by `tabKey`. */
		source?: "page" | "settingTab" | "jobTab";
		path?: string;
		tabKey?: string;
		/** Best-effort owning plugin id, recorded for dependency capture on export. */
		pluginId?: string;
		label?: string;
	}
	| {
		/** Embed an external web page / local web service in an iframe. */
		type: "web";
		url?: string;
	}
	| {
		/** Live line chart sampling one or more object-model values over time. */
		type: "chart";
		title?: string;
		series: Array<{ omPath: string; label?: string; color?: string }>;
		/** How much history to keep on screen (seconds). */
		windowSeconds?: number;
		/** Sampling interval (ms). */
		intervalMs?: number;
		/** Y-axis bounds. Leave undefined for auto-scaling. */
		min?: number;
		max?: number;
		/** Axis titles. */
		xLabel?: string;
		yLabel?: string;
	}
	| {
		/** Pronterface-style movement/jog control: concentric step rings for two planar axes plus a
		 *  vertical bar for a third. Step amounts are right-click editable at runtime. */
		type: "jog";
		/** Header shown above the control; empty/omitted hides the header. */
		title?: string;
		/** Axis letters mapped to each control (RRF axis letters, e.g. X/Y/Z/U/V/A). */
		xAxis?: string;
		yAxis?: string;
		zAxis?: string;
		/** Step rings, outer → inner. Right-click a ring to change its value. */
		xySteps?: Array<number>;
		zSteps?: Array<number>;
		/** Jog feedrates (mm/min). */
		xyFeedrate?: number;
		zFeedrate?: number;
		/** Flip the travel direction of an axis (e.g. bed-moves-down printers). */
		invertX?: boolean;
		invertY?: boolean;
		invertZ?: boolean;
		/** Show the vertical (Z) bar. */
		showZ?: boolean;
		/** Show home buttons (home-all in the hub, home-Z under the bar). */
		showHome?: boolean;
		/** Show the inline editable feedrate row. */
		showFeedrate?: boolean;
		/** Show a "motors off" (M18) button. */
		showMotorsOff?: boolean;
		/** Theme colour for the control. */
		color?: string;
	}
	| {
		type: "input";
		label?: string;
		/** `command` substitutes the entered value into a G-code template; `global` sets an RRF global var. */
		mode: "command" | "global";
		/** Command template for mode === "command"; `{value}` is replaced with the entered value. */
		commandTemplate?: string;
		/** Global variable name (without the `global.` prefix) for mode === "global". */
		globalName?: string;
		inputKind: "number" | "text";
		color?: string;
		default?: string | number;
	}
	| {
		/** NeoPixel / DotStar LED-strip control (RRF M150). */
		type: "neopixel";
		title?: string;
		/** Which strip to drive: "auto" = first detected, or a fixed `move.ledStrips` index. */
		stripMode?: "auto" | "fixed" | "choose";
		stripIndex?: number;
		/** LED count (not in the object model, so configured here). */
		ledCount?: number;
		/** Show the editable LED-count field. */
		showCount?: boolean;
		/** Show the per-LED pip grid (paint individual LEDs). */
		showPerLed?: boolean;
		/** Theme colour for the action buttons. */
		color?: string;
	}
	| {
		/** View/edit RRF `global.*` variables. */
		type: "globals";
		title?: string;
		/** `all` lists every global; `list` shows only `names`. */
		mode?: "all" | "list";
		names?: Array<string>;
		/** Show the filter box (only meaningful in `all` mode). */
		showSearch?: boolean;
		/** Allow editing values inline (otherwise read-only). */
		allowEdit?: boolean;
	}
	| {
		/** Slider that sends a command template ({value}) and optionally tracks a live OM value. */
		type: "slider";
		label?: string;
		/** Optional OM path for the live position (slider = value * scale + offset). */
		omPath?: string;
		scale?: number;
		offset?: number;
		min?: number;
		max?: number;
		step?: number;
		unit?: string;
		/** Command template; `{value}` is replaced with the slider value. */
		command?: string;
		/** Send continuously while dragging, vs only on release (default). */
		live?: boolean;
		color?: string;
	}
	| {
		/** Stateful on/off control bound to an OM value, sending separate on/off commands. */
		type: "toggle";
		label?: string;
		/** OM path whose truthiness drives the on/off state. */
		omPath?: string;
		onCommand?: string;
		offCommand?: string;
		/** Render as a switch (default) or a pressable button. */
		variant?: "switch" | "button";
		color?: string;
	}
	| {
		/** +/- adjuster that sends a command template ({value}); absolute or relative. */
		type: "stepper";
		label?: string;
		/** `absolute` sends the new total; `relative` sends ±step each press. */
		mode?: "absolute" | "relative";
		/** Optional OM path for the live value / absolute base. */
		omPath?: string;
		step?: number;
		min?: number;
		max?: number;
		/** Decimal places for display and the sent value. */
		precision?: number;
		unit?: string;
		/** Command template; `{value}` is replaced. */
		command?: string;
		color?: string;
	}
	| {
		/** Horizontal progress bar for an OM fraction. */
		type: "progress";
		label?: string;
		omPath?: string;
		/** If set, fraction = value / valueAt(maxPath); otherwise (value-min)/(max-min). */
		maxPath?: string;
		min?: number;
		max?: number;
		scale?: number;
		showValue?: boolean;
		color?: string;
	}
	| {
		/** Coloured status dot + label: first matching rule wins. */
		type: "status";
		label?: string;
		omPath?: string;
		states?: Array<{ operator: ConditionOperator; value?: string | number; color?: string; label?: string; icon?: string }>;
		defaultColor?: string;
		defaultLabel?: string;
		defaultIcon?: string;
	}
	| {
		/** Banner shown only while an OM condition holds. */
		type: "alert";
		omPath?: string;
		operator?: ConditionOperator;
		value?: string | number;
		severity?: "info" | "success" | "warning" | "error";
		message?: string;
		icon?: string;
	}
	| {
		/** Webcam / snapshot image with optional periodic refresh. */
		type: "webcam";
		url?: string;
		/** 0 = treat as a live stream (no cache-bust); >0 = snapshot refreshed every N ms. */
		refreshMs?: number;
		fit?: "contain" | "cover";
		fullscreen?: boolean;
	}
	| {
		/** Button grid built from the .g files in a macros folder. */
		type: "macros";
		folder?: string;
		columns?: number;
		color?: string;
	}
	| {
		/** Send a command and show the last few replies. */
		type: "console";
		rows?: number;
		placeholder?: string;
	}
	| {
		/** Compact heater tile: live readout + target presets / off (template-driven). */
		type: "heater";
		label?: string;
		/** OM base for the heater, e.g. `heat.heaters[0]`. */
		omPath?: string;
		/** Command template ({value}) to set the target. */
		setCommand?: string;
		/** Command to switch the heater off. */
		offCommand?: string;
		presets?: Array<number>;
		color?: string;
	}
	| {
		/** Clock / uptime / print-time readout. */
		type: "clock";
		label?: string;
		mode?: "time" | "uptime" | "printTime" | "timeLeft";
		/** 12- or 24-hour for mode "time". */
		format?: "24" | "12";
	}
	| {
		/** Compact label → value table for several OM paths. */
		type: "table";
		title?: string;
		rows?: Array<{ label?: string; omPath: string; unit?: string; precision?: number }>;
	}
	| {
		/** Extrude / retract control. */
		type: "extruder";
		label?: string;
		amounts?: Array<number>;
		feedrate?: number;
		/** Tool to select first (T<n>); null = current tool. */
		tool?: number | null;
		color?: string;
	}
	| {
		/** Work coordinate system (CNC): select G54–G59 and zero/go-to axes. */
		type: "wcs";
		label?: string;
		/** Axis letters offered for zeroing. */
		axes?: Array<string>;
		color?: string;
	}
	| {
		/** Tool selector: a button per configured tool. */
		type: "toolSelect";
		label?: string;
		color?: string;
	}
	| {
		/** Single-fan slider + RPM read-out. */
		type: "fan";
		label?: string;
		fanIndex?: number;
		color?: string;
	}
	| {
		/** Job pause / resume / cancel with progress. */
		type: "jobControl";
		showProgress?: boolean;
		color?: string;
	}
	| {
		/** File picker: a button per file in a folder; starts it. */
		type: "files";
		folder?: string;
		columns?: number;
		/** Command template; `{path}` is replaced. */
		startCommand?: string;
		color?: string;
	}
	| {
		/** Several radial gauges in one tile. */
		type: "gaugeCluster";
		title?: string;
		gauges?: Array<{ label?: string; omPath: string; min?: number; max?: number; unit?: string; color?: string }>;
	}
	| {
		/** Grid of truthiness-driven status icons (endstops, sensors, flags…). */
		type: "indicators";
		title?: string;
		columns?: number;
		items?: Array<{ label?: string; omPath: string; trueColor?: string; falseColor?: string; trueIcon?: string; falseIcon?: string }>;
	}
	| {
		/** Image with clickable command regions (machine schematic, etc.). */
		type: "hotspot";
		url?: string;
		regions?: Array<{ x: number; y: number; w: number; h: number; command?: string; label?: string }>;
	}
	| {
		/** Formatted note (minimal Markdown). */
		type: "note";
		content?: string;
	}
	| {
		/** Poll an HTTP endpoint and display the result. */
		type: "http";
		label?: string;
		url?: string;
		pollMs?: number;
		/** Dotted path to extract from a JSON response (optional). */
		jsonPath?: string;
		prefix?: string;
		suffix?: string;
	}
	| {
		/** Live tail of console messages / replies. */
		type: "eventLog";
		rows?: number;
	}
	| {
		/** Tiny multi-series trend line(s) sampled from the object model. */
		type: "sparkline";
		title?: string;
		series?: Array<{ omPath: string; color?: string }>;
		windowSeconds?: number;
		intervalMs?: number;
	};

/** Widget type discriminator, handy for palettes and factories. */
export type WidgetType = Widget["type"];

/** Build a sensible default widget of the given type (used when adding from the palette). */
export function createDefaultWidget(type: WidgetType): Widget {
	switch (type) {
		case "codeButton":
			return { type: "codeButton", code: "G28", label: "Home All", icon: "mdi-home", color: "primary" };
		case "value":
			return { type: "value", omPath: "", label: "Value", display: "number", precision: 1 };
		case "label":
			return { type: "label", variant: "heading", content: "Heading", align: "center" };
		case "input":
			return { type: "input", label: "Set value", mode: "command", commandTemplate: "M104 S{value}", inputKind: "number", color: "primary" };
		case "web":
			return { type: "web", url: "" };
		case "chart":
			return {
				type: "chart",
				title: "Chart",
				series: [{ omPath: "heat.heaters[1].current", label: "Tool", color: "primary" }],
				windowSeconds: 120,
				intervalMs: 1000,
			};
		case "jog":
			return {
				type: "jog",
				title: "Movement",
				xAxis: "X", yAxis: "Y", zAxis: "Z",
				xySteps: [100, 10, 1, 0.1],
				zSteps: [10, 1, 0.1],
				xyFeedrate: 3000, zFeedrate: 600,
				showZ: true, showHome: true, showFeedrate: true, showMotorsOff: false,
				color: "primary",
			};
		case "neopixel":
			return {
				type: "neopixel",
				title: "LEDs",
				stripMode: "auto",
				ledCount: 30,
				showCount: true,
				showPerLed: true,
				color: "primary",
			};
		case "globals":
			return {
				type: "globals",
				title: "Globals",
				mode: "all",
				names: [],
				showSearch: true,
				allowEdit: true,
			};
		case "slider":
			return {
				type: "slider",
				label: "Fan",
				omPath: "fans[0].requestedValue",
				scale: 100, offset: 0,
				min: 0, max: 100, step: 1, unit: "%",
				command: "M106 P0 S{value}",
				live: false,
				color: "primary",
			};
		case "toggle":
			return {
				type: "toggle",
				label: "ATX power",
				omPath: "state.atxPower",
				onCommand: "M80",
				offCommand: "M81",
				variant: "switch",
				color: "primary",
			};
		case "stepper":
			return {
				type: "stepper",
				label: "Babystep Z",
				mode: "relative",
				omPath: "move.axes[2].babystep",
				step: 0.05, precision: 3, unit: "mm",
				command: "M290 Z{value}",
				color: "primary",
			};
		case "progress":
			return {
				type: "progress",
				label: "Progress",
				omPath: "job.filePosition",
				maxPath: "job.file.size",
				showValue: true,
				color: "primary",
			};
		case "status":
			return {
				type: "status",
				label: "Status",
				omPath: "state.status",
				states: [
					{ operator: "eq", value: "processing", color: "success", label: "Printing", icon: "mdi-printer-3d" },
					{ operator: "eq", value: "paused", color: "warning", label: "Paused", icon: "mdi-pause" },
					{ operator: "eq", value: "idle", color: "info", label: "Idle", icon: "mdi-check" },
					{ operator: "eq", value: "halted", color: "error", label: "Halted", icon: "mdi-alert" },
				],
				defaultColor: "grey",
				defaultLabel: "—",
				defaultIcon: "mdi-help",
			};
		case "alert":
			return {
				type: "alert",
				omPath: "",
				operator: "truthy",
				severity: "warning",
				message: "Alert",
				icon: "mdi-alert",
			};
		case "webcam":
			return { type: "webcam", url: "", refreshMs: 1000, fit: "contain", fullscreen: true };
		case "macros":
			return { type: "macros", folder: "0:/macros", columns: 2, color: "primary" };
		case "console":
			return { type: "console", rows: 5, placeholder: "Send code…" };
		case "heater":
			return {
				type: "heater",
				label: "Bed",
				omPath: "heat.heaters[0]",
				setCommand: "M140 S{value}",
				offCommand: "M140 S-273.15",
				presets: [0, 60, 100],
				color: "primary",
			};
		case "clock":
			return { type: "clock", label: "", mode: "time", format: "24" };
		case "table":
			return {
				type: "table",
				title: "Status",
				rows: [
					{ label: "Bed", omPath: "heat.heaters[0].current", unit: "°C", precision: 1 },
					{ label: "Tool", omPath: "heat.heaters[1].current", unit: "°C", precision: 1 },
				],
			};
		case "extruder":
			return { type: "extruder", label: "Extruder", amounts: [1, 5, 10, 50], feedrate: 300, tool: null, color: "primary" };
		case "wcs":
			return { type: "wcs", label: "Work offsets", axes: ["X", "Y", "Z"], color: "primary" };
		case "toolSelect":
			return { type: "toolSelect", label: "Tools", color: "primary" };
		case "fan":
			return { type: "fan", label: "Fan", fanIndex: 0, color: "primary" };
		case "jobControl":
			return { type: "jobControl", showProgress: true, color: "primary" };
		case "files":
			return { type: "files", folder: "0:/gcodes", columns: 1, startCommand: "M32 \"{path}\"", color: "primary" };
		case "gaugeCluster":
			return {
				type: "gaugeCluster",
				title: "Temperatures",
				gauges: [
					{ label: "Bed", omPath: "heat.heaters[0].current", min: 0, max: 120, unit: "°C", color: "primary" },
					{ label: "Tool", omPath: "heat.heaters[1].current", min: 0, max: 300, unit: "°C", color: "error" },
				],
			};
		case "indicators":
			return {
				type: "indicators",
				title: "Sensors",
				columns: 2,
				items: [
					{ label: "Z probe", omPath: "sensors.probes[0].value[0]", trueColor: "success", falseColor: "grey", trueIcon: "mdi-circle", falseIcon: "mdi-circle-outline" },
				],
			};
		case "hotspot":
			return { type: "hotspot", url: "", regions: [] };
		case "note":
			return { type: "note", content: "# Note\n\nEdit in the widget settings. Supports **bold**, *italic*, `code`, lists and [links](https://duet3d.com)." };
		case "http":
			return { type: "http", label: "Endpoint", url: "", pollMs: 5000, jsonPath: "", prefix: "", suffix: "" };
		case "eventLog":
			return { type: "eventLog", rows: 8 };
		case "sparkline":
			return {
				type: "sparkline",
				title: "Trend",
				series: [{ omPath: "heat.heaters[1].current", color: "primary" }],
				windowSeconds: 120,
				intervalMs: 1000,
			};
		case "group":
			return { type: "group", title: "Custom panel", items: [], cols: 12, rowHeight: 30 };
		case "builtinPanel":
		default:
			return { type: "builtinPanel", component: "MovementPanel" };
	}
}

/** Per-panel colour overrides, applied as scoped CSS variables on the item wrapper. */
export interface PanelColors {
	background?: string;
	header?: string;
	text?: string;
	accent?: string;
}

/** Per-widget typography overrides. */
export interface Typography {
	/** Base font size in px. */
	fontSize?: number;
	/** CSS font-family stack. */
	fontFamily?: string;
}

/** Comparison operators for object-model-driven conditional rules. */
export type ConditionOperator =
	"eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "contains" | "truthy" | "falsy";

/**
 * One conditional rule: when the value at `omPath` satisfies `operator`/`value`, apply the listed
 * effects (recolour, hide and/or disable the widget). Multiple rules are evaluated in order; later
 * matching colours win, and hide/disable latch if any matching rule sets them.
 */
export interface ConditionRule {
	omPath: string;
	operator: ConditionOperator;
	/** Compared against the live value (ignored for truthy/falsy). */
	value?: string | number;
	/** Vuetify colour token to apply while this rule matches. */
	color?: string;
	/** Hide the widget while this rule matches. */
	hide?: boolean;
	/** Disable the widget (buttons/inputs) while this rule matches. */
	disable?: boolean;
}

/** One placed widget: grid geometry (x/y/w/h in grid units) + the widget descriptor + extras. */
export interface GridItemModel {
	/** Stable unique id. Also used as the useComponentSettings id so panel settings follow moves. */
	i: string;
	x: number;
	y: number;
	w: number;
	h: number;
	widget: Widget;
	/** Optional title shown in the edit-mode header; falls back to the widget's catalog label. */
	title?: string;
	colors?: PanelColors;
	typography?: Typography;
	/**
	 * Scale the widget's content down uniformly to fit the cell instead of showing inner
	 * scrollbars. Defaults to on for built-in panels (see FlexGridItem).
	 */
	fit?: boolean;
	/** Locked items can't be dragged or resized (but can still be configured). */
	locked?: boolean;
	/** Object-model-driven rules that recolour / hide / disable this widget at runtime. */
	conditions?: Array<ConditionRule>;
}

/** Layout of a single page. */
export interface PageLayout {
	/** `override` = an editable copy of a built-in page; `custom` = a brand-new user page. */
	kind: "override" | "custom";
	title?: string;
	icon?: string;
	/** Navigation category key for custom pages (control/job/files/preferences/plugins). */
	category?: string;
	/** Hide this page from navigation entirely. */
	hidden?: boolean;
	/** Page backdrop shown behind all widgets. */
	background?: { color?: string; image?: string; size?: "cover" | "contain" | "auto" };
	/** Show this page in navigation only while this object-model rule matches. */
	showWhen?: ConditionRule;
	grid: { cols: number; rowHeight: number };
	/** Base (desktop / lg) layout. */
	items: Array<GridItemModel>;
	/**
	 * Optional per-breakpoint overrides. `md` = tablet (600-959px), `sm` = phone (<600px). When a
	 * breakpoint has no override the next-larger layout is used (sm -> md -> base).
	 */
	variants?: { md?: Array<GridItemModel>; sm?: Array<GridItemModel> };
}

/** Responsive breakpoint id. `lg` is the base/desktop layout. */
export type Breakpoint = "lg" | "md" | "sm";

/** Resolve the effective items for a breakpoint, falling back to larger layouts. */
export function resolveBreakpointItems(page: PageLayout, bp: Breakpoint): Array<GridItemModel> {
	if (bp === "sm") {
		return page.variants?.sm ?? page.variants?.md ?? page.items;
	}
	if (bp === "md") {
		return page.variants?.md ?? page.items;
	}
	return page.items;
}

/** A plugin this layout depends on (recorded on export, checked on import). */
export interface LayoutDependency {
	pluginId: string;
	name: string;
	reason: string;
}

/** The full persisted document. */
export interface LayoutDocument {
	schemaVersion: number;
	meta: {
		name: string;
		author?: string;
		dwcVersion?: string;
		machineMode?: string;
	};
	theme: {
		enabled: boolean;
		/** Use a dark base (drives Vuetify's default contrasts for unset tokens). */
		dark?: boolean;
		colors: Record<string, string>;
		variables?: Record<string, unknown>;
	};
	/** Keyed by route path (`/`, `/Console`, …) or a generated id for custom pages. */
	pages: Record<string, PageLayout>;
	/** Top app-bar customisation: pinned mini widgets + styling. */
	header?: { items: Array<GridItemModel>; color?: string; title?: string; logo?: string };
	/** Hide the persistent status panel region in the custom shell. */
	statusHidden?: boolean;
	nav: { order: Array<string>; hidden: Array<string> };
	dependencies: Array<LayoutDependency>;
	/** One-time flag: legacy global hides have been migrated into nav.hidden (see pageManager). */
	migratedGlobalHides?: boolean;
}

/** Default grid geometry for a fresh page. */
export const DEFAULT_GRID = { cols: 12, rowHeight: 30 } as const;

export function createEmptyDocument(): LayoutDocument {
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		meta: { name: "My Layout" },
		theme: { enabled: false, colors: {} },
		pages: {},
		nav: { order: [], hidden: [] },
		dependencies: [],
	};
}

export function createEmptyPage(kind: PageLayout["kind"]): PageLayout {
	return {
		kind,
		grid: { ...DEFAULT_GRID },
		items: [],
	};
}

/**
 * Bring a persisted document up to the current schema. Total by contract - never throws; on an
 * unrecognised/corrupt shape it returns a fresh empty document so the UI always has something
 * valid to render.
 */
export function migrateDocument(raw: unknown): LayoutDocument {
	if (!raw || typeof raw !== "object") {
		return createEmptyDocument();
	}
	const doc = raw as Partial<LayoutDocument>;
	// v1 is the first schema; future versions add stepwise upgrades here keyed on doc.schemaVersion.
	const base = createEmptyDocument();
	return {
		schemaVersion: DOCUMENT_SCHEMA_VERSION,
		meta: { ...base.meta, ...(doc.meta ?? {}) },
		theme: { ...base.theme, ...(doc.theme ?? {}) },
		pages: (doc.pages && typeof doc.pages === "object") ? doc.pages as Record<string, PageLayout> : {},
		nav: { ...base.nav, ...(doc.nav ?? {}) },
		dependencies: Array.isArray(doc.dependencies) ? doc.dependencies : [],
		migratedGlobalHides: doc.migratedGlobalHides === true,
	};
}

/** Deep-clone a grid item with fresh ids (recursing into group children). */
export function reidItem(item: GridItemModel): GridItemModel {
	const clone: GridItemModel = JSON.parse(JSON.stringify(item));
	clone.i = newItemId();
	if (clone.widget.type === "group") {
		clone.widget.items = clone.widget.items.map(reidItem);
	}
	return clone;
}

/** Browser-native uuid for new grid items; falls back for very old runtimes. */
export function newItemId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `flx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
