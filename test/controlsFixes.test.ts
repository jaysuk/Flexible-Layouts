import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { byText, lastCode, mountInDwc, sentCodes } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import type { Widget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";

// The kit's useInputDialog stub auto-resolves null (nothing to type into). Override it here so the
// editStep tests below can drive a specific "typed" answer.
let nextNumericAnswer: number | null = null;
vi.mock("@/composables/useInputDialog", () => ({
	getNumericInput: () => Promise.resolve(nextNumericAnswer),
	getStringInput: () => Promise.resolve(null),
}));

function mount<T extends Widget>(widget: T) {
	return mountInDwc(WidgetView, { props: { widget } });
}

describe("input widget - target caption", () => {
	it("shows the global variable it sets", () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "global", globalName: "myVar" } as Widget);
		expect(w.text()).toContain("global.myVar");
	});

	it("shows the command template it sends", () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "command", commandTemplate: "M291 P{value}" } as Widget);
		expect(w.text()).toContain("M291 P{value}");
	});

	it("shows nothing when neither is configured", () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "command", commandTemplate: "" } as Widget);
		expect(w.text()).not.toContain("global.");
	});
});

describe("input widget - sending", () => {
	it("sets a numeric global with a bare (unquoted) RHS", async () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "global", globalName: "myVar", inputKind: "number" } as Widget);
		await w.find("input").setValue("5");
		await w.find("button").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("set global.myVar=5");
	});

	it("sets a string global with a quoted RHS", async () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "global", globalName: "myVar", inputKind: "text" } as Widget);
		await w.find("input").setValue("hi");
		await w.find("button").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe('set global.myVar="hi"');
	});

	it("substitutes {value} into a command template", async () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "command", commandTemplate: "M291 P{value}" } as Widget);
		await w.find("input").setValue("42");
		await w.find("button").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M291 P42");
	});

	it("prefills from the live global value on mount", () => {
		const w = mount({ ...createDefaultWidget("input"), mode: "global", globalName: "myNumber", inputKind: "number" } as Widget);
		expect((w.find("input").element as HTMLInputElement).value).toBe("42");
	});
});

describe("toggle widget - button mode icon layout", () => {
	it("defaults to column layout (icon above label)", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "button", label: "Lights" } as Widget);
		const content = w.find(".v-btn__content > div");
		expect(content.classes()).toContain("flex-column");
	});

	it("respects a configured iconPosition", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "button", iconPosition: "right" } as Widget);
		const content = w.find(".v-btn__content > div");
		expect(content.classes()).toContain("flex-row-reverse");
	});
});

describe("toggle widget - label position and off colour", () => {
	it("renders the label after the switch when labelPosition is right", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "switch", label: "Fan", labelPosition: "right" } as Widget);
		const root = w.find(".tg-root");
		const switchIndex = root.html().indexOf("v-switch");
		const labelIndex = root.html().indexOf("Fan");
		expect(switchIndex).toBeGreaterThan(-1);
		expect(labelIndex).toBeGreaterThan(switchIndex);
	});

	it("passes offColor through as the switch's base-color", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "switch", offColor: "#ff0000" } as Widget);
		const sw = w.findComponent({ name: "VSwitch" });
		expect(sw.props("baseColor")).toBe("#ff0000");
	});

	it("right-justifies the label when labelPosition is right (spacer sits before it, not after)", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "switch", label: "Fan", labelPosition: "right" } as Widget);
		const root = w.find(".tg-root");
		const spacerIndex = root.html().indexOf("v-spacer");
		const labelIndex = root.html().indexOf(">Fan<");
		expect(spacerIndex).toBeGreaterThan(-1);
		expect(labelIndex).toBeGreaterThan(spacerIndex);
		expect(w.find(".tg-label").classes()).toContain("text-right");
	});
});

describe("toggle widget - state follows the OM value's type", () => {
	it("treats a positive number as on", () => {
		const w = mount({ ...createDefaultWidget("toggle"), omPath: "global.myNumber" } as Widget); // 42
		expect((w.findComponent({ name: "VSwitch" }).props("modelValue") as boolean)).toBe(true);
	});

	it("treats a non-empty, non-'false', non-'0' string as on", () => {
		const w = mount({ ...createDefaultWidget("toggle"), omPath: "global.myText" } as Widget); // "hello"
		expect((w.findComponent({ name: "VSwitch" }).props("modelValue") as boolean)).toBe(true);
	});

	it("button mode toggles the local latch and sends the matching command", async () => {
		const w = mount({
			...createDefaultWidget("toggle"), variant: "button", onCommand: "M80", offCommand: "M81",
		} as Widget);
		await w.find(".tg-btn").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M80");
	});

	it("supports bottom icon position in button mode", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "button", iconPosition: "bottom" } as Widget);
		expect(w.find(".v-btn__content > div").classes()).toContain("flex-column-reverse");
	});

	it("button mode grows to fill the widget's height, not a fixed Vuetify default", () => {
		const w = mount({ ...createDefaultWidget("toggle"), variant: "button" } as Widget);
		expect(w.find(".tg-btn").classes()).toContain("fill-height");
	});
});

