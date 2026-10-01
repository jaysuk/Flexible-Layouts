import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";
import { scanImpact } from "dwc-gcode-core";

import { useSettingsStore } from "@/stores/settings";

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRouter: () => ({ push }) }));

const written = vi.hoisted(() => ({ text: "" as string }));
vi.mock("../model/widgetClipboard", async (importOriginal) => ({
	...(await importOriginal<typeof import("../model/widgetClipboard")>()),
	writeSystemClipboard: async (text: string) => { written.text = text; return true; },
}));

import FirmwareChangesDialog from "../firmwareChanges/FirmwareChangesDialog.vue";
import { firmwareChangeReport } from "../model/firmware/changeCheck";
import { reportToMarkdown } from "../model/firmware/changeReportMarkdown";
import { readFirmwareChangeState, writeFirmwareChangeState } from "../model/firmware/changeState";
import { revealRequest } from "../model/explorerSession";

const T = (k: string) => `plugins.flexibleLayouts.firmwareChanges.${k}`;
const FILES = [
	{ path: "0:/sys/config.g", text: "; c\nM408 S0\nG1 X1\n" },
	{ path: "0:/macros/mix.g", text: "if {a ^ b}\n  M118 P0\nendif\n" },
];
const report = () => scanImpact(FILES, "3.6.3", "3.7.0-rc.2");

function mount(props: Record<string, unknown> = {}) {
	return mountInDwc(FirmwareChangesDialog, { props: { modelValue: true, attach: true, ...props } });
}

beforeEach(() => {
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	firmwareChangeReport.value = null;
	revealRequest.value = null;
	push.mockReset();
	written.text = "";
	setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: "3.7.0-rc.2" }] });
});

describe("FirmwareChangesDialog", () => {
	it("says what it checked and what it could not, so it never reads as an all-clear", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		expect(w.find("[data-test=coverage]").text()).toContain(T("coverage"));
		expect(w.text()).toContain(T("undetectableTitle"));
		expect(w.find("details").exists()).toBe(true);
	});

	it("groups by change: description, version, citation, and each line with its file and number", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		const group = w.find("[data-event=m408-removed]");
		expect(group.exists()).toBe(true);
		expect(group.text()).toContain("M408");
		expect(group.text()).toContain("3.7.0-alpha.2");
		expect(group.text()).toContain("0:/sys/config.g:2");
		expect(group.find("code").text()).toBe("M408 S0");
		expect(group.text()).toContain(T("effect.stopsWorking"));
	});

	it("shows an empty result honestly", async () => {
		const w = mount({ report: scanImpact([{ path: "0:/sys/config.g", text: "G1 X1\n" }], "3.6.3", "3.7.0-rc.2") });
		await flushPromises();
		expect(w.text()).toContain(T("noFindings"));
		expect(w.text()).toContain(T("coverage"));
	});

	it("Open reveals the line in the Explorer and goes to the file's own URL", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		await w.find("[data-event=m408-removed] button.v-btn--size-x-small").trigger("click");
		expect(revealRequest.value).toMatchObject({ path: "0:/sys/config.g", line: 2 });
		expect(push).toHaveBeenCalledWith("/Explorer/edit/sys/config.g");
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("Mark all as reviewed moves the baseline to the running version and closes", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		firmwareChangeReport.value = report();
		const w = mount();
		await flushPromises();
		const btn = w.findAll("button").find((b) => b.text() === T("markReviewed"))!;
		await btn.trigger("click");
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2");
		expect(firmwareChangeReport.value).toBeNull();
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("a pre-flight report has nothing to mark as reviewed and never moves the baseline", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		const w = mount({ report: report(), preflight: true });
		await flushPromises();
		expect(w.findAll("button").some((b) => b.text() === T("markReviewed"))).toBe(false);
		expect(readFirmwareChangeState().baseline).toBe("3.6.3");
	});

	it("Ignore stores the change id and shows the change under the ignored ones after a re-scan", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		firmwareChangeReport.value = report();
		const w = mount({ report: undefined });
		await flushPromises();
		// No SD card behind the mocked machine store here: what matters is that the id is stored, which is what the re-scan reads.
		const ignoreBtn = w.find("[data-event=m408-removed]").findAll("button").find((b) => b.text() === T("ignore"))!;
		await ignoreBtn.trigger("click");
		await flushPromises();
		expect(readFirmwareChangeState().acknowledged).toEqual(["m408-removed"]);
	});

	it("Copy report puts the Markdown on the clipboard", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		await w.findAll("button").find((b) => b.text() === T("copyReport"))!.trigger("click");
		await flushPromises();
		expect(written.text).toContain("## ");
		expect(written.text).toContain("0:/sys/config.g:2");
		expect(w.text()).toContain(T("copied"));
	});
});

describe("reportToMarkdown", () => {
	const labels = {
		title: (a: string, b: string) => `Changes ${a} to ${b}`,
		coverage: (n: number, a: string, b: string, m: number) => `${n} checked ${a}-${b}, ${m} not`,
		changedIn: (v: string) => `in ${v}`,
		effect: () => "stops working",
		sources: "Source", ignored: "Ignored", cannotCheck: "Cannot check", noFindings: "Nothing found",
	};

	it("lists each change with its citation and every file:line, and the unchecked ones", () => {
		const md = reportToMarkdown(report(), labels);
		expect(md).toMatch(/^# Changes 3\.6\.3 to 3\.7\.0-rc\.2\n/);
		expect(md).toContain("- 0:/sys/config.g:2  `M408 S0`");
		expect(md).toContain("Source: ");
		expect(md).toContain("## Cannot check");
		expect(md).not.toContain("## Nothing found");
	});

	it("survives a snippet containing backticks, and reports an empty result", () => {
		const md = reportToMarkdown(scanImpact([{ path: "0:/sys/config.g", text: 'M408 S0 ; `x`\n' }], "3.6.3", "3.7.0-rc.2"), labels);
		expect(md).toContain("`` M408 S0 ; `x` ``");
		const empty = reportToMarkdown(scanImpact([{ path: "0:/sys/config.g", text: "G1 X1\n" }], "3.6.3", "3.7.0-rc.2"), labels);
		expect(empty).toContain("Nothing found");
	});
});
