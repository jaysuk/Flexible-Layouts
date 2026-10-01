import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { loadObjectModel, mountInDwc, setConnected, setModel } from "dwc-plugin-test-kit";
import { scanImpact } from "dwc-gcode-core";

import { useSettingsStore } from "@/stores/settings";

import FirmwareChangesCard from "../firmwareChanges/FirmwareChangesCard.vue";
import FirmwareChangesDialog from "../firmwareChanges/FirmwareChangesDialog.vue";
import { firmwareChangeReport, reportOpenRequested } from "../model/firmware/changeCheck";
import { readFirmwareChangeState, writeFirmwareChangeState } from "../model/firmware/changeState";

const T = (k: string) => `plugins.flexibleLayouts.firmwareChanges.${k}`;

function machine(version: string): void {
	setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: version }], state: { status: "idle" } });
}
function mount() {
	return mountInDwc(FirmwareChangesCard, { props: { attach: true } });
}

beforeEach(() => {
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	firmwareChangeReport.value = null;
	reportOpenRequested.value = false;
	setConnected(true);
	machine("3.7.0-rc.2");
});

describe("FirmwareChangesCard", () => {
	it("explains there is nothing to compare with before the first connect has recorded a version", async () => {
		const w = mount();
		await flushPromises();
		expect(w.text()).toContain(T("noBaseline"));
		expect(w.find("[data-test=pending]").exists()).toBe(false);
	});

	it("shows the version the files were last reviewed against", async () => {
		writeFirmwareChangeState({ baseline: "3.7.0-rc.2" });
		const w = mount();
		await flushPromises();
		expect(w.text()).toContain(T("reviewedAgainst"));
		expect(w.find("[data-test=pending]").exists()).toBe(false);
	});

	it("offers the report for a firmware change nobody has reviewed", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3", lastScan: { from: "3.6.3", to: "3.7.0-rc.2", at: "x", occurrences: 4, files: 2, events: 2 } });
		firmwareChangeReport.value = scanImpact([{ path: "0:/sys/config.g", text: "M408\n" }], "3.6.3", "3.7.0-rc.2");
		const w = mount();
		await flushPromises();
		const pending = w.find("[data-test=pending]");
		expect(pending.exists()).toBe(true);
		expect(pending.text()).toContain(T("pending"));
		expect(pending.text()).toContain(T("lastScan"));
		await pending.find("button").trigger("click");
		await flushPromises();
		expect(w.findComponent(FirmwareChangesDialog).props("modelValue")).toBe(true);
	});

	it("the two switches write the machine-shared state, and the editor one needs the feature on", async () => {
		const w = mount();
		await flushPromises();
		const switches = w.findAllComponents({ name: "VSwitch" });
		expect(switches).toHaveLength(2);
		await switches[0].find("input").setValue(false);
		expect(readFirmwareChangeState().enabled).toBe(false);
		await flushPromises();
		expect(w.findAllComponents({ name: "VSwitch" })[1].props("disabled")).toBe(true);
		await switches[0].find("input").setValue(true);
		await switches[1].find("input").setValue(false);
		expect(readFirmwareChangeState()).toMatchObject({ enabled: true, editorWarnings: false });
	});

	it("only accepts a version it can read for the manual check, and needs a connection", async () => {
		const w = mount();
		await flushPromises();
		const input = w.find("input[type=text]");
		await input.setValue("rc2");
		expect(w.text()).toContain(T("manualInvalid"));
		const check = w.findAll("button").find((b) => b.text() === T("manualCheck"))!;
		expect(check.attributes("disabled")).toBeDefined();
		await input.setValue("3.6.3");
		expect(w.text()).not.toContain(T("manualInvalid"));
		expect(check.attributes("disabled")).toBeUndefined();
		setConnected(false);
		await flushPromises();
		expect(w.text()).toContain(T("needConnection"));
		expect(w.findAll("button").find((b) => b.text() === T("manualCheck"))!.attributes("disabled")).toBeDefined();
	});

	it("opens the report when the toast asked for it (and only once)", async () => {
		reportOpenRequested.value = true;
		const w = mount();
		await flushPromises();
		expect(w.findComponent(FirmwareChangesDialog).props("modelValue")).toBe(true);
		expect(reportOpenRequested.value).toBe(false);
	});
});