describe("jog widget - unhomed home-button indication", () => {
	it("flags only the axis the fixture reports as unhomed (Z), not a homed one (X)", () => {
		// dwc-plugin-test-kit's default fixture: X and Y homed, Z not - see fixtures.ts.
		const w = mount(createDefaultWidget("jog"));
		expect(w.find(".jog-home-x").classes()).not.toContain("jog-home-unhomed");
		expect(w.find(".jog-zhome").classes()).toContain("jog-home-unhomed");
	});
});

describe("jog widget - motors off and step editing", () => {
	it("sends M18 from the motors-off button", async () => {
		const w = mount({ ...createDefaultWidget("jog"), showMotorsOff: true } as Widget);
		await byText(w, "plugins.flexibleLayouts.jog.motorsOff")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M18");
	});

	it("right-click on a step updates the saved xySteps array with the typed answer", async () => {
		nextNumericAnswer = 42;
		const widget = createDefaultWidget("jog");
		const w = mount(widget);
		await w.find(".jog-sector").trigger("contextmenu");
		await flushPromises();
		expect(widget.xySteps).toContain(42);
		nextNumericAnswer = null;
	});

	it("right-click on a Z step updates the saved zSteps array", async () => {
		nextNumericAnswer = 3;
		const widget = createDefaultWidget("jog");
		const w = mount(widget);
		await w.find(".jog-zbtn").trigger("contextmenu");
		await flushPromises();
		expect(widget.zSteps).toContain(3);
		nextNumericAnswer = null;
	});

	it("clicking an XY sector sends a relative jog move", async () => {
		const w = mount(createDefaultWidget("jog"));
		await w.find(".jog-sector").trigger("click");
		await flushPromises();
		expect(lastCode()).toMatch(/^M120\nG91\nG1 /);
	});

	it("clicking the centre hub homes all axes", async () => {
		const w = mount(createDefaultWidget("jog"));
		await w.find(".jog-hub").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28");
	});
});

describe("octopusJog widget - motors off, DRO and step editing", () => {
	it("sends M18 from the motors-off button", async () => {
		const w = mount({ ...createDefaultWidget("octopusJog"), showMotorsOff: true } as Widget);
		await byText(w, "plugins.flexibleLayouts.jog.motorsOff")!.trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("M18");
	});

	it("shows live axis positions when showDro is enabled", () => {
		const w = mount({ ...createDefaultWidget("octopusJog"), showDro: true } as Widget);
		expect(w.find(".oct-dro").exists()).toBe(true);
		expect(w.text()).toContain("12.50"); // X machinePosition from the fixture
	});

	it("right-click on a step updates the saved xySteps array with the typed answer", async () => {
		nextNumericAnswer = 7;
		const widget = createDefaultWidget("octopusJog");
		const w = mount(widget);
		await w.find(".oct-sector").trigger("contextmenu");
		await flushPromises();
		expect(widget.xySteps).toContain(7);
		nextNumericAnswer = null;
	});

	it("clicking an XY sector sends a relative jog move", async () => {
		const w = mount(createDefaultWidget("octopusJog"));
		await w.find(".oct-sector").trigger("click");
		await flushPromises();
		expect(lastCode()).toMatch(/^M120\nG91\nG1 /);
	});

	it("Home X / Home Y / Home Z / Home All send the expected G28 variants", async () => {
		const w = mount(createDefaultWidget("octopusJog"));
		await w.find(".oct-home-x").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28 X");
		await w.find(".oct-home-y").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28 Y");
		await w.find(".oct-zhome").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28 Z");
		await w.find(".oct-hub").trigger("click");
		await flushPromises();
		expect(lastCode()).toBe("G28");
	});
});

describe("octopusJog widget - ring legend", () => {
	it("renders a dot per configured ring with independent opacity", () => {
		const w = mount({ ...createDefaultWidget("octopusJog"), xySteps: [100, 10, 1, 0.1] } as Widget);
		const dots = w.findAll(".oct-bullet-dot");
		expect(dots.length).toBe(4);
		const opacities = dots.map((d) => (d.element as HTMLElement).style.opacity);
		expect(new Set(opacities).size).toBeGreaterThan(1); // rings are actually visually distinct
	});
});

describe("slider widget - explicit precision overrides the step-based default", () => {
	it("keeps a decimal place when precision is set, instead of rounding to a whole step", () => {
		// heat.heaters[0].current = 60.1 in the fixture; default integer step would round this to "60".
		const w = mount({ ...createDefaultWidget("slider"), precision: 1, omPath: "heat.heaters[0].current", scale: 1, offset: 0 } as Widget);
		expect(w.find(".sl-val").text()).toBe("60.1%");
	});
});

describe("stepper widget - absolute mode clamps to min/max", () => {
	it("clamps a step that would overshoot max down to the limit", async () => {
		// omPath unset -> current value treated as 0; a single +20 step against max:15 would send
		// X20 without the clamp.
		const w = mount({
			...createDefaultWidget("stepper"), mode: "absolute", omPath: "", step: 20, max: 15, command: "G1 X{value}",
		} as Widget);
		const buttons = w.findAll("button");
		await buttons[buttons.length - 1].trigger("click"); // "+"
		await flushPromises();
		expect(sentCodes().at(-1)).toBe("G1 X15");
	});
});
