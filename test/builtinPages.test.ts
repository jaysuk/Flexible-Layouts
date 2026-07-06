import { describe, expect, it } from "vitest";
import { dwc } from "dwc-plugin-test-kit";

import { statusBarSeed } from "../src/model/builtinPages";

function setMachineMode(mode: string | undefined): void {
	(dwc.model as unknown as { state: Record<string, unknown> }).state.machineMode = mode;
}

function components(seed: ReturnType<typeof statusBarSeed>): Array<string> {
	return seed.map((it) => (it.widget as { component: string }).component);
}

describe("statusBarSeed", () => {
	it("approximates the stock FFF status bar (Status / Tools / Temperature chart)", () => {
		setMachineMode(undefined);
		expect(components(statusBarSeed())).toEqual(["StatusPanel", "ToolsPanel", "TemperatureChart"]);
	});

	// DWC's stock CNC/Laser status bar (CNCContainerPanel) is just Status + Tool Position side by
	// side - no Movement/Spindle Speed there (those belong to the Dashboard page).
	it("approximates the stock CNC status bar (Status / Tool Position only)", () => {
		setMachineMode("cnc");
		expect(components(statusBarSeed())).toEqual(["StatusPanel", "CNCAxesPosition"]);
	});

	it("approximates the stock Laser status bar the same as CNC", () => {
		setMachineMode("laser");
		expect(components(statusBarSeed())).toEqual(["StatusPanel", "CNCAxesPosition"]);
	});
});
