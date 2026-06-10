/**
 * Importer for BtnCmd (github.com/MintyTrebor/BtnCmd) layout exports.
 *
 * BtnCmd stores a flat export: `tabs` (each tab = a page), `btns` and `panels` (each references its
 * tab by id), positioned with absolute pixels on an `exportResW`×`exportResH` canvas. We convert that
 * into a Flexible Layouts document: one custom page per tab, buttons → code-button widgets, panels →
 * the nearest built-in panel / widget, with pixel positions mapped onto the grid. It's a best-effort
 * conversion - exact placement and unusual panel types may need a tweak after import.
 */
import { createEmptyDocument, type GridItemModel, type LayoutDocument, newItemId, type PageLayout, type Widget } from "./document";

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
	btnColour?: string;
	btnIcon?: string;
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

const PANEL_TO_BUILTIN: Record<string, string> = {
	jobinfo: "JobInfoPanel",
	jobstatus: "JobControlPanel",
	jobcontrol: "JobControlPanel",
	jobtimes: "JobTimesPanel",
	tools: "ToolsPanel",
	toolcontrol: "ToolsPanel",
	status: "StatusPanel",
	movement: "MovementPanel",
	machinemovement: "MovementPanel",
	fans: "FansPanel",
	fan: "FanPanel",
	atx: "ATXPanel",
	babystep: "BabystepPanel",
	speedfactor: "SpeedFactorPanel",
	extrusionfactors: "ExtrusionFactorsPanel",
	spindle: "SpindleSpeedPanel",
	macros: "MacroList",
	macrolist: "MacroList",
	console: "EventList",
	chart: "TemperatureChart",
	temperaturechart: "TemperatureChart",
};

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
	if (type === "macro") {
		return { type: "codeButton", action: "gcode", code: data ? `M98 P"${data}"` : "", ...common };
	}
	if (type === "http") {
		return { type: "codeButton", action: "http", code: "", url: data, ...common };
	}
	if (type === "url" || type === "link") {
		return { type: "codeButton", action: "url", code: "", url: data, ...common };
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
	if (type === "webcam" || type === "altwebcam") {
		const wp = p.altWebCamParams || {};
		return { type: "webcam", url: wp.altWebCamURL || "", refreshMs: wp.altWebCamUpdateTimer ?? 0, fit: "contain", fullscreen: true };
	}
	if (type === "mm" || type === "machinemodel") {
		return { type: "value", omPath: p.panelMMPath || "", label: p.panelMMPrefix || "", display: "number", precision: 1 };
	}
	return {
		type: "note",
		content: `Imported from BtnCmd — the "${p.panelType || "unknown"}" panel isn't auto-converted. Replace this with an equivalent widget from Add widget.`,
	};
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

		const place = (widget: Widget, xpx = 0, ypx = 0, wpx = 0, hpx = 0, autoW = 3, autoH = 2, minW = 1): void => {
			const x = Math.min(cols - 1, Math.max(0, Math.round(xpx / colW)));
			const y = Math.max(0, Math.round(ypx / ROW_H));
			const w = Math.min(cols - x, Math.max(minW, wpx > 0 ? Math.round(wpx / colW) : autoW));
			const h = Math.max(1, hpx > 0 ? Math.round(hpx / ROW_H) : autoH);
			items.push({ i: newItemId(), x, y, w, h, widget });
		};

		for (const b of btns.filter((x) => x.btnGroupIdx === tab.tabID)) {
			const auto = b.autoSize !== false || b.btnWsize === "auto" || b.btnHsize === "auto";
			const wpx = auto ? 0 : Number(b.btnWsize) || 0;
			const hpx = auto ? 0 : Number(b.btnHsize) || 0;
			// Compact single-row buttons whose width tracks the label, so the dense BtnCmd grid stays
			// dense instead of being blown up into big overlapping boxes that the grid pushes apart.
			place(buttonWidget(b), b.btnXpos, b.btnYpos, wpx, hpx, estButtonCols(b.btnLabel || "", colW), 1, 1);
		}
		for (const p of panels.filter((x) => x.tabID === tab.tabID)) {
			place(panelWidget(p), p.panelXpos, p.panelYpos, p.panelWSize, p.panelHSize, 4, 5, 2);
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
