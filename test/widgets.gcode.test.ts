import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { byText, byTitle, lastCode, mountInDwc, sentCodes, setFiles, setMessageBox } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";

// Mount a default widget of `type` and return the wrapper.
function mountWidget(type: Parameters<typeof createDefaultWidget>[0]) {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget(type) } });
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

	it("stepper hides its live value when showValue is explicitly false", async () => {
		const withValue = mountWidget("stepper");
		expect(withValue.find(".st-val").exists()).toBe(true);

		const hidden = mountInDwc(WidgetView, { props: { widget: { ...createDefaultWidget("stepper"), showValue: false } } });
		expect(hidden.find(".st-val").exists()).toBe(false);
	});

	it("stepper's +/- icons are configurable", async () => {
		const w = mountInDwc(WidgetView, {
			props: { widget: { ...createDefaultWidget("stepper"), plusIcon: "mdi-arrow-up", minusIcon: "mdi-arrow-down" } },
		});
		expect(w.html()).toContain("mdi-arrow-up");
		expect(w.html()).toContain("mdi-arrow-down");
		expect(w.html()).not.toContain("mdi-plus");
		expect(w.html()).not.toContain("mdi-minus");
	});

	it("slider sends the value converted back through scale/offset, not the raw display position", async () => {
		// Default slider: scale 100, offset 0, command "M106 P0 S{value}" - RRF's M106 S is a 0.0-1.0
		// fraction (verified against Duet3D/wiki-content's Gcodes.md), and the slider displays 0-100%.
		// Dragging to the full-scale end (100 on the display) must send S1, not the literal S100 the
		// old code sent (which RRF's own M106 doc says means "100 out of 255", not 100%).
		const w = mountWidget("slider");
		const slider = w.findComponent({ name: "VSlider" });
		await slider.vm.$emit("update:model-value", 100);
		await slider.vm.$emit("end", 100);
		await flushPromises();
		expect(lastCode()).toBe("M106 P0 S1");
	});

	it("slider at a mid position converts proportionally", async () => {
		const w = mountWidget("slider");
		const slider = w.findComponent({ name: "VSlider" });
		await slider.vm.$emit("update:model-value", 40);
		await slider.vm.$emit("end", 40);
		await flushPromises();
		expect(lastCode()).toBe("M106 P0 S0.4");
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

	it("extruder extrude sends M83 + G1 E (length mode: amount + feed-rate)", async () => {
		// default amounts [1,5,10,50] -> selects 5; default mode "length", feed-rate 300
		const w = mountWidget("extruder");
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

	it("messageBox OK acknowledges with M292", async () => {
		const w = mountWidget("messageBox");
		setMessageBox({ mode: 2, title: "Heads up", message: "Continue?", cancelButton: false });
		await flushPromises();
		await byText(w, "generic.ok")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M292");
	});

	it("jog Home X / Home Y send per-axis G28", async () => {
		const w = mountWidget("jog");
		await byTitle(w, "plugins.flexibleLayouts.jog.home X")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28 X");
		await byTitle(w, "plugins.flexibleLayouts.jog.home Y")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28 Y");
	});

	it("files widget lists folders, navigates into them, and starts a file", async () => {
		setFiles("0:/gcodes", [{ name: "Calibration", isDirectory: true }, { name: "a.gcode", isDirectory: false }]);
		setFiles("0:/gcodes/Calibration", [{ name: "cube.gcode", isDirectory: false }]);
		const w = mountWidget("files");
		await flushPromises();
		expect(w.text()).toContain("Calibration"); // folder shown
		expect(w.text()).toContain("a.gcode");      // file shown
		await byText(w, "Calibration")!.trigger("click");
		await flushPromises();
		expect(w.text()).toContain("cube.gcode");    // navigated into the sub-folder
		await byText(w, "cube.gcode")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe('M32 "0:/gcodes/Calibration/cube.gcode"');
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
