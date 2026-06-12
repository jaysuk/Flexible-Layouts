/**
 * Importer for BtnCmd (github.com/MintyTrebor/BtnCmd) layout exports.
 *
 * BtnCmd stores a flat export: `tabs` (each tab = a page), `btns` and `panels` (each references its
 * tab by id), positioned with absolute pixels on an `exportResW`×`exportResH` canvas. We convert that
 * into a Flexible Layouts document: one custom page per tab, buttons → code-button widgets, panels →
 * the nearest built-in panel / widget, with pixel positions mapped onto the grid. It's a best-effort
 * conversion - exact placement and unusual panel types may need a tweak after import.
 */
import { normalizeBtnCmdExpression } from "../util/mathExpr";
import { type ConditionRule, createEmptyDocument, type GridItemModel, type LayoutDocument, newItemId, type PageLayout, type Widget } from "./document";

// Same value as pageManager.CUSTOM_PAGE_PREFIX; inlined to keep this converter free of the
// route-registration import chain.
const CUSTOM_PAGE_PREFIX = "/Plugins/FlexibleLayouts/p/";
const ROW_H = 30;
const DEFAULT_CANVAS_W = 1920;

interface BtnCmdBtn {
	btnGroupIdx?: string;
	btnType?: string;
	btnLabel?: string;
	btnActionData?: string;
	btnTopicData?: string;
	btnColour?: string;
	btnIcon?: string;
	btnHoverText?: string;
	btnEnableWhileJob?: boolean;
	btnXpos?: number;
	btnYpos?: number;
	btnHsize?: string | number;
	btnWsize?: string | number;
	autoSize?: boolean;
	btnReqConf?: boolean;
}
interface BtnCmdPanel {
	tabID?: string;
	panelType?: string;
	panelXpos?: number;
	panelYpos?: number;
	panelHSize?: number;
	panelWSize?: number;
	panelMMPath?: string;
	panelMMPrefix?: string;
	panelMMSuffix?: string;
	panelMMEvalMathStr?: string;
	panelHoverText?: string;
	customPanelID?: string | null;
	chartLabel?: string;
	chartOMDataArr?: Array<{ OMString?: string; name?: string; OMColor?: string }>;
	chartYaxisMin?: number;
	chartYaxisMax?: number;
	chartYaxisLabel?: string;
	chartXaxisLabel?: string;
	inputVarName?: string;
	inputType?: string;
	inputClass?: string;
	inputDispType?: string;
	altWebCamParams?: { altWebCamURL?: string; altWebCamUpdateTimer?: number };
}
interface BtnCmdTab {
	tabID?: string;
	caption?: string;
	icon?: string;
	numberOfColumns?: number;
}
interface BtnCmdFile {
	btnCmdVer?: string;
	btns?: Array<BtnCmdBtn>;
	tabs?: Array<BtnCmdTab>;
	panels?: Array<BtnCmdPanel>;
	exportResW?: number;
	exportComment?: string;
}

/** True for anything that looks like a BtnCmd export. */
export function isBtnCmdFile(raw: unknown): raw is BtnCmdFile {
	if (!raw || typeof raw !== "object") {
		return false;
	}
	const o = raw as Record<string, unknown>;
	return typeof o.btnCmdVer === "string" || (Array.isArray(o.btns) && Array.isArray(o.tabs) && Array.isArray(o.panels));
}

