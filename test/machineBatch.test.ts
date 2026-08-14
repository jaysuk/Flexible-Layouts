import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { lastCode, loadObjectModel, mountInDwc, notifications, sentCodes, setConnected, setFiles, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import type { Widget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";

// Wraps the real machine stub so sendCode's RESOLVED value can be overridden for a single call -
// needed to simulate a firmware "Error: ..." reply, which RRF/DWC resolve normally (never reject).
// Defaults to pass-through (null), so every other test in this file is unaffected.
let nextReplyOverride: string | null = null;
vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => {
			const real = actual.useMachineStore();
			return {
				...real,
				sendCode: async (...args: Parameters<typeof real.sendCode>) => {
					const reply = await real.sendCode(...args);
					if (nextReplyOverride !== null) {
						const r = nextReplyOverride;
						nextReplyOverride = null;
						return r;
					}
					return reply;
				},
			};
		},
	};
});

function mount(widget: Widget) {
	return mountInDwc(WidgetView, { props: { widget } });
}

describe("macros widget - reads the real, live macros directory", () => {
	it("falls back to the thin fixture's implicit '0:/macros' when the OM reports no directories", async () => {
		setConnected(true);
		setFiles("0:/macros", [{ name: "bed.g", isDirectory: false }]);
		const w = mount(createDefaultWidget("macros"));
		await flushPromises();
		expect(w.text()).toContain("bed");
	});

	it("uses the OM's reported directories.macros instead of the hardcoded default (real firmware reports a trailing slash)", async () => {
		setConnected(true);
		setModel(loadObjectModel()); // full fixture: directories.macros === "0:/macros/"
		setFiles("0:/macros/", [{ name: "purge.g", isDirectory: false }]);
		// Files were never placed at the hardcoded "0:/macros" (no trailing slash) - if the widget
		// still queried that literal string, this would come back empty exactly like the report said.
		const w = mount(createDefaultWidget("macros"));
		await flushPromises();
		expect(w.text()).toContain("purge");
		expect(w.text()).not.toContain("plugins.flexibleLayouts.macros.none");
	});

	it("a widget-level folder override still wins over the OM default", async () => {
		setConnected(true);
		setModel(loadObjectModel());
		setFiles("0:/macros/Filament", [{ name: "load.g", isDirectory: false }]);
		const w = mount({ ...createDefaultWidget("macros"), folder: "0:/macros/Filament" } as Widget);
		await flushPromises();
		expect(w.text()).toContain("load");
	});
});

describe("extruder widget", () => {
	it("retract button follows widget.color, matching extrude (was hardcoded to warning)", () => {
		const w = mount({ ...createDefaultWidget("extruder"), color: "purple" } as Widget);
		const buttons = w.findAllComponents({ name: "VBtn" });
		const retract = buttons.find((b) => b.text().includes("plugins.flexibleLayouts.extruder.retract"));
		expect(retract?.props("color")).toBe("purple");
	});

	it("mm/s <-> mm/min toggle converts the displayed value without changing the sent feedrate", async () => {
		const widget = { ...createDefaultWidget("extruder"), feedrate: 300 } as Extract<Widget, { type: "extruder" }>;
		const w = mount(widget);
		const input = w.find(".ex-num");
		expect((input.element as HTMLInputElement).value).toBe("300"); // mm/min, unchanged
		await w.find(".ex-unit-toggle").trigger("click");
		expect((input.element as HTMLInputElement).value).toBe("5"); // 300 mm/min == 5 mm/s
		expect(widget.feedrate).toBe(300); // storage stays in mm/min
	});

	it("shows a cold-extrude warning when the tool's heater is below the threshold, and colours the extrude button", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				tools: [{ number: 0, heaters: [1], extruders: [0] }],
				state: { currentTool: 0 },
				heat: { coldExtrudeTemperature: 160, coldRetractTemperature: 90, heaters: [null, { current: 25 }] },
			},
		}));
		const w = mount(createDefaultWidget("extruder"));
		await flushPromises();
		expect(w.find(".ex-cold-warning").exists()).toBe(true);
		// The i18n stub echoes the key rather than a real rendered translation, so assert the warning
		// key itself rendered (not "160" - that would only show up in the real English template).
		expect(w.text()).toContain("plugins.flexibleLayouts.extruder.coldWarning");
	});

	it("does not warn when the heater is up to temperature", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				tools: [{ number: 0, heaters: [1], extruders: [0] }],
				state: { currentTool: 0 },
				heat: { coldExtrudeTemperature: 160, coldRetractTemperature: 90, heaters: [null, { current: 210 }] },
			},
		}));
		const w = mount(createDefaultWidget("extruder"));
		await flushPromises();
		expect(w.find(".ex-cold-warning").exists()).toBe(false);
	});

	it("surfaces a firmware 'Error: ...' reply (e.g. a refused cold extrude) as a notification, instead of swallowing it", async () => {
		nextReplyOverride = "Error: G1: Cold extrusion is not allowed";
		const w = mount(createDefaultWidget("extruder"));
		const extrude = w.findAllComponents({ name: "VBtn" }).find((b) => b.text().includes("plugins.flexibleLayouts.extruder.extrude"));
		await extrude!.trigger("click");
		await flushPromises();
		expect(notifications().some((n) => n.message?.includes("Cold extrusion"))).toBe(true);
	});
});

