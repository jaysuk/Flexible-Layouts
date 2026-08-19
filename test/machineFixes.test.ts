import { describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import type { Widget } from "../src/model/document";
import { describeWidget, FREEFORM_WIDGETS } from "../src/widgets/registry";
import WidgetView from "../src/widgets/WidgetView.vue";

/** createDefaultWidget returns the whole `Widget` union, so reading a variant's own field off it
 *  (label, camWidth, ...) is a type error. Tests here always know which variant they asked for, so
 *  narrow once here rather than casting at every call site. */
function defaultWidget<T extends Widget["type"]>(type: T): Extract<Widget, { type: T }> {
	return createDefaultWidget(type) as Extract<Widget, { type: T }>;
}

describe("extruder widget - no redundant default label", () => {
	it("has no default label, so the widget's own label span doesn't render", () => {
		const widget = defaultWidget("extruder");
		expect(widget.label).toBe("");
		const w = mountInDwc(WidgetView, { props: { widget } });
		expect(w.find(".ex-label").exists()).toBe(false);
	});

	it("the chrome title still falls back to the translated default (not blank)", () => {
		const widget = defaultWidget("extruder");
		expect(describeWidget(widget).title).toBe("plugins.flexibleLayouts.widgets.extruder");
	});

	it("a user-set label still renders on the widget itself", () => {
		const widget = { ...defaultWidget("extruder"), label: "Extruder 2" };
		const w = mountInDwc(WidgetView, { props: { widget } });
		expect(w.find(".ex-label").text()).toBe("Extruder 2");
	});
});

describe("wcsTable widget - default size fits every WCS row without scrolling", () => {
	it("defaults to a taller cell than before (was h:12, causing a visible scrollbar)", () => {
		const entry = FREEFORM_WIDGETS.find((e) => e.type === "wcsTable");
		expect(entry?.defaultSize.h).toBeGreaterThan(12);
	});

	it("renders all 9 workplace systems (G54..G59.3)", () => {
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("wcsTable") } });
		for (const code of ["G54", "G55", "G56", "G57", "G58", "G59", "G59.1", "G59.2", "G59.3"]) {
			expect(w.text()).toContain(code);
		}
	});
});

describe("toolAlign widget - step-distance select", () => {
	// jsdom/happy-dom don't compute real layout, so the visual truncation itself (the ".ta-step"
	// rule's max-width was too narrow for even the shortest option) can't be asserted here directly -
	// see the CSS comment in ToolAlignWidget.vue. This pins the underlying data the fix has to keep
	// working for: every step distance renders with its full, untruncated "N mm" title.
	it("offers every configured jog step with its full, untruncated label", () => {
		const w = mountInDwc(WidgetView, { props: { widget: defaultWidget("toolAlign") } });
		const select = w.findComponent({ name: "VSelect" });
		expect(select.props("items")).toEqual([
			{ title: "0.01 mm", value: 0.01 },
			{ title: "0.05 mm", value: 0.05 },
			{ title: "0.1 mm", value: 0.1 },
			{ title: "0.5 mm", value: 0.5 },
			{ title: "1 mm", value: 1 },
		]);
	});
});

describe("toolAlign widget - draggable camera/controls divider", () => {
	// happy-dom has no real layout engine (every element's getBoundingClientRect() is all zeros by
	// default), so the root/camera widths the drag math depends on are stubbed explicitly here.
	function stubRects(rootWidth: number, camWidth: number) {
		const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
		spy.mockImplementation(function (this: HTMLElement) {
			const width = this.classList.contains("ta-root") ? rootWidth : camWidth;
			return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON() { return {}; } };
		});
		return spy;
	}

	it("applies an inline flex-basis (overriding the CSS max-width) when the widget already has a saved camWidth", () => {
		const widget = { ...defaultWidget("toolAlign"), camWidth: 250 };
		const w = mountInDwc(WidgetView, { props: { widget } });
		const cam = w.find(".ta-cam");
		// Vue expands the "flex" shorthand into its longhand properties when rendering :style.
		expect(cam.attributes("style")).toContain("flex-basis: 250px");
		expect(cam.attributes("style")).toContain("max-width: none");
	});

	it("has no inline style at all when camWidth was never set (falls back to the original CSS default)", () => {
		const w = mountInDwc(WidgetView, { props: { widget: defaultWidget("toolAlign") } });
		const cam = w.find(".ta-cam");
		expect(cam.attributes("style") ?? "").toBe("");
	});

	it("dragging the divider persists the new width onto the widget itself, clamped within bounds", async () => {
		const spy = stubRects(600, 200); // root 600px wide, camera starts at 200px
		try {
			const widget = defaultWidget("toolAlign");
			const w = mountInDwc(WidgetView, { props: { widget } });
			const divider = w.find(".ta-divider");

			await divider.trigger("mousedown", { clientX: 100 });
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 })); // +50px right
			window.dispatchEvent(new MouseEvent("mouseup"));
			await w.vm.$nextTick();

			expect(widget.camWidth).toBe(250); // 200 + 50, well within the 110..450 clamp range
		} finally {
			spy.mockRestore();
		}
	});

	it("clamps to the minimum width instead of collapsing to nothing", async () => {
		const spy = stubRects(600, 200);
		try {
			const widget = defaultWidget("toolAlign");
			const w = mountInDwc(WidgetView, { props: { widget } });
			const divider = w.find(".ta-divider");

			await divider.trigger("mousedown", { clientX: 100 });
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: -1000 })); // drag way past the left edge
			window.dispatchEvent(new MouseEvent("mouseup"));
			await w.vm.$nextTick();

			expect(widget.camWidth).toBe(110); // CAM_MIN_PX
		} finally {
			spy.mockRestore();
		}
	});

	it("clamps to leave at least 150px for the controls column instead of swallowing the whole widget", async () => {
		const spy = stubRects(600, 200); // max = 600 - 150 = 450
		try {
			const widget = defaultWidget("toolAlign");
			const w = mountInDwc(WidgetView, { props: { widget } });
			const divider = w.find(".ta-divider");

			await divider.trigger("mousedown", { clientX: 100 });
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000 })); // drag way past the right edge
			window.dispatchEvent(new MouseEvent("mouseup"));
			await w.vm.$nextTick();

			expect(widget.camWidth).toBe(450);
		} finally {
			spy.mockRestore();
		}
	});
});
