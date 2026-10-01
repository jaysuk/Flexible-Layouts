import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { loadObjectModel, mountInDwc, setConnected, setModel } from "dwc-plugin-test-kit";
import { scanImpact } from "dwc-gcode-core";

import { useSettingsStore } from "@/stores/settings";

import FirmwareChangesCard from "../../src/firmwareChanges/FirmwareChangesCard.vue";
import FirmwareChangesDialog from "../../src/firmwareChanges/FirmwareChangesDialog.vue";
import { firmwareChangeReport, rememberReportFiles } from "../../src/model/firmware/changeCheck";
import { writeFirmwareChangeState } from "../../src/model/firmware/changeState";
import { axeViolations } from "./axe";

/** The firmware-change report and its Settings card, audited like the widgets in a11y.test.ts (no allowlist: they start clean). */
beforeEach(() => {
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	setConnected(true);
	setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: "3.7.0-rc.2" }], state: { status: "idle" } });
});

async function audit(html: string, mustContain: string): Promise<string[]> {
	const host = document.createElement("div");
	host.innerHTML = html;
	document.body.appendChild(host);
	try {
		// Guard against a vacuous pass: the component's own content must be in the markup.
		expect(host.innerHTML, "component did not render").toContain(mustContain);
		return await axeViolations(host);
	} finally {
		host.remove();
	}
}

describe("axe: firmware changes", () => {
	it("the report dialog, with a problem that has no edit and one that is ignored", async () => {
		const files = [{ path: "0:/sys/config.g", text: "M408 S0\nG1 X1\n" }];
		const report = rememberReportFiles(scanImpact(files, "3.6.3", "3.7.0-rc.2", { acknowledged: ["m955-p-uncapped"] }), files);
		const w = mountInDwc(FirmwareChangesDialog, { props: { modelValue: false, attach: true, report } });
		await w.setProps({ modelValue: true });
		await flushPromises();
		expect(await audit(w.html(), "0:/sys/config.g")).toEqual([]);
		w.unmount();
	});

	it("the report dialog, with nothing found", async () => {
		const report = scanImpact([{ path: "0:/sys/config.g", text: "G1 X1\n" }], "3.6.3", "3.7.0-rc.2");
		const w = mountInDwc(FirmwareChangesDialog, { props: { modelValue: false, attach: true, report } });
		await w.setProps({ modelValue: true });
		await flushPromises();
		expect(await audit(w.html(), "firmwareChanges.verdictClear")).toEqual([]);
		w.unmount();
	});

	it("the report dialog, with suggested edits, a choice and a worth-a-look list", async () => {
		const files = [{ path: "0:/sys/config.g", text: "M955 C0\nM140 P0 H0\nM563 P0 D0 H0\nM575 P1 B57600 S1\n" }];
		const report = rememberReportFiles(scanImpact(files, "3.6.3", "3.7.0-rc.2"), files);
		const w = mountInDwc(FirmwareChangesDialog, { props: { modelValue: false, attach: true, report } });
		await w.setProps({ modelValue: true });
		await flushPromises();
		expect(await audit(w.html(), "fw-diff")).toEqual([]);
		w.unmount();
	});

	it("the settings card, with a change waiting for review", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		firmwareChangeReport.value = null;
		const w = mountInDwc(FirmwareChangesCard, { props: { attach: true } });
		await flushPromises();
		expect(await audit(w.html(), "firmwareChanges.pending")).toEqual([]);
		w.unmount();
	});
});
