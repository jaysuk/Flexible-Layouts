import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import type { Widget } from "../src/model/document";
import CommandButtonWidget from "../src/widgets/CommandButtonWidget.vue";

// Regression for the "stretched text/icons" report: shapes using preserveAspectRatio="none" (their
// path legitimately stretches non-uniformly to fill a non-square cell) used to render their label/icon
// inside a <foreignObject> nested in that same <svg> - so the HTML content was stretched right along
// with the path. Pinning that the label/icon now renders as a plain sibling of the <svg>, never inside
// it, for every shape kind that uses "none".
// "rect" is excluded deliberately: isShapedMode treats it as the plain (non-SVG) <v-btn> path, so it
// never goes through the svg/stretch machinery at all. "squircle" is excluded because it isn't a real
// selectable ButtonShape.kind (see document.ts) - shapes.ts supports it, but nothing exposes it here.
const NONE_SHAPES: Array<string> = ["rounded", "pill", "ellipse", "chevron", "arrow", "diamond", "trapezoid"];
const MEET_SHAPES: Array<string> = ["circle", "polygon", "star", "wedge"];

function shapedButton(kind: string): Extract<Widget, { type: "codeButton" }> {
	const w = createDefaultWidget("codeButton") as Extract<Widget, { type: "codeButton" }>;
	w.label = "Home";
	w.icon = "mdi-home";
	w.shape = { kind } as Extract<Widget, { type: "codeButton" }>["shape"];
	return w;
}

describe("CommandButtonWidget - shaped label/icon is never inside the <svg>", () => {
	it.each([...NONE_SHAPES, ...MEET_SHAPES])("shape=%s: label/icon renders outside the svg", (kind) => {
		const wrapper = mountInDwc(CommandButtonWidget, { props: { widget: shapedButton(kind) } });
		const svg = wrapper.find("svg.cmd-shape-svg");
		expect(svg.exists()).toBe(true);
		// The old bug: <foreignObject> (and its label/icon content) as a child of the svg.
		expect(svg.find("foreignObject").exists()).toBe(false);
		expect(svg.find(".cmd-shape-content").exists()).toBe(false);

		// The label/icon content exists as a sibling of the svg instead.
		const content = wrapper.find(".cmd-shape-content");
		expect(content.exists()).toBe(true);
		expect(content.text()).toContain("Home");
	});

});
