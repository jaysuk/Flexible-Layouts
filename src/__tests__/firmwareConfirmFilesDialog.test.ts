import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import FirmwareConfirmFilesDialog from "../widgets/FirmwareConfirmFilesDialog.vue";

// attach: true keeps v-dialog's content in the local DOM tree instead of teleporting to <body> - see
// GcodeFilePickerDialog's own tests for the full explanation of why this is needed here.
function mountDialog(files: Array<string>) {
	return mountInDwc(FirmwareConfirmFilesDialog, { props: { modelValue: true, files, attach: true } });
}

describe("FirmwareConfirmFilesDialog", () => {
	it("starts with every file ticked", async () => {
		const w = mountDialog(["a.bin", "b.bin"]);
		await flushPromises();
		const checkboxes = w.findAllComponents({ name: "VCheckbox" });
		expect(checkboxes).toHaveLength(2);
		for (const cb of checkboxes) {
			expect((cb.find("input").element as HTMLInputElement).checked).toBe(true);
		}
	});

	it("emits confirm with only the still-ticked files after one is unticked", async () => {
		const w = mountDialog(["a.bin", "b.bin"]);
		await flushPromises();
		const bCheckbox = w.findAllComponents({ name: "VCheckbox" }).find((c) => c.props("value") === "b.bin")!;
		await bCheckbox.find("input").setValue(false);
		await flushPromises();

		const continueBtn = w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.continue");
		await continueBtn!.trigger("click");

		expect(w.emitted("confirm")).toEqual([[["a.bin"]]]);
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("cancel closes without emitting confirm", async () => {
		const w = mountDialog(["a.bin"]);
		await flushPromises();
		const cancelBtn = w.findAll("button").find((b) => b.text() === "generic.cancel");
		await cancelBtn!.trigger("click");
		expect(w.emitted("confirm")).toBeUndefined();
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("disables Continue and shows a warning when everything is unticked", async () => {
		const w = mountDialog(["a.bin"]);
		await flushPromises();
		const checkbox = w.findComponent({ name: "VCheckbox" });
		await checkbox.find("input").setValue(false);
		await flushPromises();

		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.confirmFilesNone");
		const continueBtn = w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.continue");
		expect(continueBtn!.attributes("disabled")).not.toBeUndefined();
	});

	it("re-seeds all-ticked when the files prop changes (a new confirmation round)", async () => {
		const w = mountDialog(["a.bin"]);
		await flushPromises();
		await w.findComponent({ name: "VCheckbox" }).find("input").setValue(false);
		await flushPromises();

		await w.setProps({ files: ["c.bin", "d.bin"] });
		await flushPromises();
		const checkboxes = w.findAllComponents({ name: "VCheckbox" });
		expect(checkboxes).toHaveLength(2);
		for (const cb of checkboxes) {
			expect((cb.find("input").element as HTMLInputElement).checked).toBe(true);
		}
	});
});
