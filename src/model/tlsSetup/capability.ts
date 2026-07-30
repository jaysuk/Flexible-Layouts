/**
 * Board/firmware capability detection for RRF 3.7's TLS support (HTTPS/FTPS/TelnetS on the network
 * interface). Verified against RepRapFirmware's own "HTTPS setup.md" (3.7-dev branch, fetched directly
 * from github.com/Duet3D/RepRapFirmware): Ethernet TLS needs a SAME70/SAME5x board (MB6HC/MB6XD/
 * Mini 5+); WiFi TLS needs an ESP32-family module on WiFi firmware >= 2.4.0 (the ESP8266 module used on
 * some boards can't host a TLS server at all - its heap is too small for an mbedTLS handshake). There
 * is no separate ESP32-vs-ESP8266 field in the object model to check directly, but since an ESP8266
 * module could never report 2.4.0+ firmware in the first place, the firmware-version check alone is a
 * reliable proxy.
 */

const ETHERNET_TLS_BOARD_RE = /\b(mb6hc|mb6xd|mini\s*5\+)/i;
const MIN_WIFI_TLS_FIRMWARE = [2, 4, 0];

/** `boards[].firmwareName` is a static, compile-time string ("RepRapFirmware for STM32H7 based
 * Boards") on STM32-port forks, unlike `boards[].name`/`shortName` which are runtime-configurable per
 * board and don't reliably contain "STM32" - this is the signal for STM32-specific protocol gaps
 * (e.g. Telnet, see TlsSetupDialog.vue) that don't apply to official Duet3D boards. */
const STM32_FIRMWARE_NAME_RE = /stm32/i;

export type InterfaceKind = "wifi" | "ethernet";

export interface DetectedInterface {
	kind: InterfaceKind;
	/** WiFi module firmware version string (e.g. "2.4.0", "2.1beta4"). Null for Ethernet, or if unknown. */
	firmwareVersion: string | null;
	/** Current IP address, for pre-filling the certificate's subjectAltName. */
	actualIP: string | null;
}

export type CapabilityReason =
	| "wifi-firmware-unknown" | "wifi-firmware-unparseable" | "wifi-firmware-too-old"
	| "ethernet-board-unsupported" | "no-interface";

export interface TlsCapabilityResult {
	capable: boolean;
	reason?: CapabilityReason;
}

/** Parses a leading `N.N.N` numeric prefix, ignoring any trailing pre-release suffix (e.g. "2.1beta4"
 * -> [2, 1]). Returns null if no numeric prefix is found at all. */
export function parseVersionPrefix(version: string): Array<number> | null {
	const match = /^(\d+(?:\.\d+)*)/.exec(version.trim());
	if (!match) { return null; }
	return match[1].split(".").map(Number);
}

/** -1 / 0 / 1 like a normal comparator, or null if `a` doesn't parse as a version at all. */
export function compareVersions(a: string, b: ReadonlyArray<number>): number | null {
	const pa = parseVersionPrefix(a);
	if (!pa) { return null; }
	const len = Math.max(pa.length, b.length);
	for (let i = 0; i < len; i++) {
		const av = pa[i] ?? 0;
		const bv = b[i] ?? 0;
		if (av !== bv) { return av < bv ? -1 : 1; }
	}
	return 0;
}

export function isEthernetTlsCapableBoard(boardName: string): boolean {
	return ETHERNET_TLS_BOARD_RE.test(boardName);
}

export function checkWifiTlsCapability(firmwareVersion: string | null): TlsCapabilityResult {
	if (!firmwareVersion) { return { capable: false, reason: "wifi-firmware-unknown" }; }
	const cmp = compareVersions(firmwareVersion, MIN_WIFI_TLS_FIRMWARE);
	if (cmp === null) { return { capable: false, reason: "wifi-firmware-unparseable" }; }
	if (cmp < 0) { return { capable: false, reason: "wifi-firmware-too-old" }; }
	return { capable: true };
}

export function checkEthernetTlsCapability(boardName: string): TlsCapabilityResult {
	if (!isEthernetTlsCapableBoard(boardName)) { return { capable: false, reason: "ethernet-board-unsupported" }; }
	return { capable: true };
}

interface LooseNetworkInterface {
	type?: string;
	firmwareVersion?: string | null;
	actualIP?: string | null;
}

/** Reads `model.network.interfaces`, tolerant of the array containing `null` entries (RRF's object
 * model does this for unconfigured interface slots). */
export function detectInterfaces(model: unknown): Array<DetectedInterface> {
	const m = model as { network?: { interfaces?: Array<LooseNetworkInterface | null> } } | undefined;
	const interfaces = m?.network?.interfaces ?? [];
	return interfaces
		.filter((i): i is LooseNetworkInterface => i != null)
		.map((i) => ({
			kind: i.type === "wifi" ? "wifi" : "ethernet",
			firmwareVersion: i.firmwareVersion ?? null,
			actualIP: i.actualIP ?? null,
		}));
}

export function getMainboardName(model: unknown): string {
	const m = model as { boards?: Array<{ name?: string }> } | undefined;
	return m?.boards?.[0]?.name ?? "";
}

export function getMainboardFirmwareName(model: unknown): string {
	const m = model as { boards?: Array<{ firmwareName?: string }> } | undefined;
	return m?.boards?.[0]?.firmwareName ?? "";
}

/** True on an STM32-port board (a third-party RRF fork, e.g. BTT Kraken) - these have no Telnet
 * responder at all, regardless of TLS or interface type, unlike official Duet3D boards. */
export function isStm32PortBoard(firmwareName: string): boolean {
	return STM32_FIRMWARE_NAME_RE.test(firmwareName);
}

export interface InterfaceCapability extends DetectedInterface {
	tls: TlsCapabilityResult;
}

/** The one entry point the UI needs: every detected interface plus whether each can do TLS and why not.
 *
 * Some third-party STM32-port boards (no native onboard Ethernet MAC at all) report an "ethernet"
 * interface that's actually bridged through an ESP32 module - its TLS capability is really the
 * module firmware's, identical to a genuine WiFi interface, not the mainboard's. `firmwareVersion`
 * is only ever populated for a module-backed interface (null for a native Ethernet MAC - see
 * `DetectedInterface` above), so it's a more reliable signal for which capability check applies here
 * than the interface's own reported `type`/`kind`. */
export function assessTlsCapabilities(model: unknown): Array<InterfaceCapability> {
	const boardName = getMainboardName(model);
	return detectInterfaces(model).map((iface) => ({
		...iface,
		tls: iface.firmwareVersion != null ? checkWifiTlsCapability(iface.firmwareVersion) : checkEthernetTlsCapability(boardName),
	}));
}
