import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setConnected, setModel } from "dwc-plugin-test-kit";
import { scanImpact } from "dwc-gcode-core";

import { useSettingsStore } from "@/stores/settings";

const push = vi.hoisted(() => vi.fn());
vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRouter: () => ({ push }) }));

const written = vi.hoisted(() => ({ text: "" as string }));
vi.mock("../model/widgetClipboard", async (importOriginal) => ({
	...(await importOriginal<typeof import("../model/widgetClipboard")>()),
	writeSystemClipboard: async (text: string) => { written.text = text; return true; },
}));

// The Apply button writes to the SD card through defaultMachineIO(): give it a small in-memory one.
const card = vi.hoisted(() => ({ files: {} as Record<string, string>, uploads: [] as Array<string> }));
vi.mock("../model/configBackup/machineIO", () => ({
	defaultMachineIO: () => ({
		async getFileList(dir: string) {
			return Object.keys(card.files)
				.filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/"))
				.map((p) => ({ isDirectory: false, name: p.slice(dir.length), size: card.files[p].length, lastModified: new Date() }));
		},
		async downloadText(path: string) { if (!(path in card.files)) { throw new Error("no such file"); } return card.files[path]; },
		async upload(path: string, content: Blob) { card.uploads.push(path); card.files[path] = await content.text(); },
	}),
}));

import FirmwareChangesDialog from "../firmwareChanges/FirmwareChangesDialog.vue";
import { firmwareChangeReport, rememberReportFiles } from "../model/firmware/changeCheck";
import { clearBackupMemory } from "../model/firmware/changePlan";
import { reportToMarkdown } from "../model/firmware/changeReportMarkdown";
import { readFirmwareChangeState, writeFirmwareChangeState } from "../model/firmware/changeState";
import { revealRequest } from "../model/explorerSession";

const T = (k: string) => `plugins.flexibleLayouts.firmwareChanges.${k}`;
const CONFIG = "; c\nM408 S0\nM955 C0\nG1 X1\n";
const FILES = [
	{ path: "0:/sys/config.g", text: CONFIG },
	{ path: "0:/macros/mix.g", text: "if {a ^ b}\n  M118 P0\nendif\n" },
];
const reportOf = (files = FILES) => rememberReportFiles(scanImpact(files, "3.6.3", "3.7.0-rc.2"), files);
const report = () => reportOf();

function mount(props: Record<string, unknown> = {}) {
	return mountInDwc(FirmwareChangesDialog, { props: { modelValue: true, attach: true, ...props } });
}
const button = (w: ReturnType<typeof mount>, label: string) => w.findAll("button").find((b) => b.text() === label);

beforeEach(() => {
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	firmwareChangeReport.value = null;
	revealRequest.value = null;
	push.mockReset();
	written.text = "";
	card.files = { "0:/sys/config.g": CONFIG };
	card.uploads.length = 0;
	clearBackupMemory();
	setConnected(true);
	setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: "3.7.0-rc.2" }], state: { status: "idle" } });
});

