import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { dwc, loadObjectModel, setConnected, setModel } from "dwc-plugin-test-kit";

import { useSettingsStore } from "@/stores/settings";

// The scanner talks to the machine through defaultMachineIO(); give it a small in-memory SD card.
const card = vi.hoisted(() => ({
	files: {} as Record<string, string>, listings: [] as Array<string>, downloads: [] as Array<string>, onDownload: undefined as undefined | (() => void),
}));
vi.mock("../src/model/configBackup/machineIO", () => ({
	defaultMachineIO: () => ({
		async getFileList(dir: string) {
			card.listings.push(dir);
			return Object.keys(card.files)
				.filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes("/"))
				.map((p) => ({ isDirectory: false, name: p.slice(dir.length), size: card.files[p].length, lastModified: new Date("2026-01-01") }));
		},
		async downloadText(path: string) { card.downloads.push(path); card.onDownload?.(); return card.files[path]; },
	}),
}));

import {
	CHECK_COOLDOWN_MS, FIRMWARE_CHANGES_ROUTE_PATH, checkFirmwareChanges, installFirmwareChangeNudges, uninstallFirmwareChangeNudges,
} from "../src/model/firmware/changeNudges";
import { clearScanCache } from "../src/model/firmware/changeScan";
import { firmwareChangeReport, reportOpenRequested } from "../src/model/firmware/changeCheck";
import { readFirmwareChangeState, writeFirmwareChangeState } from "../src/model/firmware/changeState";

const T = (k: string) => `plugins.flexibleLayouts.firmwareChanges.${k}`;

function machine(version: string, status = "idle"): void {
	setModel({ ...loadObjectModel(), boards: [{ canAddress: 0, firmwareVersion: version }], state: { status } });
}
const titles = (): Array<string> => dwc.notifications.map((n) => n.title);

beforeEach(() => {
	delete (useSettingsStore().plugins as Record<string, unknown>).flexibleLayouts;
	clearScanCache();
	card.files = { "0:/sys/config.g": "M408 S0\nG1 X1\n", "0:/macros/warm": "M140 S60\n" };
	card.listings.length = 0;
	card.downloads.length = 0;
	card.onDownload = undefined;
	dwc.notifications.length = 0;
	reportOpenRequested.value = false;
	setConnected(false);
	machine("3.7.0-rc.2");
});
afterEach(() => uninstallFirmwareChangeNudges());

async function connect(): Promise<void> {
	installFirmwareChangeNudges();
	setConnected(true);
	await flushPromises();
	await flushPromises();
}

describe("first connect", () => {
	it("scans from the oldest tracked release, toasts once, and keeps that baseline until reviewed", async () => {
		await connect();
		expect(titles()).toEqual([T("toastTitle")]);
		expect(readFirmwareChangeState()).toMatchObject({ baseline: "3.6.3", notifiedKey: "3.6.3->3.7.0-rc.2" });
		expect(card.listings.length).toBeGreaterThan(0);
	});

	it("moves the baseline silently when nothing known is affected", async () => {
		card.files = { "0:/sys/config.g": "G1 X1\n" };
		await connect();
		expect(titles()).toEqual([]);
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2");
	});

	it("waits for the machine to be idle, with the starting baseline already stored", async () => {
		machine("3.7.0-rc.2", "processing");
		await connect();
		expect(readFirmwareChangeState().baseline).toBe("3.6.3");
		expect(card.listings).toEqual([]);
		machine("3.7.0-rc.2", "idle");
		await flushPromises();
		await flushPromises();
		expect(titles()).toEqual([T("toastTitle")]);
	});

	it("only records the version on a machine already at the oldest tracked release", async () => {
		machine("3.6.3");
		await connect();
		expect(readFirmwareChangeState().baseline).toBe("3.6.3");
		expect(titles()).toEqual([]);
		expect(card.listings).toEqual([]);
	});

	it("does nothing while the running version is not readable", async () => {
		machine("");
		await connect();
		expect(readFirmwareChangeState().baseline).toBeNull();
	});
});

