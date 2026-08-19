import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../model/document";
import WidgetView from "../widgets/WidgetView.vue";

// Each test file gets its own module registry from Vitest, so duet3dSource's module-level release/
// asset cache never leaks BETWEEN files - only unstubbing the fetch mock itself is needed here.
afterEach(() => { vi.unstubAllGlobals(); });

function mountFirmware() {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget("firmwareUpdate") } });
}

describe("FirmwareUpdateWidget - mixed rig (gloomyandy mainboard + genuine Duet3D CAN board)", () => {
	it("finds the Duet3D expansion board's file when the duet3d source is selected, even though the gloomyandy mainboard doesn't match anything in that release", async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (typeof url === "string" && url.includes("api.github.com/repos/Duet3D/RepRapFirmware/releases")) {
				return {
					ok: true, status: 200,
					json: async () => [{
						tag_name: "3.7.0", published_at: "2026-01-01T00:00:00Z", prerelease: false, html_url: "https://x/3.7.0", draft: false,
						assets: [
							{ name: "Duet3Firmware_EXP3HC.bin", browser_download_url: "https://dl/EXP3HC.bin", size: 100 },
							{ name: "DuetWebControl-SD.zip", browser_download_url: "https://dl/dwc.zip", size: 50 },
						],
					}],
				};
			}
			return { ok: true, status: 200, json: async () => [] };
		});
		vi.stubGlobal("fetch", fetchMock);

		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [
					// Main board: gloomyandy-firmware (STM32) - would never match anything in a real
					// Duet3D release, which is exactly why this previously failed.
					{ canAddress: 0, name: "BTT SKR", shortName: "SKR", firmwareVersion: "3.6.3", firmwareFileName: "firmware_kraken_h723.bin", firmwareName: "RepRapFirmware for STM32H723" },
					// Expansion board: genuine Duet3 EXP3HC on the CAN bus.
					{ canAddress: 10, name: "Duet3 EXP3HC", shortName: "EXP3HC", firmwareVersion: "3.7.0", firmwareFileName: "Duet3Firmware_EXP3HC.bin", firmwareName: "RepRapFirmware for Duet 3 EXP3HC" },
				],
				sbc: null,
			},
		}));
		const w = mountFirmware();
		await flushPromises();

		// Switch source to duet3d (the expansion board's own family) via the select's update handler.
		const select = w.findComponent({ name: "VSelect" });
		await select.vm.$emit("update:modelValue", "duet3d");
		await flushPromises();

		// Auto-loaded on source switch (fix #2) - no need to touch the beta checkbox first.
		expect(w.text()).toContain("3.7.0");

		const selectBtn = w.findAll("button").find((b) => b.text() === "plugins.flexibleLayouts.firmwareUpdate.select");
		expect(selectBtn).toBeTruthy();
		await selectBtn!.trigger("click");
		await flushPromises();

		// The expansion board's file was found even though the main board never matches this release.
		// (The i18n stub echoes the key rather than interpolating {name}, so assert on the real href
		// instead of the rendered text - the download link is the one place the actual filename shows
		// up unmangled.)
		const downloadLink = w.findAll("a").find((a) => a.attributes("href") === "https://dl/EXP3HC.bin");
		expect(downloadLink).toBeTruthy();
		expect(w.text()).not.toContain("plugins.flexibleLayouts.firmwareUpdate.notFound");
	}, 15000);
});
