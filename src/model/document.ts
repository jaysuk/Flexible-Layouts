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
		/** Icon size in px. Omitted = scales with the panel's typography (em-relative). */
		iconSize?: number;
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
		/**
		 * Arithmetic display transform with `x` as the live value, e.g. "x / 60" or "(x - 32) * 5 / 9".
		 * Applied after scale/offset. Safe mini-parser (+ - * / parentheses only) - see util/mathExpr.
		 */
		expression?: string;
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
		/**
		 * Embed a component a plugin published via DWC's `registerEmbeddableComponent` (3.7.0-alpha.7+).
		 * Resolved at render time from `useUiStore().embeddableComponents` by {@link id}; when the
		 * providing plugin isn't loaded the widget shows a "needs plugin" placeholder instead.
		 */
		type: "embeddable";
		/** Stable, namespaced id from registerEmbeddableComponent, e.g. "MyPlugin.PowerPanel". */
		id: string;
		/** Owning plugin id — recorded for dependency capture and the missing-plugin hint. */
		pluginId?: string;
		/** Cached caption/icon so the tile still reads sensibly when the plugin isn't loaded. */
		label?: string;
		icon?: string;
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
		/** Transform the entered value before it's sent (see {@link InputModifier}). */
		modifier?: InputModifier;
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
		/** Combined nozzle/tool alignment: webcam + crosshair overlay + tool buttons + X/Y offset capture. */
		type: "toolAlign";
		label?: string;
		/** Camera URL (MJPEG stream or snapshot), as for the webcam widget. */
		url?: string;
		/** 0 = live stream; >0 = snapshot refreshed every N ms. */
		refreshMs?: number;
		fit?: "contain" | "cover";
		/** Overlay drawn over the feed to aim at. */
		overlay?: "crosshair" | "target" | "none";
		overlayColor?: string;
		/** Crosshair centre as a percentage of the camera box (default 50/50). */
		overlayX?: number;
		overlayY?: number;
		/** Base ring diameter (px) for the "target" overlay. */
		overlaySize?: number;
		/** Tool number used as the datum; others are offset relative to it. */
		referenceTool?: number;
		/** Default fine-jog step (mm) and feed rate (mm/min) for the nudge buttons. */
		jogStep?: number;
		jogFeed?: number;
		/** Flip the sign of computed offsets if a machine's convention comes out mirrored. */
		invertOffsets?: boolean;
		color?: string;
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
		/** Thumbnail preview of the currently running job (from the slicer-embedded image). */
		type: "thumbnail";
		title?: string;
		/** How the image fits its cell. */
		fit?: "contain" | "cover";
		/** "job" = the running job's thumbnail (default); "file" = the thumbnail of a specific file. */
		source?: "job" | "file";
		/** File path for source === "file", e.g. `0:/gcodes/benchy.gcode`. */
		path?: string;
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
		/** How the speed is set: "length" = feed-rate (mm/min, default); "flow" = volumetric (mm³/s). */
		mode?: "length" | "flow";
		/** Feed-rate (mm/min) used in length mode. */
		feedrate?: number;
		/** Target volumetric flow rate (mm³/s) used in flow mode. */
		flowRate?: number;
		/** Filament diameter (mm) for the flow→feed-rate conversion; falls back to the object model then 1.75. */
		filamentDiameter?: number;
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
		/** Show slicer thumbnails for gcode files (fetched on demand). Default true. */
		thumbnails?: boolean;
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
	}
	| {
		/** Digital read-out of axis positions with homed indicators. */
		type: "dro";
		title?: string;
		/** Axis letters to show; empty = all visible axes. */
		axes?: Array<string>;
		coord?: "work" | "machine";
		precision?: number;
	}
	| {
		/** Spindle / laser control (M3/M4/M5). */
		type: "spindle";
		label?: string;
		spindleIndex?: number;
		min?: number;
		max?: number;
		color?: string;
	}
	| {
		/** Surfaces the firmware message box (M291) and acknowledges it (M292). */
		type: "messageBox";
		title?: string;
	}
	| {
		/** Switch the active FL layout profile. */
		type: "profileSwitch";
		label?: string;
		variant?: "select" | "buttons";
	}
	| {
		/** Toggle the DWC light/dark theme. */
		type: "themeToggle";
		label?: string;
		variant?: "switch" | "button";
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
		case "toolAlign":
			return {
				type: "toolAlign", url: "", refreshMs: 0, fit: "contain",
				overlay: "crosshair", overlayColor: "#39FF14", overlayX: 50, overlayY: 50, overlaySize: 60,
				jogStep: 0.1, jogFeed: 6000,
			};
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
		case "thumbnail":
			return { type: "thumbnail", title: "", fit: "contain", source: "job" };
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
			return { type: "extruder", label: "Extruder", amounts: [1, 5, 10, 50], mode: "length", feedrate: 300, flowRate: 5, filamentDiameter: 1.75, tool: null, color: "primary" };
		case "wcs":
			return { type: "wcs", label: "Work offsets", axes: ["X", "Y", "Z"], color: "primary" };
		case "toolSelect":
			return { type: "toolSelect", label: "Tools", color: "primary" };
		case "fan":
			return { type: "fan", label: "Fan", fanIndex: 0, color: "primary" };
		case "jobControl":
			return { type: "jobControl", showProgress: true, color: "primary" };
		case "files":
			return { type: "files", folder: "0:/gcodes", columns: 1, startCommand: "M32 \"{path}\"", thumbnails: true, color: "primary" };
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
		case "dro":
			return { type: "dro", title: "Position", axes: [], coord: "work", precision: 2 };
		case "spindle":
			return { type: "spindle", label: "Spindle", spindleIndex: 0, color: "primary" };
		case "messageBox":
			return { type: "messageBox", title: "" };
		case "profileSwitch":
			return { type: "profileSwitch", label: "Profile", variant: "select" };
		case "themeToggle":
			return { type: "themeToggle", label: "Dark", variant: "switch" };
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

/**
 * Send-time transform for the Input widget — the inverse companion to the value widget's display
 * modifiers. The entered value is converted before it is substituted into a `{value}` command (or
 * written to a global): the `map` is checked first (exact text match → its raw replacement),
 * otherwise a numeric value is transformed by `value*scale+offset` and then the optional `x`-based
 * `expression`. Mirrors the output formatting so the two read the same. (Slider/stepper deliberately
 * stay on their own scale/offset — a second transform there would just be confusing.)
 */
export interface InputModifier {
	/** Linear gain applied to the entered number. */
	scale?: number;
	/** Linear offset added after scaling. */
	offset?: number;
	/** Arithmetic with `x` = the entered value after scale/offset, e.g. "x * 60" (see util/mathExpr). */
	expression?: string;
	/** Exact entered-text → sent-text mapping, checked before the numeric path. */
	map?: Array<{ from: string; to: string }>;
}

/** Per-widget typography overrides. */
export interface Typography {
	/** Base font size in px. */
	fontSize?: number;
	/**
	 * Scale the font size down on smaller viewports instead of keeping it fixed in px. `fontSize`
	 * becomes the maximum; the text shrinks (to a sensible floor) as the screen narrows, so it stays
	 * legible on phones/tablets. Applied via CSS clamp() in FlexGridItem.
	 */
	responsive?: boolean;
	/** CSS font-family stack. */
	fontFamily?: string;
	/** Font size (px) for labels — field/section labels, captions — independent of the value text. */
	labelFontSize?: number;
	/** CSS font-family stack for labels. */
	labelFontFamily?: string;
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
	/** Hover tooltip (native title attribute) shown over the whole panel in view mode. */
	tooltip?: string;
	colors?: PanelColors;
	typography?: Typography;
	/**
	 * Scale the widget's content down uniformly to fit the cell instead of showing inner
	 * scrollbars. Defaults to on for built-in panels (see FlexGridItem).
	 */
	fit?: boolean;
	/** Locked items can't be dragged or resized (but can still be configured). */
	locked?: boolean;
	/**
	 * Block interaction with this widget while the printer is printing (so it can't move the machine
	 * unexpectedly). Undefined = use the per-widget-type default (see util/printLock): on for motion /
	 * tool-change / extrusion controls, off for safe ones like pause/resume.
	 */
	lockWhilePrinting?: boolean;
	/**
	 * Size the cell to the panel's natural content height (and reflow the panels below it) instead of
	 * a fixed height - so dynamic panels like Movement grow/shrink as their content changes, the way
	 * the stock DWC dashboard does. Best for content-sized panels; not charts (which need a fixed box).
	 */
	autoHeight?: boolean;
	/** Object-model-driven rules that recolour / hide / disable this widget at runtime. */
	conditions?: Array<ConditionRule>;
	/** Pixel width when placed in the header strip (which is a horizontal row, not a grid). */
	headerWidth?: number;
	/**
	 * Which side of the top bar this header widget sits on. Items keep their array order within each
	 * side; the first `end` item starts a right-aligned group (everything from it is pushed to the
	 * right). Defaults to `start` (left, after the title/logo). Only meaningful for header items.
	 */
	headerAlign?: "start" | "end";
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
	/** Lock every interactive widget on this page while the printer is printing (page-wide override). */
	lockWhilePrinting?: boolean;
	grid: { cols: number; rowHeight: number; /** Gap (px) between panels. Default 8. */ gap?: number };
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
		/**
		 * User-defined named colours. Their literal value is what gets stored on a widget/panel (so
		 * they work whether or not the global theme is enabled); the name is shown in colour pickers
		 * so a palette can be reused across the layout.
		 */
		customColors?: Array<{ name: string; value: string }>;
	};
	/** Keyed by route path (`/`, `/Console`, …) or a generated id for custom pages. */
	pages: Record<string, PageLayout>;
	/**
	 * Route to open on startup when this layout/profile is active (e.g. `/Console` or a custom page
	 * path). Empty/omitted = the normal landing page (Dashboard). Applied once per page load.
	 */
	startupPath?: string;
	/**
	 * Route to jump to when a print/job starts (e.g. a custom job-overview page). Empty/omitted = no
	 * jump. Supplements DWC's own "switch to Job page on print start" — set DWC's off and pick any page
	 * here. Not applied while editing.
	 */
	jobStartPath?: string;
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

/** A single structural upgrade step. `up` mutates the document in place to reach version `to`. */
interface DocMigration {
	to: number;
	up: (doc: LayoutDocument) => void;
}

/**
 * Stepwise structural migrations, applied in order to any document whose schemaVersion is behind the
 * current one. Add an entry here AND bump DOCUMENT_SCHEMA_VERSION only for changes that can't be
 * handled by reading a sensible default at runtime: renaming/moving/removing a field, changing its
 * type, or deliberately materialising new parameters. Use forEachWidget()/backfillWidgetDefaults()
 * to reach every widget. This mirrors btncmd's checkDataVersion (merge old config against a current
 * reference on version change) but keeps each change explicit and reviewable. Example:
 *
 *   { to: 2, up: (doc) => forEachWidget(doc, (w) => { if (w.type === "jog" && "speed" in w) {
 *       (w as Record<string, unknown>).feedrate = (w as Record<string, unknown>).speed;
 *       delete (w as Record<string, unknown>).speed; } }) },
 */
const DOC_MIGRATIONS: Array<DocMigration> = [
	// (no structural migrations yet - v1 is the first schema)
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively add keys present in `defaults` but absent from `target`; never change an existing
 * value (so user choices and intentionally-set fields are preserved). Arrays are taken whole.
 */
function fillMissingDefaults(target: Record<string, unknown>, defaults: Record<string, unknown>): void {
	for (const key of Object.keys(defaults)) {
		const dv = defaults[key];
		if (!(key in target) || target[key] === undefined) {
			target[key] = (isPlainObject(dv) || Array.isArray(dv)) ? JSON.parse(JSON.stringify(dv)) : dv;
		} else if (isPlainObject(target[key]) && isPlainObject(dv)) {
			fillMissingDefaults(target[key] as Record<string, unknown>, dv);
		}
	}
}

/**
 * Backfill any parameters added to a widget's default template since it was saved - the migration
 * building block for "a new parameter was added to an existing widget". Only fills gaps; never
 * overwrites. Use from a DOC_MIGRATIONS step when you want old widgets brought up to the template.
 */
export function backfillWidgetDefaults(widget: Widget): void {
	const defaults = createDefaultWidget(widget.type);
	// createDefaultWidget falls back to a builtinPanel for types it doesn't own (e.g. pluginPage);
	// only backfill when the template genuinely matches, so we never inject foreign keys.
	if (defaults.type !== widget.type) {
		return;
	}
	fillMissingDefaults(widget as unknown as Record<string, unknown>, defaults as unknown as Record<string, unknown>);
}

/** Visit every widget: page items (+ responsive variants), nested group children, and header items. */
export function forEachWidget(doc: LayoutDocument, visit: (widget: Widget) => void): void {
	const visitItems = (items?: Array<GridItemModel>): void => {
		if (!Array.isArray(items)) {
			return;
		}
		for (const item of items) {
			if (!item || !item.widget) {
				continue;
			}
			visit(item.widget);
			if (item.widget.type === "group") {
				visitItems((item.widget as Extract<Widget, { type: "group" }>).items);
			}
		}
	};
	for (const page of Object.values(doc.pages ?? {})) {
		if (!page) {
			continue;
		}
		visitItems(page.items);
		visitItems(page.variants?.md);
		visitItems(page.variants?.sm);
	}
	visitItems(doc.header?.items);
}

/**
 * Runtime-only keys that grid-layout-plus writes onto the layout item objects it manages (it mutates
 * the same objects we persist). They're never part of the saved schema, so we strip them from items
 * before they reach a backup/export and clean them out of stored documents on load.
 */
const TRANSIENT_ITEM_KEYS = ["moved"] as const;

/** Remove transient/runtime fields from one grid item (recursing into group children). Mutates in place. */
export function stripItemRuntimeFields(item: GridItemModel): void {
	if (!item) {
		return;
	}
	for (const key of TRANSIENT_ITEM_KEYS) {
		delete (item as unknown as Record<string, unknown>)[key];
	}
	if (item.widget?.type === "group") {
		for (const child of (item.widget as Extract<Widget, { type: "group" }>).items ?? []) {
			stripItemRuntimeFields(child);
		}
	}
}

/** Strip transient fields from every item in a document (pages + responsive variants + header). */
export function sanitizeRuntimeFields(doc: LayoutDocument): void {
	const visit = (items?: Array<GridItemModel>): void => {
		if (Array.isArray(items)) {
			for (const item of items) {
				stripItemRuntimeFields(item);
			}
		}
	};
	for (const page of Object.values(doc.pages ?? {})) {
		if (!page) {
			continue;
		}
		visit(page.items);
		visit(page.variants?.md);
		visit(page.variants?.sm);
	}
	visit(doc.header?.items);
}

/**
 * Bring a persisted document up to the current schema. Total by contract - never throws; on an
 * unrecognised/corrupt shape it returns a fresh empty document so the UI always has something valid
 * to render. Normalises the top-level shape (preserving every existing field), then runs any
 * stepwise structural migrations the stored schemaVersion is behind on.
 */
export function migrateDocument(raw: unknown): LayoutDocument {
	if (!raw || typeof raw !== "object") {
		return createEmptyDocument();
	}
	const doc = raw as Partial<LayoutDocument> & { schemaVersion?: number };
	const base = createEmptyDocument();
	const next: LayoutDocument = {
		schemaVersion: typeof doc.schemaVersion === "number" ? doc.schemaVersion : 0,
		meta: { ...base.meta, ...(doc.meta ?? {}) },
		theme: { ...base.theme, ...(doc.theme ?? {}) },
		pages: (doc.pages && typeof doc.pages === "object") ? doc.pages as Record<string, PageLayout> : {},
		nav: { ...base.nav, ...(doc.nav ?? {}) },
		dependencies: Array.isArray(doc.dependencies) ? doc.dependencies : [],
		...(doc.header ? { header: doc.header } : {}),
		...(doc.statusHidden !== undefined ? { statusHidden: doc.statusHidden } : {}),
		...(doc.startupPath ? { startupPath: doc.startupPath } : {}),
		...(doc.jobStartPath ? { jobStartPath: doc.jobStartPath } : {}),
		...(doc.migratedGlobalHides ? { migratedGlobalHides: true } : {}),
	};
	for (const migration of DOC_MIGRATIONS) {
		if (next.schemaVersion < migration.to) {
			migration.up(next);
			next.schemaVersion = migration.to;
		}
	}
	next.schemaVersion = DOCUMENT_SCHEMA_VERSION;
	return next;
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
