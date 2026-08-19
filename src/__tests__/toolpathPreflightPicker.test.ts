import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createDefaultWidget } from "../model/document";
import { mountInDwc, setConnected, setFiles } from "dwc-plugin-test-kit";
import WidgetView from "../widgets/WidgetView.vue";

// GcodeFilePickerDialog teleports to <body> by default in real use; WidgetView doesn't expose a way
// to pass `attach` through to it, so these tests only exercise the trigger button + the dialog
// opening (v-model flips true) rather than clicking a file inside it - that deeper behaviour is
// already covered directly in gcodeFilePicker.test.ts, which DOES set attach: true.
function mount(type: "preflight" | "toolpath") {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget(type) } });
}

describe("PreflightWidget - file picker", () => {
	it("opens the G-code file picker dialog when the browse button is clicked", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [{ name: "part.gcode", isDirectory: false }]);
		const w = mount("preflight");
		const browseBtn = w.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.filePicker.title");
		expect(browseBtn).toBeTruthy();
		await browseBtn!.trigger("click");
		await flushPromises();
		expect(w.findComponent({ name: "VDialog" }).props("modelValue")).toBe(true);
	});
});

describe("ToolpathWidget - resume-from-here removed, file picker added", () => {
	it("has no 'resume from here' affordance anywhere in the widget", () => {
		setConnected(true);
		const w = mount("toolpath");
		expect(w.text().toLowerCase()).not.toContain("resume");
	});

	it("opens the G-code file picker dialog when the browse button is clicked", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [{ name: "part.gcode", isDirectory: false }]);
		const w = mount("toolpath");
		const browseBtn = w.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.filePicker.title");
		expect(browseBtn).toBeTruthy();
		await browseBtn!.trigger("click");
		await flushPromises();
		expect(w.findComponent({ name: "VDialog" }).props("modelValue")).toBe(true);
	});
});
