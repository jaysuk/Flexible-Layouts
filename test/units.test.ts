import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { dwc, loadObjectModel, lastCode, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import type { Widget } from "../src/model/document";
import { displayToMm, formatLength, lengthDigits, mmToDisplay, stepTitle } from "../src/util/units";
import WidgetView from "../src/widgets/WidgetView.vue";

function withAxes(x: number, y: number, z: number) {
	setModel(loadObjectModel(undefined, {
		overrides: {
			move: {
				workplaceNumber: 0,
				axes: [
					{ letter: "X", homed: true, visible: true, userPosition: x, machinePosition: x, workplaceOffsets: [0, 25.4, 0, 0, 0, 0, 0, 0, 0] },
					{ letter: "Y", homed: true, visible: true, userPosition: y, machinePosition: y, workplaceOffsets: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
					{ letter: "Z", homed: true, visible: true, userPosition: z, machinePosition: z, workplaceOffsets: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
				],
			},
		},
	}));
}

describe("units helpers", () => {
	it("converts both ways and is the identity in metric", () => {
		expect(mmToDisplay(25.4, true)).toBeCloseTo(1, 10);
		expect(displayToMm(1, true)).toBeCloseTo(25.4, 10);
		expect(mmToDisplay(12.5, false)).toBe(12.5);
		expect(displayToMm(12.5, false)).toBe(12.5);
	});

	it("gives inches two more decimals than the widget asked for, and 4 by default", () => {
		expect(lengthDigits(false, 2)).toBe(2);
		expect(lengthDigits(true, 2)).toBe(4);
		expect(lengthDigits(false)).toBe(2);
		expect(lengthDigits(true)).toBe(4);
		expect(lengthDigits(false, undefined, 2, 3)).toBe(3);
	});

	it("formats a length in the active unit", () => {
		expect(formatLength(25.4, false)).toBe("25.40");
		expect(formatLength(25.4, true)).toBe("1.0000");
		expect(formatLength(12.7, true, 1)).toBe("0.500");
	});

	it("titles a step in mm, adding inches only in imperial mode", () => {
		expect(stepTitle(-10, false)).toBe("10 mm");
		expect(stepTitle(-25.4, true)).toBe("25.4 mm (1 in)");
	});
});

describe("widgets under DWC's imperial display units", () => {
	it("DRO shows inches (and says so) when imperial, millimetres otherwise", async () => {
		withAxes(25.4, 50.8, 0);
		const dro = { ...createDefaultWidget("dro") } as Widget;
		const metric = mountInDwc(WidgetView, { props: { widget: dro } });
		await flushPromises();
		expect(metric.text()).toContain("25.40");

		dwc.settings.displayUnits = "inch";
		const imperial = mountInDwc(WidgetView, { props: { widget: dro } });
		await flushPromises();
		expect(imperial.text()).toContain("1.0000");
		expect(imperial.text()).toContain("2.0000");
		expect(imperial.text()).toContain("in");
	});

	it("WCS widget takes a typed inch value and sends millimetres", async () => {
		withAxes(0, 0, 0);
		dwc.settings.displayUnits = "inch";
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("wcs") } });
		await flushPromises();
		await w.find(".wcs-pos").trigger("click");
		const input = w.find("input.wcs-pos-input");
		await input.setValue("1");
		await input.trigger("change");
		await flushPromises();
		expect(lastCode()).toBe("G10 L20 P1 X25.4");
	});

	it("WCS table shows offsets in inches and writes typed inches back as millimetres", async () => {
		withAxes(0, 0, 0);
		dwc.settings.displayUnits = "inch";
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("wcsTable") } });
		await flushPromises();
		const inputs = w.findAll("input.wt-offset");
		// G55 (row 1) X offset is 25.4 mm
		expect((inputs[3] as { element: HTMLInputElement }).element.value).toBe("1.0000");
		await inputs[0].setValue("2");
		await inputs[0].trigger("change");
		await flushPromises();
		expect(lastCode()).toBe("G10 L2 P1 X50.8");
	});

	it("a value widget only converts when it is flagged as a millimetre length", async () => {
		withAxes(25.4, 0, 0);
		dwc.settings.displayUnits = "inch";
		const base = { ...createDefaultWidget("value"), omPath: "move.axes[0].userPosition", display: "number", unit: "mm", precision: 2 } as Widget;
		const plain = mountInDwc(WidgetView, { props: { widget: base } });
		await flushPromises();
		expect(plain.text()).toContain("25.40");
		expect(plain.text()).toContain("mm");

		const flagged = mountInDwc(WidgetView, { props: { widget: { ...base, lengthMm: true } as Widget } });
		await flushPromises();
		expect(flagged.text()).toContain("1.0000");
		expect(flagged.text()).toContain("in");
		expect(flagged.text()).not.toContain("mm");
	});
});