describe("wcs widget", () => {
	it("per-axis zero and zero-all buttons follow widget.color (previously hardcoded to warning)", () => {
		const w = mount({ ...createDefaultWidget("wcs"), color: "teal" } as Widget);
		const zeroAll = w.findAllComponents({ name: "VBtn" }).find((b) => b.text().includes("plugins.flexibleLayouts.wcs.zeroHere"));
		expect(zeroAll?.props("color")).toBe("teal");
	});

	it("clicking a work-position value turns it into an editable field, committing via G10 L20", async () => {
		const w = mount(createDefaultWidget("wcs"));
		await w.find(".wcs-pos").trigger("click");
		const input = w.find(".wcs-pos-input");
		expect(input.exists()).toBe(true);
		await input.setValue("12.5");
		await input.trigger("change");
		await flushPromises();
		expect(lastCode()).toMatch(/^G10 L20 P1 X12\.5$/);
	});

	it("reset-offsets button clears the raw offset (G10 L2), distinct from zero-here (G10 L20)", async () => {
		const w = mount(createDefaultWidget("wcs"));
		const reset = w.findAllComponents({ name: "VBtn" }).find((b) => b.text().includes("plugins.flexibleLayouts.wcs.reset"));
		await reset!.trigger("click");
		await flushPromises();
		expect(lastCode()).toMatch(/^G10 L2 P1 /);
	});
});

describe("wcsTable widget", () => {
	it("copy button follows widget.color (previously had no color binding at all)", () => {
		const w = mount({ ...createDefaultWidget("wcsTable"), color: "indigo" } as Widget);
		const copyBtn = w.findAllComponents({ name: "VBtn" }).find((b) => b.text().includes("plugins.flexibleLayouts.wcsTable.copyButton"));
		expect(copyBtn?.props("color")).toBe("indigo");
	});
});

describe("bedTram widget", () => {
	it("shows the command's own reply text (a custom tramming macro's plain-text output), not just OM-derived numbers", async () => {
		nextReplyOverride = "Corner deviation: 0.045mm";
		const w = mount({ ...createDefaultWidget("bedTram"), confirm: false } as Widget);
		await w.find("button").trigger("click");
		await flushPromises();
		expect(w.text()).toContain("Corner deviation: 0.045mm");
	});
});

describe("toolSelect widget", () => {
	it("the deselect button shows T-1 and follows widget.color when active", async () => {
		setModel(loadObjectModel(undefined, { overrides: { tools: [{ number: 0, name: "T0" }], state: { currentTool: -1 } } }));
		const w = mount({ ...createDefaultWidget("toolSelect"), color: "cyan" } as Widget);
		await flushPromises();
		const noneBtn = w.findAllComponents({ name: "VBtn" }).find((b) => b.text().includes("T-1"));
		expect(noneBtn).toBeTruthy();
		expect(noneBtn?.props("color")).toBe("cyan");
	});
});

describe("console-family widgets - shared, persistent command history", () => {
	it("a command sent from one console-family widget is recallable from a separately-mounted one", async () => {
		const a = mount(createDefaultWidget("console"));
		await a.find(".cn-input").setValue("M115");
		await a.find(".cn-input").trigger("keydown.enter");
		await flushPromises();

		// A second, independently-mounted widget (simulating a different instance on the layout, or
		// the same one after a remount) must see the SAME history - a fresh local ref would not.
		const b = mount(createDefaultWidget("consoleInput"));
		await b.find(".ci-input").trigger("keydown.up");
		expect((b.find(".ci-input").element as HTMLInputElement).value).toBe("M115");
	});

	it("re-sending the same command moves it to the end rather than duplicating it", async () => {
		const w = mount(createDefaultWidget("console"));
		for (const code of ["M114", "M115", "M114"]) {
			await w.find(".cn-input").setValue(code);
			await w.find(".cn-input").trigger("keydown.enter");
			await flushPromises();
		}
		expect(sentCodes().filter((c) => c === "M114")).toHaveLength(2); // both sends went through
		const input = w.find(".cn-input");
		await input.trigger("keydown.up");
		expect((input.element as HTMLInputElement).value).toBe("M114"); // most recent
		await input.trigger("keydown.up");
		expect((input.element as HTMLInputElement).value).toBe("M115"); // not a repeated M114
	});
});

describe("console widget - custom colour", () => {
	it("defaults to the theme primary/inherited colours when unset (no visual regression)", () => {
		const w = mount(createDefaultWidget("console"));
		expect((w.element as HTMLElement).style.getPropertyValue("--cn-color")).toBe("");
	});

	it("sets the --cn-color custom property when a colour is configured", () => {
		const w = mount({ ...createDefaultWidget("console"), color: "#ff8800" } as Widget);
		expect((w.element as HTMLElement).style.getPropertyValue("--cn-color")).toBe("#ff8800");
	});
});
