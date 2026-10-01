import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { useSettingsStore } from "@/stores/settings";

// The pre-flight reads the user's files through defaultMachineIO(): an in-memory SD card here.
const card = vi.hoisted(() => ({ files: {} as Record<string, string> }));
vi.mock("../model/configBackup/machineIO", () => ({
	defaultMachineIO: () => ({
		async getFileList(dir: string) {
			return Object.keys(card.files)
				.filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/"))
				.map((p) => ({ isDirectory: false, name: p.slice(dir.length), size: card.files[p].length, lastModified: new Date("2026-01-01") }));
		},
		async downloadText(path: string) { return card.files[path]; },
	}),
}));

import { createDefaultWidget } from "../model/document";
import { clearScanCache } from "../model/firmware/changeScan";
import { readFirmwareChangeState } from "../model/firmware/changeState";
import { currentImpactRange, preflightTarget } from "../model/firmware/impactRange";
import FirmwareConfirmFilesDialog from "../widgets/FirmwareConfirmFilesDialog.vue";
import WidgetView from "../widgets/WidgetView.vue";

const T = (k: string) => `plugins.flexibleLayouts.firmwareChanges.preflight.${k}`;

function stubReleases(tag: string): void {
	vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
		if (url.includes("/contents/releases?")) {
			return { ok: true, status: 200, json: async () => [{ name: tag, path: `releases/${tag}`, type: "dir", download_url: null, size: 0 }] };
		}
		if (url.includes(`/contents/releases/${tag}?`)) {
			return { ok: true, status: 200, json: async () => [{ name: "firmware_kraken_h723.bin", path: `releases/${tag}/f.bin`, type: "file", download_url: "https://raw/f.bin", size: 7 }] };
		}
		return { ok: true, status: 200, blob: async () => new Blob() };
	}));
}

function machine(status = "idle"): void {
	setModel(loadObjectModel(undefined, {
		overrides: {
			boards: [{ canAddress: 0, name: "BTT SKR", shortName: "SKR", firmwareVersion: "3.6.3", firmwareFileName: "firmware_kraken_h723.bin", firmwareName: "RepRapFirmware for STM32H723" }],
			sbc: null,
			state: { status },
		},
	}));
}

async function pickRelease(sourceId?: "gloomyandy37") {
	const w = mountInDwc(WidgetView, { props: { widget: { ...createDefaultWidget("firmwareUpdate"), ...(sourceId ? { sourceId } : {}) } as never } });
	await flushPromises();
	await w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.list")!.trigger("click");
	await flushPromises();
	await w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.select")!.trigger("click");
	await flushPromises();
	await flushPromises();
	return w;
}

beforeEach(() => {
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	clearScanCache();
	preflightTarget.value = null;
	card.files = { "0:/sys/config.g": "M408 S0\nG1 X1\n", "0:/macros/warm": "M140 S60\n" };
	machine();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("FirmwareUpdateWidget - pre-flight against your own files", () => {
	it("tells you how many lines use something that changes in the selected release, and never touches the baseline", async () => {
		stubReleases("3.7.0");
		const w = await pickRelease();
		const box = w.find("[data-test=preflight]");
		expect(box.exists()).toBe(true);
		expect(box.text()).toContain(T("found"));
		expect(box.text()).toContain(T("coverage"));
		expect(box.text()).toContain(T("review"));
		expect(readFirmwareChangeState().baseline).toBeNull();
		expect(readFirmwareChangeState().notifiedKey).toBeUndefined();
	});

	it("points the editor's squiggles at the same range while a release is selected, and lets go on unmount", async () => {
		stubReleases("3.7.0");
		const w = await pickRelease();
		expect(currentImpactRange()).toEqual({ from: "3.6.3", to: "3.7.0" });
		w.unmount();
		expect(currentImpactRange()).toBeNull();
	});

	it("puts a warning in the confirm step, and only when something was found", async () => {
		stubReleases("3.7.0");
		const w = await pickRelease();
		await w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.fetchAndPrepare")!.trigger("click");
		await flushPromises();
		expect(w.findComponent(FirmwareConfirmFilesDialog).props("notice")).toContain(T("found"));
	});

	it("says none found (and that only known changes are checked) when the files use nothing that changed", async () => {
		card.files = { "0:/sys/config.g": "G1 X1\n" };
		stubReleases("3.7.0");
		const w = await pickRelease();
		const box = w.find("[data-test=preflight]");
		expect(box.text()).toContain(T("none"));
		expect(box.text()).not.toContain(T("review"));
	});

	it("says it cannot check a release whose tag is not a version, rather than guessing", async () => {
		stubReleases("nightly");
		// The releases of one source are cached for the page, so a tag list of its own needs a source of its own.
		const w = await pickRelease("gloomyandy37");
		expect(w.find("[data-test=preflight]").text()).toContain(T("cannotCheck"));
		expect(currentImpactRange()).toBeNull();
	});

	it("says it is unavailable while the machine is busy, instead of reading the card mid-job", async () => {
		machine("processing");
		stubReleases("3.7.0");
		const w = mountInDwc(WidgetView, { props: { widget: createDefaultWidget("firmwareUpdate") } });
		await flushPromises();
		// A busy machine hides the release list altogether (existing rule), so there is nothing to select and nothing scanned.
		expect(w.find("[data-test=preflight]").exists()).toBe(false);
	});
});
