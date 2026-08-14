import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../model/document";
import WidgetView from "../widgets/WidgetView.vue";

function mountFirmware() {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget("firmwareUpdate") } });
}

describe("FirmwareUpdateWidget - SBC-mode gating (genuine Duet mainboard only)", () => {
	it("blocks the normal browse/upload flow and offers M997 S2 for a genuine Duet mainboard in SBC mode", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [{ canAddress: 0, name: "Duet 3 MB6HC", shortName: "MB6HC", firmwareVersion: "3.7.0", firmwareFileName: "Duet3Firmware_MB6HC.bin", firmwareName: "RepRapFirmware for Duet 3 MB6HC" }],
				sbc: { dsf: { version: "3.5.0" } },
			},
		}));
		const w = mountFirmware();
		await flushPromises();
		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.sbcDuetNotice");
		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.updateDsf");
		// The normal release-listing UI must not be present alongside it.
		expect(w.text()).not.toContain("plugins.flexibleLayouts.firmwareUpdate.noneListed");
	});

	it("does not block a gloomyandy-firmware mainboard in SBC mode - the normal flow still works", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [{ canAddress: 0, name: "BTT SKR", shortName: "SKR", firmwareVersion: "3.6.3", firmwareFileName: "firmware_kraken_h723.bin", firmwareName: "RepRapFirmware for STM32H723" }],
				sbc: { dsf: { version: "3.5.0" } },
			},
		}));
		const w = mountFirmware();
		await flushPromises();
		expect(w.text()).not.toContain("plugins.flexibleLayouts.firmwareUpdate.sbcDuetNotice");
		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.noneListed");
	});

	it("does not block a genuine Duet mainboard when NOT running via an SBC", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [{ canAddress: 0, name: "Duet 3 MB6HC", shortName: "MB6HC", firmwareVersion: "3.7.0", firmwareFileName: "Duet3Firmware_MB6HC.bin", firmwareName: "RepRapFirmware for Duet 3 MB6HC" }],
				sbc: null,
			},
		}));
		const w = mountFirmware();
		await flushPromises();
		expect(w.text()).not.toContain("plugins.flexibleLayouts.firmwareUpdate.sbcDuetNotice");
		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.noneListed");
	});
});

describe("FirmwareUpdateWidget - hybrid Duet-mainboard + gloomyandy-toolboard hint", () => {
	it("names a gloomyandy-firmware CAN toolboard when the genuine-Duet source is active", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [
					{ canAddress: 0, name: "Duet 3 MB6HC", shortName: "MB6HC", firmwareVersion: "3.7.0", firmwareFileName: "Duet3Firmware_MB6HC.bin", firmwareName: "RepRapFirmware for Duet 3 MB6HC" },
					{ canAddress: 121, name: "SB2040", shortName: "SB2040", firmwareVersion: "3.6.3", firmwareFileName: "Duet3Firmware_SB2040MAX3.uf2", firmwareName: "RepRapFirmware for STM32F401" },
				],
				sbc: null,
			},
		}));
		const w = mountFirmware();
		await flushPromises();
		expect(w.text()).toContain("plugins.flexibleLayouts.firmwareUpdate.otherSourceHint");
	});

	it("shows no hint when every board agrees with the active (auto-detected) source", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				boards: [{ canAddress: 0, name: "Duet 3 MB6HC", shortName: "MB6HC", firmwareVersion: "3.7.0", firmwareFileName: "Duet3Firmware_MB6HC.bin", firmwareName: "RepRapFirmware for Duet 3 MB6HC" }],
				sbc: null,
			},
		}));
		const w = mountFirmware();
		await flushPromises();
		expect(w.text()).not.toContain("plugins.flexibleLayouts.firmwareUpdate.otherSourceHint");
	});
});
