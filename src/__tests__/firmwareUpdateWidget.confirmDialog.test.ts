import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../model/document";
import FirmwareConfirmFilesDialog from "../widgets/FirmwareConfirmFilesDialog.vue";
import WidgetView from "../widgets/WidgetView.vue";

afterEach(() => { vi.unstubAllGlobals(); });

function mountFirmware() {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget("firmwareUpdate") } });
}

describe("FirmwareUpdateWidget - confirm-before-send, with per-file deselection", () => {
	it("opens the confirm dialog with every matched file, and only fetches whichever subset it's confirmed with", async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (typeof url === "string" && url.includes("/contents/releases?")) {
				return { ok: true, status: 200, json: async () => [{ name: "3.6.3", path: "releases/3.6.3", type: "dir", download_url: null, size: 0 }] };
			}
			if (typeof url === "string" && url.includes("/contents/releases/3.6.3?")) {
				return {
					ok: true, status: 200,
					json: async () => [
						{ name: "firmware_kraken_h723.bin", path: "releases/3.6.3/firmware_kraken_h723.bin", type: "file", download_url: "https://raw/kraken.bin", size: 700000 },
						{ name: "Duet3Firmware_SB2040MAX3.uf2", path: "releases/3.6.3/Duet3Firmware_SB2040MAX3.uf2", type: "file", download_url: "https://raw/sb2040.uf2", size: 5000 },
					],
				};
			}
			// The actual firmware bytes, fetched by downloadAndUpload() once confirmed - the controller
			// itself is stubbed by the test kit, so this just needs to resolve to something blob-able.
			return { ok: true, status: 200, blob: async () => new Blob() };
		});
		vi.stubGlobal("fetch", fetchMock);

		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [
					{ canAddress: 0, name: "BTT SKR", shortName: "SKR", firmwareVersion: "3.6.3", firmwareFileName: "firmware_kraken_h723.bin", firmwareName: "RepRapFirmware for STM32H723" },
					{ canAddress: 121, name: "SB2040", shortName: "SB2040", firmwareVersion: "3.6.3", firmwareFileName: "Duet3Firmware_SB2040MAX3.uf2", firmwareName: "RepRapFirmware for STM32F401" },
				],
				sbc: null,
			},
		}));
		const w = mountFirmware();
		await flushPromises();

		const listBtn = w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.list");
		await listBtn!.trigger("click");
		await flushPromises();

		const selectBtn = w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.select");
		expect(selectBtn).toBeTruthy();
		await selectBtn!.trigger("click");
		await flushPromises();
		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.foundFiles");

		const fetchAndPrepareBtn = w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.fetchAndPrepare");
		expect(fetchAndPrepareBtn).toBeTruthy();
		await fetchAndPrepareBtn!.trigger("click");
		await flushPromises();

		// The confirm dialog opened with both matched files offered (checkbox-level ticking behaviour
		// is covered directly in firmwareConfirmFilesDialog.test.ts, with attach:true so its teleported
		// content is actually visible to Vue Test Utils - simulate the "user unticked SB2040" outcome
		// here by interacting with the child component instance directly instead).
		const dialog = w.findComponent(FirmwareConfirmFilesDialog);
		expect(dialog.exists()).toBe(true);
		expect(dialog.props("modelValue")).toBe(true);
		expect(dialog.props("files")).toEqual(["firmware_kraken_h723.bin", "Duet3Firmware_SB2040MAX3.uf2"]);

		const callsBefore = fetchMock.mock.calls.length;
		dialog.vm.$emit("confirm", ["firmware_kraken_h723.bin"]); // SB2040 deselected
		await flushPromises();

		const fetchedUrls = fetchMock.mock.calls.slice(callsBefore).map((c) => c[0]);
		expect(fetchedUrls).toContain("https://raw/kraken.bin");
		expect(fetchedUrls).not.toContain("https://raw/sb2040.uf2");
	}, 15000);
});