describe("a changed firmware version", () => {
	beforeEach(() => writeFirmwareChangeState({ baseline: "3.6.3" }));

	it("raises one click-through toast for the lines that use something that changed, and keeps the baseline", async () => {
		await connect();
		const toast = dwc.notifications.filter((n) => n.title === T("toastTitle"));
		expect(toast).toHaveLength(1);
		expect(toast[0].message).toBe(T("toastBody"));
		expect(FIRMWARE_CHANGES_ROUTE_PATH).toBe("/Settings/flexibleLayouts"); // FL's own Settings tab (registerSettingTab key)
		expect(readFirmwareChangeState()).toMatchObject({ baseline: "3.6.3", notifiedKey: "3.6.3->3.7.0-rc.2" });
		expect(readFirmwareChangeState().lastScan).toMatchObject({ from: "3.6.3", to: "3.7.0-rc.2" });
		expect(readFirmwareChangeState().lastScan!.occurrences).toBeGreaterThan(0);
		expect(firmwareChangeReport.value?.byEvent.map((g) => g.event.id)).toContain("m408-removed");
		expect(reportOpenRequested.value).toBe(true);
	});

	it("does not say it again on the next reconnect, in this browser or another (the key is machine-shared)", async () => {
		await connect();
		expect(titles().filter((t) => t === T("toastTitle"))).toHaveLength(1);
		uninstallFirmwareChangeNudges();
		dwc.notifications.length = 0;
		setConnected(false);
		await connect(); // fresh install = a new page load: the cooldown is gone, the persisted key is not
		expect(titles()).toEqual([]);
	});

	it("moves the baseline silently when nothing known is affected", async () => {
		card.files = { "0:/sys/config.g": "G1 X1\n" };
		await connect();
		expect(titles()).toEqual([]);
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2");
	});

	it("does not count changes the user has ignored", async () => {
		card.files = { "0:/sys/config.g": "M408 S0\n" };
		writeFirmwareChangeState({ acknowledged: ["m408-removed"] });
		await connect();
		expect(titles().filter((t) => t === T("toastTitle"))).toEqual([]);
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2");
	});

	it("says nothing when the files only use things that were added, or that behave a little differently", async () => {
		// Array syntax is new on 3.7 (nothing breaks going up), M140 H0 is fine with no other job for the heater, and M575 only needs a look.
		card.files = { "0:/macros/x.g": "var a = {1,2,3}\n", "0:/sys/config.g": "M140 P0 H0\nM563 P0 D0 H1\nM575 P1 B57600 S1\n" };
		await connect();
		expect(titles().filter((t) => t === T("toastTitle"))).toEqual([]);
		expect(readFirmwareChangeState().baseline).toBe("3.7.0-rc.2"); // advanced silently: nothing needs changing
	});

	it("also runs for a downgrade", async () => {
		writeFirmwareChangeState({ baseline: "3.7.0-rc.2" });
		card.files = { "0:/macros/x.g": "M558.4 K0 P1\n" }; // a command 3.6.3 does not have
		machine("3.6.3");
		await connect();
		expect(titles()).toContain(T("toastTitle"));
		expect(firmwareChangeReport.value?.direction).toBe("downgrade");
	});

	it("is off when the feature is off", async () => {
		writeFirmwareChangeState({ enabled: false });
		await connect();
		expect(titles()).toEqual([]);
		expect(card.listings).toEqual([]);
	});

	it("waits for the machine to be strictly idle, then scans", async () => {
		machine("3.7.0-rc.2", "processing");
		await connect();
		expect(card.listings).toEqual([]);
		expect(titles()).toEqual([]);
		machine("3.7.0-rc.2", "paused");
		await flushPromises();
		expect(card.listings).toEqual([]); // a paused print is not an opening
		machine("3.7.0-rc.2", "idle");
		await flushPromises();
		await flushPromises();
		expect(titles()).toContain(T("toastTitle"));
	});

	it("gives up quietly if the connection drops mid-scan, and tries again at the next reconnect", async () => {
		card.onDownload = () => { card.onDownload = undefined; setConnected(false); }; // the first download is the last thing that happens
		await connect();
		expect(titles()).toEqual([]);
		expect(readFirmwareChangeState()).toMatchObject({ baseline: "3.6.3" });
		expect(readFirmwareChangeState().notifiedKey).toBeUndefined();
		setConnected(true);
		await flushPromises();
		await flushPromises();
		expect(titles()).toContain(T("toastTitle"));
	});
});

describe("flapping", () => {
	it("does not rescan the same change again inside the cooldown", async () => {
		writeFirmwareChangeState({ baseline: "3.6.3", notifiedKey: "3.6.3->3.7.0-rc.2" });
		await connect();
		const first = card.listings.length;
		expect(first).toBeGreaterThan(0);
		await checkFirmwareChanges();
		expect(card.listings.length).toBe(first);
		expect(CHECK_COOLDOWN_MS).toBeGreaterThan(60_000);
	});
});