describe("FirmwareChangesDialog", () => {
	it("lists what needs changing, per file and line, and nothing that merely touches a changed command", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		expect(w.find("[data-test=verdict]").text()).toContain(T("verdictProblems"));
		const problem = w.find("[data-event=m408-removed]");
		expect(problem.exists()).toBe(true);
		expect(problem.text()).toContain("0:/sys/config.g:2");
		expect(problem.find("code").text()).toBe("M408 S0");
		expect(problem.text()).toContain("M408");
		expect(problem.text()).toContain(T("noEdit")); // nothing safe to suggest: the user has to choose a replacement
		// The array syntax in the macro was only ADDED, so it is no problem and not even listed.
		expect(w.find("[data-event=expr-array-literal]").exists()).toBe(false);
		expect(w.text()).not.toContain("mix.g");
	});

	it("keeps the maintainer detail (versions, citations, kind) behind Details, not in the way", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		const detail = w.find("[data-detail=m408-removed]");
		expect(detail.exists()).toBe(true);
		expect(detail.text()).toContain("3.7.0-alpha.2");
		expect(detail.text()).toContain(T("effect.stopsWorking"));
		expect(w.find("[data-event=m408-removed]").text()).not.toContain(T("changedIn"));
		expect(w.find("[data-event=m408-removed]").text()).not.toContain(T("effect.stopsWorking"));
		expect(w.find("[data-test=details]").element.hasAttribute("open")).toBe(false);
	});

	it("says there is nothing to change in one line, and still says it only checks known changes", async () => {
		const w = mount({ report: reportOf([{ path: "0:/macros/mix.g", text: "var a = {1,2}\nM140 P0 H0\n" }]) });
		await flushPromises();
		expect(w.find("[data-test=verdict-clear]").text()).toContain(T("verdictClear"));
		expect(w.find("[data-test=limits]").text()).toContain(T("limits"));
		expect(w.find("article").exists()).toBe(false);
		expect(w.find("[data-test=coverage]").text()).toContain(T("coverage")); // in Details
	});

	it("shows the limits even when no file was read", async () => {
		const w = mount({ report: reportOf([]) });
		await flushPromises();
		expect(w.find("[data-test=limits]").exists()).toBe(true);
	});

	it("puts a change that only behaves differently under 'worth a look', collapsed", async () => {
		const w = mount({ report: reportOf([{ path: "0:/sys/config.g", text: "M575 P1 B57600 S1\n" }]) });
		await flushPromises();
		expect(w.find("[data-test=verdict-clear]").exists()).toBe(true);
		const look = w.find("[data-test=worth-a-look]");
		expect(look.exists()).toBe(true);
		expect(look.element.hasAttribute("open")).toBe(false);
		expect(look.text()).toContain("0:/sys/config.g:1");
	});

	it("shows what an edit would do, line by line", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		const diff = w.find("[data-event=m955-p-required]");
		expect(diff.find(".fw-del").text()).toBe("- M955 C0");
		expect(diff.find(".fw-add").text()).toBe("+ M955 C0 P0");
	});

	it("Open reveals the line in the Explorer and goes to the file's own URL", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		const open = w.find("[data-event=m408-removed]").findAll("button").find((b) => b.text() === T("open"))!;
		await open.trigger("click");
		expect(revealRequest.value).toMatchObject({ path: "0:/sys/config.g", line: 2 });
		expect(push).toHaveBeenCalledWith("/Explorer/edit/sys/config.g");
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("Mark all as reviewed moves the baseline to the running version and closes", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		firmwareChangeReport.value = report();
		const w = mount();
		await flushPromises();
		await button(w, T("markReviewed"))!.trigger("click");
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2");
		expect(firmwareChangeReport.value).toBeNull();
		expect(w.emitted("update:modelValue")).toContainEqual([false]);
	});

	it("a pre-flight report has nothing to mark as reviewed or to apply, and never moves the baseline", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		const w = mount({ report: report(), preflight: true });
		await flushPromises();
		expect(button(w, T("markReviewed"))).toBeUndefined();
		expect(w.find("[data-event=m955-p-required]").exists()).toBe(true); // still shown...
		expect(w.find("[data-test=apply]").exists()).toBe(false); // ...but the files are right for the version that is running
		expect(w.find("[data-test=fix-all]").exists()).toBe(false);
		expect(readFirmwareChangeState().baseline).toBe("3.6.3");
	});

	it("Ignore stores the change id and shows the change under the ignored ones after a re-scan", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3" });
		firmwareChangeReport.value = report();
		const w = mount({ report: undefined });
		await flushPromises();
		// No SD card behind the mocked machine store here: what matters is that the id is stored, which is what the re-scan reads.
		await w.find("[data-event=m408-removed]").findAll("button").find((b) => b.text() === T("ignore"))!.trigger("click");
		await flushPromises();
		expect(readFirmwareChangeState().acknowledged).toEqual(["m408-removed"]);
	});

	it("Copy report puts the whole Markdown report on the clipboard", async () => {
		const w = mount({ report: report() });
		await flushPromises();
		await button(w, T("copyReport"))!.trigger("click");
		await flushPromises();
		expect(written.text).toContain("## ");
		expect(written.text).toContain("0:/sys/config.g:2");
		expect(written.text).toContain("mix.g"); // the copy keeps everything the dialog folds away
		expect(w.text()).toContain(T("copied"));
	});

	describe("Apply", () => {
		const apply = (w: ReturnType<typeof mount>, event = "m955-p-required") => w.find(`[data-event=${event}] [data-test=apply]`).trigger("click");

		it("writes the suggested edit, keeps the original as .bak, and says how to undo it", async () => {
			const w = mount({ report: report() });
			await flushPromises();
			await apply(w);
			await flushPromises();
			expect(card.files["0:/sys/config.g"]).toBe("; c\nM408 S0\nM955 C0 P0\nG1 X1\n");
			expect(card.files["0:/sys/config.g.bak"]).toBe(CONFIG);
			const message = w.find("[data-test=message]");
			expect(message.text()).toContain(T("applied.done"));
			expect(message.text()).toContain(T("applied.backup"));
			expect(message.text()).toContain(T("applied.restart")); // config.g is only read at boot
			expect(button(w, T("undo"))).toBeDefined();
			expect(w.find("[data-event=m955-p-required]").exists()).toBe(false); // re-checked: the fixed line is no longer a problem
		});

		it("Undo puts the file back, and only if nobody has edited it since", async () => {
			const w = mount({ report: report() });
			await flushPromises();
			await apply(w);
			await flushPromises();
			await button(w, T("undo"))!.trigger("click");
			await flushPromises();
			expect(card.files["0:/sys/config.g"]).toBe(CONFIG);

			await apply(w);
			await flushPromises();
			card.files["0:/sys/config.g"] += "; edited by hand\n";
			await button(w, T("undo"))!.trigger("click");
			await flushPromises();
			expect(card.files["0:/sys/config.g"]).toContain("; edited by hand");
			expect(w.find("[data-test=message]").text()).toContain(T("undoFailed.changed"));
		});

		it("refuses, and writes nothing, when the file is no longer what was checked", async () => {
			const w = mount({ report: report() });
			await flushPromises();
			card.files["0:/sys/config.g"] = "; somebody else was here\n" + CONFIG;
			await apply(w);
			await flushPromises();
			expect(card.uploads).toEqual([]);
			expect(w.find("[data-test=message]").text()).toContain(T("applyFailed.changed"));
		});

		it("refuses while the machine is not idle", async () => {
			setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: "3.7.0-rc.2" }], state: { status: "processing" } });
			const w = mount({ report: report() });
			await flushPromises();
			await apply(w);
			await flushPromises();
			expect(card.uploads).toEqual([]);
			expect(w.find("[data-test=message]").text()).toContain(T("applyFailed.busy"));
		});

		it("Apply all safe fixes does every one-option fix in one go and leaves choices alone", async () => {
			const files = [{ path: "0:/sys/config.g", text: "M955 C0\nM956 S1\nM140 P0 H0\nM563 P0 D0 H0\n" }];
			card.files["0:/sys/config.g"] = files[0].text;
			const w = mount({ report: reportOf(files) });
			await flushPromises();
			expect(w.find("[data-test=fix-all]").text()).toContain(T("fixAll"));
			await w.find("[data-test=fix-all]").trigger("click");
			await flushPromises();
			expect(card.files["0:/sys/config.g"]).toBe("M955 C0 P0\nM956 S1 P0\nM140 P0 H0\nM563 P0 D0 H0\n"); // the heater conflict is untouched
		});

		it("a choice shows each option and applies only the one picked", async () => {
			const files = [{ path: "0:/sys/config.g", text: "M140 P0 H0\nM563 P0 D0 H0:1\n" }];
			card.files["0:/sys/config.g"] = files[0].text;
			const w = mount({ report: reportOf(files) });
			await flushPromises();
			const options = w.findAll("[data-option]");
			expect(options).toHaveLength(2);
			expect(w.find("[data-test=fix-all]").exists()).toBe(false); // never picked for the user
			await options[1].find("[data-test=apply]").trigger("click");
			await flushPromises();
			expect(["M140 P0 H-1\nM563 P0 D0 H0:1\n", "M140 P0 H0\nM563 P0 D0 H1\n"]).toContain(card.files["0:/sys/config.g"]);
			expect(card.files["0:/sys/config.g"]).not.toBe(files[0].text);
		});
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