/** BtnCmd colours are `#RRGGBB` or `#RRGGBBAA`; strip any alpha for a CSS-friendly hex. */
function hexColor(c?: string): string | undefined {
	if (!c) {
		return undefined;
	}
	const m = c.trim().replace(/^#/, "");
	if (/^[0-9a-f]{8}$/i.test(m)) {
		return `#${m.slice(0, 6)}`;
	}
	if (/^[0-9a-f]{6}$/i.test(m) || /^[0-9a-f]{3}$/i.test(m)) {
		return `#${m}`;
	}
	return undefined;
}

// Keys are BtnCmd panelType values lower-cased. The hyphenated names are the real strings a
// v01.04.12 export uses (verified against test/fixtures/btncmdtest.json); the bare aliases predate
// that fixture and are kept in case older exports used them.
const PANEL_TO_BUILTIN: Record<string, string> = {
	jobinfo: "JobInfoPanel",
	jobstatus: "JobControlPanel",
	jobcontrol: "JobControlPanel",
	"job-control-panel": "JobControlPanel",
	jobtimes: "JobTimesPanel",
	// BtnCmd collects warm-up/layer/duration stats itself; DWC's job-times panel is the closest stats
	// read-out (warm-up time is BtnCmd-specific and has no DWC counterpart).
	collectdata: "JobTimesPanel",
	tools: "ToolsPanel",
	toolcontrol: "ToolsPanel",
	"tools-panel": "ToolsPanel",
	status: "StatusPanel",
	"status-panel": "StatusPanel",
	movement: "MovementPanel",
	machinemovement: "MovementPanel",
	"movement-panel": "MovementPanel",
	fans: "FansPanel",
	fan: "FanPanel",
	atx: "ATXPanel",
	babystep: "BabystepPanel",
	"z-babystep-panel": "BabystepPanel",
	speedfactor: "SpeedFactorPanel",
	speed: "SpeedFactorPanel",
	extrusionfactors: "ExtrusionFactorsPanel",
	"extrusion-factors-panel": "ExtrusionFactorsPanel",
	"extrude-panel": "ExtrudePanel",
	spindle: "SpindleSpeedPanel",
	macros: "MacroList",
	macrolist: "MacroList",
	eventlist: "EventList",
	chart: "TemperatureChart",
	temperaturechart: "TemperatureChart",
	"temperature-chart": "TemperatureChart",
	layerchart: "JobLayerChart",
	joblist: "JobFileList",
	filamentlist: "FileList",
	// BtnCmd's plain "webcam" panel is DWC's own configured camera (its URL params belong to the
	// altwebcam type), so use the built-in panel rather than a URL webcam widget.
	webcam: "WebcamPanel",
};

/**
 * BtnCmd's "enable while job active" toggle (off = the button is greyed out while a job runs) maps
 * onto a condition rule disabling the widget while the machine is processing.
 */
function buttonConditions(b: BtnCmdBtn): Array<ConditionRule> | undefined {
	if (b.btnEnableWhileJob !== false) {
		return undefined;
	}
	return [{ omPath: "state.status", operator: "eq", value: "processing", disable: true }];
}

/** Bare hostnames are common in BtnCmd window buttons ("google.co.uk"); make them absolute. */
function ensureUrl(u: string): string {
	if (!u) {
		return "";
	}
	return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`;
}

/**
 * BtnCmd auto-sizes a button to its icon + label. We don't have the rendered pixels, so approximate
 * the width from the label and map it to grid columns (1-4). Buttons are a single row tall.
 */
function estButtonCols(label: string, colW: number): number {
	const px = Math.max(110, (label || "").length * 8.5 + 64); // icon + padding + text
	return Math.min(4, Math.max(1, Math.round(px / colW)));
}

function buttonWidget(b: BtnCmdBtn): Widget {
	const type = (b.btnType || "").toLowerCase();
	const data = b.btnActionData || "";
	const common = {
		label: b.btnLabel || "Button",
		icon: b.btnIcon || undefined,
		color: hexColor(b.btnColour),
		confirm: b.btnReqConf || undefined,
	};
	if (type === "txtlabel" || type === "label" || type === "text") {
		// A text label, not a real button - the same thing as Flexible Layouts' Text/image widget.
		return { type: "label", variant: "text", content: b.btnLabel || "", align: "center", color: hexColor(b.btnColour) };
	}
	if (type === "macro") {
		return { type: "codeButton", action: "gcode", code: data ? `M98 P"${data}"` : "", ...common };
	}
	if (type === "http") {
		return { type: "codeButton", action: "http", code: "", url: data, ...common };
	}
	// "window" opens a URL in a sized popup; the closest we have is open-in-new-tab.
	if (type === "url" || type === "link" || type === "window") {
		return { type: "codeButton", action: "url", code: "", url: ensureUrl(data), ...common };
	}
	if (type === "mqtt") {
		// No MQTT action in Flexible Layouts (yet) - keep the config visible so it can be rebuilt.
		const detail = [b.btnTopicData ? `- Topic: \`${b.btnTopicData}\`` : "", data ? `- Payload: \`${data}\`` : ""].filter(Boolean).join("\n");
		return { type: "note", content: `**MQTT button: "${b.btnLabel || "Button"}"**\n\nMQTT buttons aren't supported by Flexible Layouts yet.${detail ? `\n\n${detail}` : ""}` };
	}
	// "GCode" and anything else: send the action data as a code.
	return { type: "codeButton", action: "gcode", code: data, ...common };
}

