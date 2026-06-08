import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { dwc, lastCode, mountInDwc, sentCodes, setMessageBox } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";

// Mount a default widget of `type` and return the wrapper.
function mountWidget(type: Parameters<typeof createDefaultWidget>[0]) {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget(type) } });
}
function byTitle(wrapper: ReturnType<typeof mountWidget>, title: string) {
	return wrapper.findAll("button").find((b) => b.attributes("title") === title);
}
function byText(wrapper: ReturnType<typeof mountWidget>, substr: string) {
	return wrapper.findAll("button").find((b) => b.text().includes(substr));
}

describe("widgets emit the expected G-code", () => {
	it("codeButton sends its code", async () => {
		const w = mountWidget("codeButton");
		await w.find("button").trigger("click");
		await flushPromises();
		expect(sentCodes()).toContain("G28");
	});

	it("stepper (relative) sends ±step", async () => {
		const w = mountWidget("stepper"); // default: babystep, relative, step 0.05, M290 Z{value}
		const buttons = w.findAll("button");
		await buttons[buttons.length - 1].trigger("click"); // the "+" button
		await flushPromises();
		expect(lastCode()).toBe("M290 Z0.05");
	});

	it("WCS zero sends G10 L20 for the active workplace", async () => {
		const w = mountWidget("wcs");
		await byText(w, "wcs.zeroHere")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G10 L20 P1 X0 Y0 Z0");
	});

	it("spindle forward sends M3 S<rpm>", async () => {
		const w = mountWidget("spindle");
		await byTitle(w, "plugins.flexibleLayouts.spindle.forward")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toMatch(/^M3 S\d+$/);
	});

	it("spindle stop sends M5", async () => {
		const w = mountWidget("spindle");
		await byTitle(w, "plugins.flexibleLayouts.spindle.stop")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M5");
	});

	it("extruder extrude sends M83 + G1 E", async () => {
		const w = mountWidget("extruder"); // default amounts [1,5,10,50] -> selects 5, feedrate 300
		await byText(w, "extruder.extrude")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M83\nG1 E5 F300");
	});

	it("toggle switch sends the on command", async () => {
		const w = mountWidget("toggle"); // default ATX, M80/M81, switch
		await w.find('input[type="checkbox"]').setValue(true);
		await flushPromises();
		expect(lastCode()).toBe("M80");
	});

	it("jobControl pause sends M25 while printing", async () => {
		const w = mountWidget("jobControl");
		(dwc.model as { state: { status: string } }).state.status = "processing";
		await flushPromises();
		await byTitle(w, "plugins.flexibleLayouts.jobControl.pause")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M25");
	});

	it("messageBox OK acknowledges with M292", async () => {
		const w = mountWidget("messageBox");
		setMessageBox({ mode: 2, title: "Heads up", message: "Continue?", cancelButton: false });
		await flushPromises();
		await byText(w, "generic.ok")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M292");
	});

	it("neopixel Off blanks the strip", async () => {
		const w = mountWidget("neopixel"); // default RGBW strip, 30 LEDs
		await byTitle(w, "plugins.flexibleLayouts.neopixel.off")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M150 E0 R0 U0 B0 W0 S30 F0");
	});
});

describe("read-out widgets render live values", () => {
	it("DRO shows axis positions from the object model", () => {
		const w = mountWidget("dro");
		expect(w.text()).toContain("12.50"); // X userPosition from the fixture
		expect(w.text()).toContain("X");
	});
});
