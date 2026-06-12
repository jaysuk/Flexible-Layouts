import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { convertBtnCmd, isBtnCmdFile } from "../src/model/btncmd";
import type { Widget } from "../src/model/document";

// A real BtnCmd v01.04.12 export (5 tabs, 27 panels covering every panel type, 2 buttons).
const FIXTURE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "btncmdtest.json"), "utf8"));

// The example export the user attached (a Macro button + a jobinfo panel on one tab).
const SAMPLE = {
	btns: [{
		btnLabel: "Example", btnType: "Macro", btnActionData: "MacroName.g",
		btnColour: "#00DBFFFF", btnGroupIdx: "tab1", btnIcon: "mdi-polymer",
		btnXpos: 100, btnYpos: 100, autoSize: true, btnWsize: "auto", btnHsize: "auto", btnReqConf: false,
	}],
	tabs: [{ tabID: "tab1", caption: "Layout 1", icon: "mdi-view-module", numberOfColumns: 12 }],
	panels: [{ panelID: "p1", tabID: "tab1", panelType: "jobinfo", panelYpos: 150, panelXpos: 100, panelHSize: 200, panelWSize: 200 }],
	btnCmdVer: "01.04.12", exportResW: 1920, exportResH: 1080,
};

describe("BtnCmd import", () => {
	it("recognises a BtnCmd export and rejects other shapes", () => {
		expect(isBtnCmdFile(SAMPLE)).toBe(true);
		expect(isBtnCmdFile({ btns: [], tabs: [], panels: [] })).toBe(true); // structural match
		expect(isBtnCmdFile({ kind: "dwclayout", document: {} })).toBe(false);
		expect(isBtnCmdFile(null)).toBe(false);
	});

	it("converts each tab into a custom page", () => {
		const doc = convertBtnCmd(SAMPLE);
		const paths = Object.keys(doc.pages);
		expect(paths.length).toBe(1);
		expect(paths[0]).toMatch(/^\/Plugins\/FlexibleLayouts\/p\//); // a real custom-page route
		const page = doc.pages[paths[0]];
		expect(page.kind).toBe("custom");
		expect(page.title).toBe("Layout 1");
		expect(page.grid.cols).toBe(12);
		expect(doc.nav.order).toContain(paths[0]);
	});

	it("maps a Macro button to a compact code button (M98) keeping colour and icon", () => {
		const page = Object.values(convertBtnCmd(SAMPLE).pages)[0];
		const item = page.items.find((i) => i.widget.type === "codeButton")!;
		const btn = item.widget as Extract<Widget, { type: "codeButton" }>;
		expect(btn.label).toBe("Example");
		expect(btn.code).toBe('M98 P"MacroName.g"');
		expect(btn.icon).toBe("mdi-polymer");
		expect(btn.color).toBe("#00DBFF"); // alpha stripped from #RRGGBBAA
		expect(item.h).toBe(1); // single-row, not a big 2-row box
		expect(item.w).toBeLessThanOrEqual(2); // width tracks the label, not a fixed 3 columns
	});

	it("maps a jobinfo panel to the JobInfoPanel built-in, positioned on the grid", () => {
		const page = Object.values(convertBtnCmd(SAMPLE).pages)[0];
		const panelItem = page.items.find((i) => i.widget.type === "builtinPanel");
		expect(panelItem).toBeTruthy();
		expect((panelItem!.widget as Extract<Widget, { type: "builtinPanel" }>).component).toBe("JobInfoPanel");
		// 150px / 30px-row ≈ row 5; pixel position is mapped to a grid cell, not kept as pixels.
		expect(panelItem!.y).toBe(5);
		expect(panelItem!.w).toBeGreaterThanOrEqual(2);
	});

	it("falls back to a verbose note for unknown panel types, carrying the object-model path", () => {
		const doc = convertBtnCmd({
			...SAMPLE,
			panels: [{ tabID: "tab1", panelType: "somethingNew", panelMMPath: "sensors.analog[0].lastReading", panelMMPrefix: "Coolant", panelXpos: 0, panelYpos: 0 }],
		});
		const note = Object.values(doc.pages)[0].items.map((i) => i.widget).find((w) => w.type === "note") as Extract<Widget, { type: "note" }>;
		expect(note?.content).toContain("somethingNew");
		expect(note?.content).toContain("sensors.analog[0].lastReading"); // OM path preserved for rebuilding
		expect(note?.content).toContain("Coolant");
	});

	it("maps a txtLabel button to a text label widget (not a code button)", () => {
		const doc = convertBtnCmd({
			...SAMPLE,
			btns: [{ btnType: "txtLabel", btnLabel: "Heading", btnColour: "#FF0000", btnGroupIdx: "tab1", btnXpos: 0, btnYpos: 0 }],
		});
		const w = Object.values(doc.pages)[0].items.map((i) => i.widget).find((x) => x.type === "label") as Extract<Widget, { type: "label" }>;
		expect(w?.content).toBe("Heading");
		expect(w?.variant).toBe("text");
		expect(w?.color).toBe("#FF0000");
	});

	it("maps an MQTT button to an explanatory note carrying topic and payload", () => {
		const doc = convertBtnCmd({
			...SAMPLE,
			btns: [{ btnType: "MQTT", btnLabel: "Lights", btnTopicData: "home/lights", btnActionData: "on", btnGroupIdx: "tab1", btnXpos: 0, btnYpos: 0 }],
		});
		const note = Object.values(doc.pages)[0].items.map((i) => i.widget).find((w) => w.type === "note") as Extract<Widget, { type: "note" }>;
		expect(note?.content).toContain("home/lights");
		expect(note?.content).toContain("on");
	});
});

describe("BtnCmd import — real v01.04.12 export fixture", () => {
	const doc = convertBtnCmd(FIXTURE);
	const pages = Object.values(doc.pages);
	const widgets = pages.flatMap((p) => p.items.map((i) => i.widget));
	const builtins = widgets.filter((w) => w.type === "builtinPanel") as Array<Extract<Widget, { type: "builtinPanel" }>>;

	it("creates one page per tab", () => {
		expect(pages.length).toBe(5);
		expect(pages.map((p) => p.title)).toEqual(["Layout 1", "NEW1", "NEW2", "NEW3", "NEW4"]);
	});

	it("auto-converts every panel type in the export except the custom panel", () => {
		const notes = widgets.filter((w) => w.type === "note") as Array<Extract<Widget, { type: "note" }>>;
		// Exactly one note: the custom panel (its embedded tab isn't part of the export).
		expect(notes.length).toBe(1);
		expect(notes[0].content).toContain("custom panel");
		expect(notes[0].content).toContain("Group");
	});

	it("maps the hyphenated/real panel type names onto built-in panels", () => {
		const components = builtins.map((b) => b.component);
		for (const expected of [
			"JobInfoPanel", "BabystepPanel", "JobTimesPanel", "ExtrudePanel", // Layout 1
			"ExtrusionFactorsPanel", "EventList", "FansPanel", "FileList", "JobControlPanel", "JobFileList", // NEW1
			"JobLayerChart", "MacroList", "MovementPanel", "SpeedFactorPanel", // NEW2
			"StatusPanel", "TemperatureChart", "ToolsPanel", // NEW3
			"WebcamPanel", // DWC's own cam, not a URL webcam
		]) {
			expect(components).toContain(expected);
		}
	});

	it("maps console to the console widget (with the send box), not the event list", () => {
		expect(widgets.some((w) => w.type === "console")).toBe(true);
	});

	it("maps BtnCmdChart to a chart widget with its series and axis config", () => {
		const chart = widgets.find((w) => w.type === "chart") as Extract<Widget, { type: "chart" }>;
		expect(chart.series).toEqual([{ omPath: "NEW", label: "NEW", color: "primary" }]);
		expect(chart.min).toBe(30);
		expect(chart.max).toBe(50);
	});

	it("maps mmValue to a value read-out and txtLabel to a label", () => {
		const value = widgets.find((w) => w.type === "value") as Extract<Widget, { type: "value" }>;
		expect(value.omPath).toBe("inputs[0].active");
		expect(value.display).toBe("label"); // copes with the boolean value
		const label = widgets.filter((w) => w.type === "label") as Array<Extract<Widget, { type: "label" }>>;
		expect(label.some((l) => l.content === "testing text")).toBe(true);
	});

	it("maps vInput to a global-variable input", () => {
		const input = widgets.find((w) => w.type === "input") as Extract<Widget, { type: "input" }>;
		expect(input.mode).toBe("global");
		expect(input.globalName).toBe("123"); // "global.123" with the prefix stripped
	});

	it("maps jobProgress and remSrc", () => {
		const progress = widgets.find((w) => w.type === "progress") as Extract<Widget, { type: "progress" }>;
		expect(progress.omPath).toBe("job.filePosition");
		expect(progress.maxPath).toBe("job.file.size");
		const web = widgets.find((w) => w.type === "web") as Extract<Widget, { type: "web" }>;
		expect(web.url).toBe(""); // "http://" placeholder is not a real URL
	});

	it("maps the window button to an absolute-URL open action, not G-code", () => {
		const buttons = widgets.filter((w) => w.type === "codeButton") as Array<Extract<Widget, { type: "codeButton" }>>;
		const windowBtn = buttons.find((b) => b.action === "url");
		expect(windowBtn?.url).toBe("https://google.co.uk"); // bare hostname made absolute
		const macroBtn = buttons.find((b) => b.action === "gcode");
		expect(macroBtn?.code).toBe(""); // macro button had no macro selected
	});
});