function panelWidget(p: BtnCmdPanel): Widget {
	const type = (p.panelType || "").toLowerCase();
	const builtin = PANEL_TO_BUILTIN[type];
	if (builtin) {
		return { type: "builtinPanel", component: builtin };
	}
	if (type === "console") {
		return { type: "console" };
	}
	if (type === "altwebcam") {
		const wp = p.altWebCamParams || {};
		return { type: "webcam", url: wp.altWebCamURL || "", refreshMs: wp.altWebCamUpdateTimer ?? 0, fit: "contain", fullscreen: true };
	}
	if (type === "mm" || type === "machinemodel" || type === "mmvalue") {
		// Raw OM read-out; "label" display copes with non-numeric values (booleans, strings). BtnCmd's
		// eval-math string becomes the Value widget's expression transform.
		return {
			type: "value", omPath: p.panelMMPath || "", label: p.panelMMPrefix || "", display: "label",
			expression: normalizeBtnCmdExpression(p.panelMMEvalMathStr),
		};
	}
	if (type === "txtlabel") {
		return { type: "label", variant: "text", content: p.panelMMPrefix || "", align: "start" };
	}
	if (type === "jobprogress") {
		return { type: "progress", label: "Job progress", omPath: "job.filePosition", maxPath: "job.file.size" };
	}
	if (type === "btncmdchart") {
		const series = (p.chartOMDataArr ?? [])
			.filter((s) => s.OMString)
			.map((s) => ({ omPath: s.OMString!, label: s.name || s.OMString, color: s.OMColor || undefined }));
		return {
			type: "chart",
			title: p.chartLabel || "Chart",
			series,
			min: p.chartYaxisMin,
			max: p.chartYaxisMax,
			xLabel: p.chartXaxisLabel || undefined,
			yLabel: p.chartYaxisLabel || undefined,
		};
	}
	if (type === "vinput") {
		const varName = p.inputVarName || "";
		return {
			type: "input",
			label: varName || "Input",
			mode: "global",
			globalName: varName.replace(/^global\./, ""),
			inputKind: p.inputType === "number" ? "number" : "text",
		};
	}
	if (type === "remsrc") {
		// "Remote source": embedded external web content. The URL isn't always in the export; carry
		// it over when it's a real one, otherwise leave it for the user to fill in.
		const url = p.altWebCamParams?.altWebCamURL;
		return { type: "web", url: url && url !== "http://" ? url : "" };
	}
	if (type === "custom") {
		// A BtnCmd custom panel embeds another (hidden) tab; exports don't reliably include that tab,
		// so there is nothing to convert from. The Group widget is the Flexible Layouts analogue.
		return {
			type: "note",
			content: `**BtnCmd custom panel**\n\nCustom panels embed another BtnCmd tab, which isn't included in the export${p.customPanelID ? ` (referenced tab \`${p.customPanelID}\`)` : ""}. Rebuild it with a **Group** widget, which is the equivalent container in Flexible Layouts.`,
		};
	}
	return { type: "note", content: describeUnmatchedPanel(p) };
}

/**
 * A verbose placeholder for a panel we couldn't auto-convert: it carries every meaningful field from
 * the BtnCmd panel (object-model path, prefix/suffix/expression, chart/input details, hover text,
 * position) so you can rebuild it by hand without losing what it pointed at.
 */
function describeUnmatchedPanel(p: BtnCmdPanel): string {
	const lines: Array<string> = [];
	const add = (label: string, value: unknown): void => {
		if (value !== undefined && value !== null && value !== "") {
			lines.push(`- ${label}: \`${typeof value === "object" ? JSON.stringify(value) : value}\``);
		}
	};
	add("Object-model path", p.panelMMPath);
	add("Prefix / text", p.panelMMPrefix);
	add("Suffix", p.panelMMSuffix);
	add("Expression", p.panelMMEvalMathStr);
	add("Chart label", p.chartLabel);
	add("Input variable", p.inputVarName);
	add("Input type", p.inputType || p.inputClass);
	add("Hover text", p.panelHoverText);
	add("Position (x, y)", p.panelXpos !== undefined ? `${p.panelXpos}, ${p.panelYpos ?? 0}` : undefined);
	const detail = lines.length ? `\n\n${lines.join("\n")}` : "";
	return `**Unmatched BtnCmd panel: \`${p.panelType || "unknown"}\`**\n\nThis panel type isn't auto-converted yet. Recreate it with an equivalent widget (e.g. a Value read-out pointing at the object-model path below).${detail}`;
}

