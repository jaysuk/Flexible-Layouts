import { enableAutoUnmount, flushPromises } from "@vue/test-utils";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UnattendedBackupDialog from "../src/configBackup/UnattendedBackupDialog.vue";
import CloudPanel from "../src/configBackup/CloudPanel.vue";

// CloudPanel asks whether the standalone plugin is loaded; the kit's `@/plugins` stub lacks isPluginLoaded (see
// configBackup.smoke.test.ts).
vi.mock("@/plugins", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	isPluginLoaded: () => false,
}));

enableAutoUnmount(afterEach);

async function open() {
	const w = mountInDwc(UnattendedBackupDialog, { props: { modelValue: false, attach: true } });
	await w.setProps({ modelValue: true });
	await flushPromises();
	return w;
}
const val = (w: Awaited<ReturnType<typeof open>>, sel: string) => (w.find(sel).element as HTMLInputElement).value;

describe("UnattendedBackupDialog", () => {
	beforeEach(() => {
		setModel(loadObjectModel());
	});

	it("warns up front about what the script does not do", async () => {
		const w = await open();
		const text = w.find(".unattended-warning").text();
		expect(text).toContain("unattended.warnPrivate");
		expect(text).toContain("unattended.warnNoRedaction");
		expect(text).toContain("unattended.warnPassword");
		expect(text).toContain("unattended.warnRestore");
	});

	it("starts from sensible defaults and offers the download and the schedules", async () => {
		const w = await open();
		expect(val(w, ".ub-keep input")).toBe("14");
		expect(val(w, ".ub-env input")).toBe("DUET_PASSWORD");
		expect(val(w, ".ub-outdir input")).toBe("./duet-backups");
		expect(w.find(".ub-download").exists()).toBe(true);
		expect(w.find(".ub-snippet").text()).toContain("0 3 * * *"); // cron by default
		expect(w.find(".ub-problem").exists()).toBe(false);
	});

	it("0:/sys is a required folder (locked on); the others can be switched off", async () => {
		const w = await open();
		const folders = w.findAll(".ub-folder");
		expect(folders).toHaveLength(3);
		expect(folders[0].find("input").attributes("disabled")).toBeDefined();
		expect(folders[1].find("input").attributes("disabled")).toBeUndefined();
		expect(folders[0].text()).toContain("0:/sys");
	});

	it("takes the board type from the machine's object model", async () => {
		setModel({ ...(loadObjectModel() as Record<string, unknown>), state: { ...((loadObjectModel() as { state: object }).state), dsfVersion: "3.5.1" } });
		const w = await open();
		expect((w.vm as unknown as { flavour: string }).flavour).toBe("sbc");
	});

	it("a standalone board is the default when no SBC is reported", async () => {
		const w = await open();
		expect((w.vm as unknown as { flavour: string }).flavour).toBe("standalone");
	});

	it("shows why, and hides the download, when the options are unusable", async () => {
		const w = await open();
		(w.vm as unknown as { host: string }).host = "not a host";
		await flushPromises();
		expect(w.find(".ub-problem").exists()).toBe(true);
		expect(w.find(".ub-problem").text()).toContain("not a host");
		expect(w.find(".ub-download").exists()).toBe(false);
		(w.vm as unknown as { host: string }).host = "duet3.local";
		await flushPromises();
		expect(w.find(".ub-problem").exists()).toBe(false);
		expect(w.find(".ub-download").exists()).toBe(true);
	});

	it("the generated script follows the form", async () => {
		const w = await open();
		const vm = w.vm as unknown as { host: string; keep: number; passwordEnv: string; script: string; tab: string };
		vm.host = "printer.lan:8080";
		vm.keep = 5;
		vm.passwordEnv = "PW";
		await flushPromises();
		expect(vm.script).toContain('"host": "printer.lan:8080"');
		expect(vm.script).toContain('"keep": 5');
		expect(vm.script).toContain('"passwordEnv": "PW"');
		expect(vm.script).not.toMatch(/your-board-password/); // the snippets mention it, the script never does
	});

	it("switches between the cron, Windows and systemd snippets", async () => {
		const w = await open();
		const vm = w.vm as unknown as { tab: string };
		vm.tab = "windows";
		await flushPromises();
		expect(w.find(".ub-snippet").text()).toContain("schtasks /Create");
		vm.tab = "systemd";
		await flushPromises();
		expect(w.find(".ub-snippet").text()).toContain("OnCalendar");
		expect(w.find(".ub-snippet").text()).toContain("ExecStart");
	});

	it("Download saves the script under its fixed name", async () => {
		const w = await open();
		let blobText = "";
		const created: string[] = [];
		vi.stubGlobal("URL", Object.assign(URL, {
			createObjectURL: (b: Blob) => { void b.text().then((t) => { blobText = t; }); created.push("blob:x"); return "blob:x"; },
			revokeObjectURL: () => {},
		}));
		const clicked: Array<{ download: string; href: string }> = [];
		const orig = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push({ download: this.download, href: this.href }); };
		try {
			await w.find(".ub-download").trigger("click");
			await flushPromises();
		} finally {
			HTMLAnchorElement.prototype.click = orig;
			vi.unstubAllGlobals();
		}
		expect(clicked).toHaveLength(1);
		expect(clicked[0].download).toBe("duet-backup.mjs");
		expect(created).toHaveLength(1);
		expect(blobText).toContain("#!/usr/bin/env node");
	});

	it("Copy puts the script on the clipboard", async () => {
		const written: string[] = [];
		vi.stubGlobal("isSecureContext", true);
		Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { written.push(t); } }, configurable: true });
		const w = await open();
		try {
			await w.find(".ub-copy-script").trigger("click");
			await flushPromises();
			expect(written).toHaveLength(1);
			expect(written[0]).toContain("#!/usr/bin/env node");
			expect(w.find(".ub-copied").exists()).toBe(true);
			await w.find(".ub-copy-snippet").trigger("click");
			await flushPromises();
			expect(written[1]).toContain("0 3 * * *");
		} finally {
			delete (navigator as unknown as Record<string, unknown>).clipboard;
			vi.unstubAllGlobals();
		}
	});
});

describe("CloudPanel entry point", () => {
	it("offers the unattended setup and opens the dialog lazily", async () => {
		const w = mountInDwc(CloudPanel);
		await flushPromises();
		expect(w.find(".unattended-card").exists()).toBe(true);
		expect(w.findComponent(UnattendedBackupDialog).exists()).toBe(false); // not built until wanted
		await w.find(".unattended-open").trigger("click");
		await flushPromises();
		expect(w.findComponent(UnattendedBackupDialog).exists()).toBe(true);
	});
});
