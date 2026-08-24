import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { mountInDwc, sentCodes } from "dwc-plugin-test-kit";

import type { Widget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";

function mountHotspot(regions: NonNullable<Extract<Widget, { type: "hotspot" }>["regions"]>) {
	return mountInDwc(WidgetView, {
		props: { widget: { type: "hotspot", url: "https://example.com/plate.png", regions } as Widget },
	});
}

describe("HotspotWidget - region shapes", () => {
	it("renders a region with no shape as the plain rectangular <button> (regression)", () => {
		const w = mountHotspot([{ x: 10, y: 10, w: 20, h: 20, command: "G28", label: "Home" }]);
		expect(w.find("button.hs-region").exists()).toBe(true);
		expect(w.find("svg.hs-region-svg").exists()).toBe(false);
	});

	it("renders a region with shape.kind 'rect' the same as no shape at all", () => {
		const w = mountHotspot([{ x: 10, y: 10, w: 20, h: 20, command: "G28", shape: { kind: "rect" } }]);
		expect(w.find("button.hs-region").exists()).toBe(true);
		expect(w.find("svg.hs-region-svg").exists()).toBe(false);
	});

	it("renders a non-rect shape as an inline SVG path instead of a <button>", () => {
		const w = mountHotspot([{ x: 10, y: 10, w: 20, h: 20, command: "G28", shape: { kind: "circle" } }]);
		expect(w.find("button.hs-region").exists()).toBe(false);
		const path = w.find("svg.hs-region-svg path.hs-region-path");
		expect(path.exists()).toBe(true);
		expect(path.attributes("d")).toBeTruthy();
	});

	it("clicking a shaped region's path still sends its command", async () => {
		const w = mountHotspot([{ x: 10, y: 10, w: 20, h: 20, command: "M18", shape: { kind: "star" } }]);
		await w.find("svg.hs-region-svg path.hs-region-path").trigger("click");
		await flushPromises();
		expect(sentCodes()).toContain("M18");
	});

	it("a mix of shaped and unshaped regions each render their own element kind", () => {
		const w = mountHotspot([
			{ x: 0, y: 0, w: 10, h: 10, command: "G28", shape: { kind: "diamond" } },
			{ x: 50, y: 50, w: 10, h: 10, command: "M18" },
		]);
		expect(w.findAll("svg.hs-region-svg")).toHaveLength(1);
		expect(w.findAll("button.hs-region")).toHaveLength(1);
	});
});
