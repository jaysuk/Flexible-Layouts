import { describe, expect, it } from "vitest";

import { convertBtnCmd, isBtnCmdFile } from "../src/model/btncmd";
import type { Widget } from "../src/model/document";

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

	it("falls back to a note placeholder for unknown panel types", () => {
		const doc = convertBtnCmd({ ...SAMPLE, panels: [{ tabID: "tab1", panelType: "somethingNew", panelXpos: 0, panelYpos: 0 }] });
		const note = Object.values(doc.pages)[0].items.map((i) => i.widget).find((w) => w.type === "note") as Extract<Widget, { type: "note" }>;
		expect(note?.content).toContain("somethingNew");
	});
});
