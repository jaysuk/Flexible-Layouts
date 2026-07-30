import { describe, expect, it } from "vitest";

import {
	assessTlsCapabilities, checkEthernetTlsCapability, checkWifiTlsCapability, compareVersions,
	detectInterfaces, getMainboardFirmwareName, getMainboardName, isEthernetTlsCapableBoard, isStm32PortBoard, parseVersionPrefix,
} from "../model/tlsSetup/capability";

describe("parseVersionPrefix", () => {
	it("parses a plain numeric version", () => {
		expect(parseVersionPrefix("2.4.0")).toEqual([2, 4, 0]);
	});
	it("parses a version with a pre-release suffix, ignoring the suffix", () => {
		expect(parseVersionPrefix("2.1beta4")).toEqual([2, 1]);
	});
	it("returns null for a non-numeric string", () => {
		expect(parseVersionPrefix("unknown")).toBeNull();
	});
});

describe("compareVersions", () => {
	it("returns 0 for an exact match", () => {
		expect(compareVersions("2.4.0", [2, 4, 0])).toBe(0);
	});
	it("returns 1 when the version is newer", () => {
		expect(compareVersions("2.5.0", [2, 4, 0])).toBe(1);
		expect(compareVersions("3.0.0", [2, 4, 0])).toBe(1);
	});
	it("returns -1 when the version is older", () => {
		expect(compareVersions("2.1beta4", [2, 4, 0])).toBe(-1);
		expect(compareVersions("1.9.0", [2, 4, 0])).toBe(-1);
	});
	it("returns null when unparseable", () => {
		expect(compareVersions("unknown", [2, 4, 0])).toBeNull();
	});
});

describe("isEthernetTlsCapableBoard", () => {
	it.each(["Duet 3 MB6HC", "Duet 3 MB6XD", "Duet 3 Mini 5+", "Duet 3 Mini5+"])("recognises %s", (name) => {
		expect(isEthernetTlsCapableBoard(name)).toBe(true);
	});
	it.each(["Duet 2 WiFi", "Duet 3 Mini 5", "Duet 3 EXP3HC"])("rejects %s", (name) => {
		expect(isEthernetTlsCapableBoard(name)).toBe(false);
	});
});

describe("checkWifiTlsCapability", () => {
	it("is capable on firmware 2.4.0", () => {
		expect(checkWifiTlsCapability("2.4.0")).toEqual({ capable: true });
	});
	it("is capable on a newer firmware", () => {
		expect(checkWifiTlsCapability("2.5.1")).toEqual({ capable: true });
	});
	it("is not capable when firmware is unknown", () => {
		expect(checkWifiTlsCapability(null)).toEqual({ capable: false, reason: "wifi-firmware-unknown" });
	});
	it("is not capable when firmware is too old", () => {
		expect(checkWifiTlsCapability("2.1beta4")).toEqual({ capable: false, reason: "wifi-firmware-too-old" });
	});
	it("is not capable when firmware doesn't parse", () => {
		expect(checkWifiTlsCapability("garbage")).toEqual({ capable: false, reason: "wifi-firmware-unparseable" });
	});
});

describe("isStm32PortBoard / getMainboardFirmwareName", () => {
	it("reads firmwareName from boards[0]", () => {
		expect(getMainboardFirmwareName({ boards: [{ firmwareName: "RepRapFirmware for STM32H7 based Boards" }] }))
			.toBe("RepRapFirmware for STM32H7 based Boards");
	});
	it("returns an empty string when absent", () => {
		expect(getMainboardFirmwareName({})).toBe("");
	});
	it.each(["RepRapFirmware for STM32H7 based Boards", "RepRapFirmware for STM32F4 based Boards"])("recognises %s", (name) => {
		expect(isStm32PortBoard(name)).toBe(true);
	});
	it.each(["RepRapFirmware for Duet 3 MB6HC", "RepRapFirmware for Duet 2 WiFi", ""])("rejects %s", (name) => {
		expect(isStm32PortBoard(name)).toBe(false);
	});
});

describe("checkEthernetTlsCapability", () => {
	it("is capable on a supported board", () => {
		expect(checkEthernetTlsCapability("Duet 3 MB6HC")).toEqual({ capable: true });
	});
	it("is not capable on an unsupported board", () => {
		expect(checkEthernetTlsCapability("Duet 2 WiFi")).toEqual({ capable: false, reason: "ethernet-board-unsupported" });
	});
});

describe("detectInterfaces / getMainboardName / assessTlsCapabilities", () => {
	it("filters out null interface slots and maps type/firmwareVersion/actualIP", () => {
		const model = { network: { interfaces: [null, { type: "wifi", firmwareVersion: "2.4.0", actualIP: "192.168.1.5" }] } };
		expect(detectInterfaces(model)).toEqual([{ kind: "wifi", firmwareVersion: "2.4.0", actualIP: "192.168.1.5" }]);
	});
	it("treats a missing/unknown type as ethernet", () => {
		const model = { network: { interfaces: [{ type: "ethernet" }] } };
		expect(detectInterfaces(model)).toEqual([{ kind: "ethernet", firmwareVersion: null, actualIP: null }]);
	});
	it("returns an empty array when there's no network model at all", () => {
		expect(detectInterfaces(undefined)).toEqual([]);
	});
	it("reads the mainboard name from boards[0]", () => {
		expect(getMainboardName({ boards: [{ name: "Duet 3 MB6HC" }] })).toBe("Duet 3 MB6HC");
	});
	it("assesses a WiFi-capable and an Ethernet-incapable interface together", () => {
		const model = {
			boards: [{ name: "Duet 2 WiFi" }],
			network: { interfaces: [{ type: "wifi", firmwareVersion: "2.4.0" }] },
		};
		expect(assessTlsCapabilities(model)).toEqual([
			{ kind: "wifi", firmwareVersion: "2.4.0", actualIP: null, tls: { capable: true } },
		]);
	});
	it("checks module firmware version (not board name) for an 'ethernet' interface that's actually bridged through an ESP32 module - some STM32-port boards have no native Ethernet MAC at all", () => {
		const model = {
			boards: [{ name: "BTT Kraken V1" }], // unrecognised by isEthernetTlsCapableBoard - would wrongly fail if gated on board name
			network: { interfaces: [{ type: "ethernet", firmwareVersion: "2.4.0" }] },
		};
		expect(assessTlsCapabilities(model)).toEqual([
			{ kind: "ethernet", firmwareVersion: "2.4.0", actualIP: null, tls: { capable: true } },
		]);
	});
	it("still uses the board-name check for a genuine native Ethernet MAC (no firmwareVersion)", () => {
		const model = {
			boards: [{ name: "Duet 3 MB6HC" }],
			network: { interfaces: [{ type: "ethernet" }] },
		};
		expect(assessTlsCapabilities(model)).toEqual([
			{ kind: "ethernet", firmwareVersion: null, actualIP: null, tls: { capable: true } },
		]);
	});
});
