import { describe, expect, it } from "vitest";

import type { Widget } from "../model/document";
import { defaultChromeForWidget, effectiveChromeForItem } from "../util/panelChrome";

describe("defaultChromeForWidget", () => {
	it("is on for panel-like widgets", () => {
		for (const type of ["value", "heater", "gaugeCluster", "console", "consoleOutput", "table", "globals", "webcam"] as const) {
			expect(defaultChromeForWidget({ type } as Widget)).toBe(true);
		}
	});

	it("is off for compact controls and decorative/shape/embed widgets", () => {
		for (const type of [
			"codeButton", "jog", "octopusJog", "slider", "toggle", "stepper", "input",
			"label", "hotspot", "web", "note", "thumbnail",
			"group", "profileSwitch", "themeToggle", "pluginPage", "embeddable",
			"codeInput", "editModeToggle", "uploadButton", "accessChip",
		] as const) {
			expect(defaultChromeForWidget({ type } as Widget)).toBe(false);
		}
	});

	it("is always off for built-in panels (they're already PanelCard-based)", () => {
		expect(defaultChromeForWidget({ type: "builtinPanel", component: "StatusPanel" } as Widget)).toBe(false);
	});
});

describe("effectiveChromeForItem", () => {
	it("uses the explicit choice when set, else the type default", () => {
		expect(effectiveChromeForItem({ type: "value" } as Widget, false)).toBe(false); // override off
		expect(effectiveChromeForItem({ type: "codeButton" } as Widget, true)).toBe(true); // override on
		expect(effectiveChromeForItem({ type: "value" } as Widget, undefined)).toBe(true); // default
		expect(effectiveChromeForItem({ type: "codeButton" } as Widget, undefined)).toBe(false); // default
	});

	it("never chromes a built-in panel, even with an explicit override stored", () => {
		expect(effectiveChromeForItem({ type: "builtinPanel", component: "StatusPanel" } as Widget, true)).toBe(false);
	});
});