/** Convert a BtnCmd export into a Flexible Layouts document (one custom page per tab). */
export function convertBtnCmd(raw: unknown): LayoutDocument {
	const file = (raw ?? {}) as BtnCmdFile;
	const doc = createEmptyDocument();
	doc.meta.name = file.exportComment || "Imported from BtnCmd";

	const canvasW = file.exportResW && file.exportResW > 0 ? file.exportResW : DEFAULT_CANVAS_W;
	const tabs = Array.isArray(file.tabs) ? file.tabs : [];
	const btns = Array.isArray(file.btns) ? file.btns : [];
	const panels = Array.isArray(file.panels) ? file.panels : [];

	for (const tab of tabs) {
		const cols = tab.numberOfColumns && tab.numberOfColumns > 0 ? tab.numberOfColumns : 12;
		const colW = canvasW / cols;
		const items: Array<GridItemModel> = [];

		const place = (widget: Widget, xpx = 0, ypx = 0, wpx = 0, hpx = 0, autoW = 3, autoH = 2, minW = 1,
					   extras: Pick<GridItemModel, "tooltip" | "conditions"> = {}): void => {
			const x = Math.min(cols - 1, Math.max(0, Math.round(xpx / colW)));
			const y = Math.max(0, Math.round(ypx / ROW_H));
			const w = Math.min(cols - x, Math.max(minW, wpx > 0 ? Math.round(wpx / colW) : autoW));
			const h = Math.max(1, hpx > 0 ? Math.round(hpx / ROW_H) : autoH);
			items.push({ i: newItemId(), x, y, w, h, widget, ...extras });
		};

		for (const b of btns.filter((x) => x.btnGroupIdx === tab.tabID)) {
			const auto = b.autoSize !== false || b.btnWsize === "auto" || b.btnHsize === "auto";
			const wpx = auto ? 0 : Number(b.btnWsize) || 0;
			const hpx = auto ? 0 : Number(b.btnHsize) || 0;
			// Compact single-row buttons whose width tracks the label, so the dense BtnCmd grid stays
			// dense instead of being blown up into big overlapping boxes that the grid pushes apart.
			place(buttonWidget(b), b.btnXpos, b.btnYpos, wpx, hpx, estButtonCols(b.btnLabel || "", colW), 1, 1, {
				tooltip: b.btnHoverText || undefined,
				conditions: buttonConditions(b),
			});
		}
		for (const p of panels.filter((x) => x.tabID === tab.tabID)) {
			place(panelWidget(p), p.panelXpos, p.panelYpos, p.panelWSize, p.panelHSize, 4, 5, 2, {
				tooltip: p.panelHoverText || undefined,
			});
		}

		const page: PageLayout = {
			kind: "custom",
			title: tab.caption || "Imported",
			icon: tab.icon || "mdi-view-dashboard-outline",
			category: "control",
			grid: { cols, rowHeight: ROW_H },
			items,
		};
		const path = CUSTOM_PAGE_PREFIX + newItemId();
		doc.pages[path] = page;
		doc.nav.order.push(path);
	}

	return doc;
}
