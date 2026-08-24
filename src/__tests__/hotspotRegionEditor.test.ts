import { mountInDwc } from "dwc-plugin-test-kit";
import { describe, expect, it } from "vitest";

import HotspotRegionEditor from "../editor/HotspotRegionEditor.vue";

describe("HotspotRegionEditor", () => {
	it("shows a placeholder instead of the drag surface when no image URL is set", () => {
		const w = mountInDwc(HotspotRegionEditor, { props: { url: "", regions: [] } });
		expect(w.find(".hre-stage").exists()).toBe(false);
		expect(w.find(".hre-empty").exists()).toBe(true);
	});

	it("positions each region box from its x/y/w/h percentages, matching HotspotWidget's own convention", () => {
		const w = mountInDwc(HotspotRegionEditor, {
			props: {
				url: "https://example.com/plate.png",
				regions: [{ x: 12, y: 34, w: 20, h: 15 }, { x: 60, y: 5, w: 10, h: 10 }],
			},
		});
		const boxes = w.findAll(".hre-region");
		expect(boxes).toHaveLength(2);
		expect(boxes[0].attributes("style")).toContain("left: 12%");
		expect(boxes[0].attributes("style")).toContain("top: 34%");
		expect(boxes[0].attributes("style")).toContain("width: 20%");
		expect(boxes[0].attributes("style")).toContain("height: 15%");
		expect(boxes[1].attributes("style")).toContain("left: 60%");
	});

	it("dragging a region's body moves it by the pointer delta as a percentage of the stage", async () => {
		const regions = [{ x: 10, y: 10, w: 20, h: 20 }];
		const w = mountInDwc(HotspotRegionEditor, { props: { url: "https://example.com/plate.png", regions } });
		const stage = w.find(".hre-stage").element as HTMLElement;
		Object.defineProperty(stage, "clientWidth", { value: 200, configurable: true });
		Object.defineProperty(stage, "clientHeight", { value: 100, configurable: true });

		const box = w.find(".hre-region").element as HTMLElement;
		box.setPointerCapture = () => {}; // not implemented in happy-dom
		box.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 1 }));
		// Moving 20px right / 10px down over a 200x100 stage is +10% x, +10% y.
		window.dispatchEvent(new PointerEvent("pointermove", { clientX: 20, clientY: 10, pointerId: 1 }));
		window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
		await w.vm.$nextTick();

		expect(regions[0].x).toBeCloseTo(20);
		expect(regions[0].y).toBeCloseTo(20);
		expect(regions[0].w).toBe(20); // unchanged by a move
		expect(regions[0].h).toBe(20);
	});

	it("clamps a moved region so it never goes off the 0-100% stage", async () => {
		const regions = [{ x: 10, y: 10, w: 20, h: 20 }];
		const w = mountInDwc(HotspotRegionEditor, { props: { url: "https://example.com/plate.png", regions } });
		const stage = w.find(".hre-stage").element as HTMLElement;
		Object.defineProperty(stage, "clientWidth", { value: 100, configurable: true });
		Object.defineProperty(stage, "clientHeight", { value: 100, configurable: true });

		const box = w.find(".hre-region").element as HTMLElement;
		box.setPointerCapture = () => {};
		box.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 1 }));
		// A huge drag would push it to x=310, but it must clamp to 100 - w (80).
		window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 300, pointerId: 1 }));
		window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));
		await w.vm.$nextTick();

		expect(regions[0].x).toBe(80);
		expect(regions[0].y).toBe(80);
	});

	it("dragging the resize handle changes w/h, not x/y, and never shrinks below 2%", async () => {
		const regions = [{ x: 10, y: 10, w: 20, h: 20 }];
		const w = mountInDwc(HotspotRegionEditor, { props: { url: "https://example.com/plate.png", regions } });
		const stage = w.find(".hre-stage").element as HTMLElement;
		Object.defineProperty(stage, "clientWidth", { value: 200, configurable: true });
		Object.defineProperty(stage, "clientHeight", { value: 200, configurable: true });

		const handle = w.find(".hre-handle").element as HTMLElement;
		handle.setPointerCapture = () => {};
		handle.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 2, bubbles: true }));
		// -100px each axis on a 200px stage is -50%, clamped to the 2% floor rather than going negative.
		window.dispatchEvent(new PointerEvent("pointermove", { clientX: -100, clientY: -100, pointerId: 2 }));
		window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2 }));
		await w.vm.$nextTick();

		expect(regions[0].w).toBe(2);
		expect(regions[0].h).toBe(2);
		expect(regions[0].x).toBe(10); // resize never moves the origin
		expect(regions[0].y).toBe(10);
	});
});
