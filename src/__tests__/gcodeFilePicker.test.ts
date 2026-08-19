import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { loadObjectModel, mountInDwc, setConnected, setFiles, setModel } from "dwc-plugin-test-kit";

import GcodeFilePickerDialog from "../widgets/GcodeFilePickerDialog.vue";

// attach: true keeps v-dialog's content in the local DOM tree instead of teleporting to <body> -
// otherwise Vue Test Utils' wrapper queries can't see it at all (a real Vuetify testing gotcha, not
// a bug in the component - production leaves `attach` unset so teleport-to-body still applies).
//
// Mounts CLOSED then transitions open, matching how the real widgets use it (a ref(false) that only
// flips true on a later click) - the component's own load-on-open watcher only fires on a genuine
// false->true change, not on an already-true initial prop, so mounting pre-opened would never load.
async function mountPicker(props: { rootFolder?: string } = {}) {
	const w = mountInDwc(GcodeFilePickerDialog, { props: { attach: true, modelValue: false, ...props } });
	await w.setProps({ modelValue: true });
	await flushPromises();
	return w;
}

describe("GcodeFilePickerDialog", () => {
	it("falls back to the implicit '0:/gcodes' root when the OM reports no directories", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [{ name: "part.gcode", isDirectory: false }]);
		const w = await mountPicker();
		expect(w.text()).toContain("part.gcode");
	});

	it("uses the OM's reported directories.gCodes instead of the hardcoded default", async () => {
		setConnected(true);
		setModel(loadObjectModel(undefined, { overrides: { directories: { gCodes: "0:/gcodes/custom" } } }));
		setFiles("0:/gcodes/custom", [{ name: "custom.gcode", isDirectory: false }]);
		const w = await mountPicker();
		expect(w.text()).toContain("custom.gcode");
	});

	it("an explicit rootFolder prop wins over the OM default", async () => {
		setConnected(true);
		setModel(loadObjectModel());
		setFiles("0:/gcodes/Sub", [{ name: "sub.gcode", isDirectory: false }]);
		const w = await mountPicker({ rootFolder: "0:/gcodes/Sub" });
		expect(w.text()).toContain("sub.gcode");
	});

	it("only lists gcode-like files, not arbitrary ones, and lists subfolders too", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [
			{ name: "Subfolder", isDirectory: true },
			{ name: "part.gcode", isDirectory: false },
			{ name: "readme.txt", isDirectory: false },
		]);
		const w = await mountPicker();
		expect(w.text()).toContain("Subfolder");
		expect(w.text()).toContain("part.gcode");
		expect(w.text()).not.toContain("readme.txt");
	});

	it("navigates into a subfolder on click and back up again", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [{ name: "Sub", isDirectory: true }]);
		setFiles("0:/gcodes/Sub", [{ name: "deep.gcode", isDirectory: false }]);
		const w = await mountPicker();

		await w.findAllComponents({ name: "VListItem" })
			.find((c) => c.text().includes("Sub"))!.trigger("click");
		await flushPromises();
		expect(w.text()).toContain("deep.gcode");

		// The test-kit's i18n stub echoes the key string rather than the real translation - match on
		// the key, the same workaround used throughout this suite for any $t()-driven title/text.
		const upBtn = w.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.files.up");
		expect(upBtn).toBeTruthy();
		await upBtn!.trigger("click");
		await flushPromises();
		expect(w.text()).toContain("Sub");
		expect(w.text()).not.toContain("deep.gcode");
	});

	it("emits select with the full path and closes when a file is clicked", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [{ name: "part.gcode", isDirectory: false }]);
		const w = await mountPicker();

		await w.findAllComponents({ name: "VListItem" })
			.find((c) => c.text().includes("part.gcode"))!.trigger("click");
		await flushPromises();

		expect(w.emitted("select")).toEqual([["0:/gcodes/part.gcode"]]);
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("re-roots to the configured folder every time it's reopened, not wherever it was left", async () => {
		setConnected(true);
		setFiles("0:/gcodes", [{ name: "Sub", isDirectory: true }]);
		setFiles("0:/gcodes/Sub", [{ name: "deep.gcode", isDirectory: false }]);
		const w = await mountPicker();
		await w.findAllComponents({ name: "VListItem" })
			.find((c) => c.text().includes("Sub"))!.trigger("click");
		await flushPromises();
		expect(w.text()).toContain("deep.gcode");

		await w.setProps({ modelValue: false });
		await flushPromises();
		await w.setProps({ modelValue: true });
		await flushPromises();
		expect(w.text()).toContain("Sub");
		expect(w.text()).not.toContain("deep.gcode");
	});
});
