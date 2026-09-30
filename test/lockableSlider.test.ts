import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { dwc, lastCode, mountInDwc } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import type { Widget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";

const slider = { ...createDefaultWidget("slider"), command: "M106 S{value}", min: 0, max: 100, step: 1, scale: 1, offset: 0 } as Widget;

describe("slider widgets honour DWC's slider settings", () => {
	it("has no lock button on a desktop-sized display with the default 'phones only' setting", () => {
		const w = mountInDwc(WidgetView, { props: { widget: slider } });
		expect(w.find(".ls-lock").exists()).toBe(false);
	});

	it("shows a lock button when sliders are always lockable, starts locked, and unlocks on click", async () => {
		dwc.settings.behaviour = { lockableSliders: "always", numericInputs: false };
		const w = mountInDwc(WidgetView, { props: { widget: slider } });
		const lock = w.find(".ls-lock");
		expect(lock.exists()).toBe(true);
		expect(w.find(".v-slider").classes()).toContain("v-input--readonly");
		await lock.trigger("click");
		expect(w.find(".v-slider").classes()).not.toContain("v-input--readonly");
	});

	it("never shows the lock when disabled, even on a phone-sized display", () => {
		dwc.settings.behaviour = { lockableSliders: "disabled", numericInputs: false };
		const w = mountInDwc(WidgetView, { props: { widget: slider } });
		expect(w.find(".ls-lock").exists()).toBe(false);
	});

	it("swaps the slider for a number field in numeric mode and sends the typed, clamped value", async () => {
		dwc.settings.behaviour = { lockableSliders: "always", numericInputs: true };
		const w = mountInDwc(WidgetView, { props: { widget: slider } });
		expect(w.find(".v-slider").exists()).toBe(false);
		expect(w.find(".ls-lock").exists()).toBe(false);
		const input = w.find("input[type=number]");
		await input.setValue("250");
		await input.trigger("blur");
		await flushPromises();
		expect(lastCode()).toBe("M106 S100");
	});

	it("the fan and spindle widgets use the same control", () => {
		dwc.settings.behaviour = { lockableSliders: "always", numericInputs: true };
		for (const type of ["fan", "spindle"] as const) {
			const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget(type) } });
			expect(w.find("input[type=number]").exists()).toBe(true);
			expect(w.find(".v-slider").exists()).toBe(false);
		}
	});
});
