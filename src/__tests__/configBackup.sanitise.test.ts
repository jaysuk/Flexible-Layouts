import { describe, expect, it } from "vitest";

import { redactGcodeFile, redactJson, redactM122, redactText, sanitiseFile } from "../model/configBackup/sanitise";

function counter() {
	let n = 0;
	return () => n++;
}

describe("redactGcodeFile - Tier 1/2 credential and network parameters", () => {
	it("redacts M551 machine password", () => {
		const { content, redactions } = redactGcodeFile('M551 P"correct-horse-battery"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('M551 P"[REDACTED]"');
		expect(content).toMatch(/\[FL-REDACTED:0\]/);
		expect(redactions).toHaveLength(1);
		expect(redactions[0]).toMatchObject({ code: "M551", params: ["P"], tier: 1 });
	});

	it("redacts M587 SSID + PSK together, one tag", () => {
		const { content, redactions } = redactGcodeFile('M587 S"HomeNet-5G" P"correct-horse-battery"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('M587 S"[REDACTED]" P"[REDACTED]"');
		expect(content.match(/\[FL-REDACTED:\d+\]/g)).toHaveLength(1);
		expect(redactions).toHaveLength(1);
		expect(redactions[0].params).toEqual(["S", "P"]);
		expect(redactions[0].tier).toBe(1);
	});

	it("redacts M587 static-IP tier-2 params (I/J/K/L)", () => {
		const { content, redactions } = redactGcodeFile('M587 S"Net" P"pw" I192.168.1.5 J255.255.255.0 K192.168.1.1 L8.8.8.8', "redact", "files/sys/config.g", counter());
		expect(content).toContain("I[REDACTED]");
		expect(content).toContain("J[REDACTED]");
		expect(content).toContain("K[REDACTED]");
		expect(content).toContain("L[REDACTED]");
		expect(redactions[0].params).toEqual(["S", "P", "I", "J", "K", "L"]);
		expect(redactions[0].tier).toBe(1); // min tier across params on the line
	});

	it("redacts M588 forget-network SSID", () => {
		const { content, redactions } = redactGcodeFile('M588 S"HomeNet-5G"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('M588 S"[REDACTED]"');
		expect(redactions[0]).toMatchObject({ code: "M588", params: ["S"] });
	});

	it("redacts M589 access-point SSID/password/IP", () => {
		const { content, redactions } = redactGcodeFile('M589 S"PrinterAP" P"apsecret" I192.168.4.1', "redact", "files/sys/config.g", counter());
		expect(content).toContain('S"[REDACTED]"');
		expect(content).toContain('P"[REDACTED]"');
		expect(content).toContain("I[REDACTED]");
		expect(redactions[0].params).toEqual(["S", "P", "I"]);
	});

	it("redacts M586.4 MQTT credentials (decimal-form command)", () => {
		const { content, redactions } = redactGcodeFile('M586.4 C"client1" U"bob" K"mqttpass"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('C"[REDACTED]"');
		expect(content).toContain('U"[REDACTED]"');
		expect(content).toContain('K"[REDACTED]"');
		expect(redactions[0]).toMatchObject({ code: "M586.4", tier: 1 });
		expect(redactions[0].params?.sort()).toEqual(["C", "K", "U"]);
	});

	it("redacts M540 MAC address (whole parameter)", () => {
		const { content, redactions } = redactGcodeFile('M540 P"be:ef:12:34:56:78"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('M540 P"[REDACTED]"');
		expect(redactions[0]).toMatchObject({ code: "M540", tier: 2 });
	});

	it("redacts M552/M553/M554 network params (unquoted IPs)", () => {
		const p552 = redactGcodeFile("M552 P192.168.1.50", "redact", "files/sys/config.g", counter());
		expect(p552.content).toBe("M552 P[REDACTED]    ; [FL-REDACTED:0] sanitised by Flexible Layouts backup");
		const p553 = redactGcodeFile("M553 P255.255.255.0", "redact", "files/sys/config.g", counter());
		expect(p553.content).toContain("P[REDACTED]");
		const p554 = redactGcodeFile("M554 P192.168.1.1", "redact", "files/sys/config.g", counter());
		expect(p554.content).toContain("P[REDACTED]");
	});
});

describe("M550 (machine name/hostname) is never redacted", () => {
	it("leaves M550 completely untouched", () => {
		const { content, redactions } = redactGcodeFile('M550 P"MyVoron"', "redact", "files/sys/config.g", counter());
		expect(content).toBe('M550 P"MyVoron"');
		expect(redactions).toHaveLength(0);
	});
});

describe("negative cases - codes that must survive untouched", () => {
	const cases = [
		'M586 P0 S1 ; enable HTTP',
		'M575 P1 B57600 S1',
		'M98 P"config.g"',
		'M929 P"eventlog.txt" S1',
		'M918 P1 E4 F2000000',
		'M591 D0 P3 C"io3.in" S1',
		'M563 P0 D0 H1',
		'M950 H0 C"out0" T0',
		'M581 P0 T2 S1',
		'M582 T2',
		'M115',
		'M997 S0',
		'M999',
		'M587.1',
		'M587.2',
	];
	for (const line of cases) {
		it(`leaves "${line}" untouched`, () => {
			const { content, redactions } = redactGcodeFile(line, "redact", "files/sys/config.g", counter());
			expect(content).toBe(line);
			expect(redactions).toHaveLength(0);
		});
	}
});

describe("redactGcodeLine - quoting, escapes and comments", () => {
	it("handles an escaped quote inside a quoted value", () => {
		const { content } = redactGcodeFile('M551 P"a""b"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('M551 P"[REDACTED]"');
	});

	it("preserves an existing trailing comment", () => {
		const { content } = redactGcodeFile('M551 P"secret" ; set the machine password', "redact", "files/sys/config.g", counter());
		expect(content).toContain("; set the machine password");
		expect(content).toMatch(/\[FL-REDACTED:0\]/);
	});

	it("scan mode detects without altering the line", () => {
		const line = 'M587 S"HomeNet-5G" P"correct-horse-battery"';
		const { content, redactions } = redactGcodeFile(line, "scan", "files/sys/config.g", counter());
		expect(content).toBe(line);
		expect(redactions).toHaveLength(1);
		expect(redactions[0].params).toEqual(["S", "P"]);
	});
});

describe("Tier 3 - global/var assignments with sensitive names", () => {
	it("redacts set global.wifiPassword", () => {
		const { content, redactions } = redactGcodeFile('set global.wifiPassword = "hunter2"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('set global.wifiPassword = "[REDACTED]"');
		expect(redactions[0]).toMatchObject({ code: "GLOBAL", params: ["wifiPassword"], tier: 3 });
	});

	it("redacts var apiToken", () => {
		const { content, redactions } = redactGcodeFile('var apiToken = "abc123"', "redact", "files/sys/config.g", counter());
		expect(content).toContain('var apiToken = "[REDACTED]"');
		expect(redactions[0]).toMatchObject({ code: "VAR", params: ["apiToken"] });
	});

	it("leaves non-sensitive global/var assignments alone", () => {
		const line = "set global.bedTemp = 60";
		const { content, redactions } = redactGcodeFile(line, "redact", "files/sys/config.g", counter());
		expect(content).toBe(line);
		expect(redactions).toHaveLength(0);
	});
});

describe("Tier 4 - content patterns", () => {
	it("redacts a private key block spanning multiple lines", () => {
		const text = "line1\n-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34\n-----END RSA PRIVATE KEY-----\nline5";
		const { content, redactions } = redactText(text, "redact", "files/sys/other.txt", counter());
		expect(content).not.toContain("MIIBOgIBAAJBAKj34");
		expect(content).toContain("[REDACTED]");
		expect(redactions.some((r) => r.label === "Private key block")).toBe(true);
	});

	it("redacts userinfo in a URL, keeping scheme and host", () => {
		const { content } = redactGcodeFile("; webhook https://user:sekrit@example.com/hook", "redact", "files/sys/config.g", counter());
		expect(content).toContain("https://[REDACTED]@example.com/hook");
	});

	it("redacts key=value style secrets", () => {
		const { content } = redactText('config: {"token": "abc"} token=supersecretvalue', "redact", "files/sys/other.txt", counter());
		expect(content).toContain("token=[REDACTED]");
	});

	it("redacts a Telegram bot token", () => {
		const { content } = redactText("bot token 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw", "redact", "files/sys/other.txt", counter());
		expect(content).toContain("[REDACTED]");
		expect(content).not.toContain("AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
	});

	it("redacts a JWT", () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
		const { content } = redactText(`auth: ${jwt}`, "redact", "files/sys/other.txt", counter());
		expect(content).not.toContain(jwt);
		expect(content).toContain("[REDACTED]");
	});

	it("redacts a Slack webhook URL", () => {
		const { content } = redactText("https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX", "redact", "files/sys/other.txt", counter());
		expect(content).toBe("[REDACTED]");
	});

	it("redacts a Discord webhook URL", () => {
		const { content } = redactText("https://discord.com/api/webhooks/123456789012345678/abcDEF-123_xyz", "redact", "files/sys/other.txt", counter());
		expect(content).toBe("[REDACTED]");
	});

	it("redacts an AWS access key", () => {
		const { content } = redactText("AKIAIOSFODNN7EXAMPLE", "redact", "files/sys/other.txt", counter());
		expect(content).toBe("[REDACTED]");
	});

	it("redacts an email address", () => {
		const { content } = redactText("contact james.skitt@example.com for support", "redact", "files/sys/other.txt", counter());
		expect(content).toBe("contact [REDACTED] for support");
	});
});

describe("Tier 3/4 - JSON files", () => {
	it("redacts sensitive keys recursively", () => {
		const json = JSON.stringify({ broker: { host: "mqtt.example.com", password: "hunter2" }, apiKey: "abc" });
		const { content, redactions } = redactJson(json, "redact", "files/sys/mqtt.json", counter());
		const parsed = JSON.parse(content);
		expect(parsed.broker.password).toBe("[REDACTED]");
		expect(parsed.broker.host).toBe("mqtt.example.com");
		expect(parsed.apiKey).toBe("[REDACTED]");
		expect(redactions.find((r) => r.pointer === "/broker/password")).toBeTruthy();
	});

	it("leaves non-sensitively-named string values alone, even if they look like content-pattern matches (installed-plugin config)", () => {
		// 0:/sys/ JSON is overwhelmingly installed plugins' own config - a notification email, a
		// webcam URL, etc. isn't a credential just because it superficially resembles one, and this
		// must not get mangled. Only the KEY name is the signal that a value is a real credential.
		const json = JSON.stringify({ note: "contact james@example.com", setupUrl: "see https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX for setup" });
		const { content, redactions } = redactJson(json, "redact", "files/sys/some-plugin.json", counter());
		const parsed = JSON.parse(content);
		expect(parsed.note).toBe("contact james@example.com");
		expect(parsed.setupUrl).toContain("hooks.slack.com");
		expect(redactions).toHaveLength(0);
	});

	it("still redacts a genuinely credential-named key, even in an arbitrary installed plugin's own file", () => {
		const json = JSON.stringify({ apiKey: "abc123", displayName: "My Plugin" });
		const { content, redactions } = redactJson(json, "redact", "files/sys/some-other-plugin.json", counter());
		const parsed = JSON.parse(content);
		expect(parsed.apiKey).toBe("[REDACTED]");
		expect(parsed.displayName).toBe("My Plugin");
		expect(redactions).toHaveLength(1);
	});

	it("Flexible Layouts' own login/credential fields are still caught, same as any other plugin's", () => {
		// The explicit carve-out: "not plugin data in general" does NOT mean "not FL's own login
		// data" - a credential-named key is still a credential-named key, regardless of whose file.
		const json = JSON.stringify({ access: { adminHash: "deadbeef", operatorHash: "cafef00d", observerEnabled: true } });
		const { content, redactions } = redactJson(json, "redact", "files/sys/flexible-layouts.backup.json", counter());
		const parsed = JSON.parse(content);
		expect(parsed.access.adminHash).toBe("[REDACTED]");
		expect(parsed.access.operatorHash).toBe("[REDACTED]");
		expect(parsed.access.observerEnabled).toBe(true);
		expect(redactions).toHaveLength(2);
	});

	it("leaves malformed JSON untouched", () => {
		const { content, redactions } = redactJson("{not valid json", "redact", "files/sys/bad.json", counter());
		expect(content).toBe("{not valid json");
		expect(redactions).toHaveLength(0);
	});

	it("scan mode does not mutate JSON but still reports", () => {
		const json = JSON.stringify({ password: "hunter2" });
		const { content, redactions } = redactJson(json, "scan", "files/sys/mqtt.json", counter());
		expect(content).toBe(json);
		expect(redactions).toHaveLength(1);
	});
});

describe("redactM122 - worked example from CONFIG-BACKUP-PLAN.md §3.5", () => {
	const mainboard = [
		"=== Diagnostics ===",
		"RepRapFirmware for Duet 3 MB6HC version 3.7.0 (2026-06-18 10:12:04) running on Duet 3 MB6HC v1.02 or later (standalone mode)",
		"Board ID: 08DJM-956L2-G43S8-6JTDD-3S46K-9V3ZL",
		"Used output buffers: 3 of 40 (24 max)",
		"=== Platform ===",
		"Driver 0: standstill, SG min 0, mspos 8, reads 39515, writes 14 timeouts 0",
		"=== Network ===",
		"- WiFi -",
		"Network state is active",
		"WiFi module is connected to access point HomeNet-5G",
		"WiFi firmware version 2.1.0",
		"WiFi MAC address 84:0d:8e:a1:b2:c3",
		"WiFi IP address 192.168.69.1",
		"Signal strength -48dBm, channel 6, mode 802.11n, reconnections 0",
		"Socket states: 5 0 0 0 0 0 0 0",
		"=== CAN ===",
		"Messages queued 2540, received 3810, lost 0, ignored 0, errs 0, boc 0",
		"Tx timeouts 0,0,0,0,0,0",
	].join("\n");

	it("redacts board ID, AP SSID, MAC and IP; leaves everything else intact", () => {
		const { content } = redactM122(mainboard, "redact", "diagnostics/m122-mainboard.txt", counter());
		expect(content).toContain("Board ID: [REDACTED]");
		expect(content).toContain("WiFi module is connected to access point [REDACTED]");
		expect(content).toContain("WiFi MAC address [REDACTED]");
		expect(content).toContain("WiFi IP address [REDACTED]");
		// Diagnostic content must survive verbatim.
		expect(content).toContain("version 3.7.0");
		expect(content).toContain("Driver 0: standstill, SG min 0, mspos 8, reads 39515, writes 14 timeouts 0");
		expect(content).toContain("Tx timeouts 0,0,0,0,0,0");
		expect(content).toContain("Socket states: 5 0 0 0 0 0 0 0");
		expect(content).toContain("WiFi firmware version 2.1.0");
	});

	it("never touches version numbers that merely look like an IP (3 dot-groups, not 4)", () => {
		const { content } = redactM122("version 3.7.0 running", "redact", "diagnostics/m122-mainboard.txt", counter());
		expect(content).toBe("version 3.7.0 running");
	});

	it("never touches comma-separated counters", () => {
		const { content } = redactM122("Tx timeouts 0,0,0,0,0,0", "redact", "diagnostics/m122-mainboard.txt", counter());
		expect(content).toBe("Tx timeouts 0,0,0,0,0,0");
	});

	it("redacts a CAN board's Unique ID line only", () => {
		const canBoard = [
			"Diagnostics for board 1:",
			"Duet TOOL1LC rev 1.1 or later firmware version 3.7.0 (2026-06-18 10:14:22)",
			"Unique ID: deadbeef-cafef00d",
			"Driver 0: standstill, SG min 0, reads 62119, writes 11 timeouts 0",
		].join("\n");
		const { content } = redactM122(canBoard, "redact", "diagnostics/m122-can-1.txt", counter());
		expect(content).toContain("Unique ID: [REDACTED]");
		expect(content).toContain("firmware version 3.7.0");
		expect(content).toContain("Driver 0: standstill, SG min 0, reads 62119, writes 11 timeouts 0");
	});

	it("scan mode reports without mutating", () => {
		const { content, redactions } = redactM122(mainboard, "scan", "diagnostics/m122-mainboard.txt", counter());
		expect(content).toBe(mainboard);
		expect(redactions.length).toBeGreaterThanOrEqual(4);
	});
});

describe("sanitiseFile - extension dispatch", () => {
	it("dispatches .g to the G-code path", () => {
		const { redactions } = sanitiseFile("files/sys/config.g", 'M551 P"secret"', "redact", counter());
		expect(redactions[0].code).toBe("M551");
	});

	it("dispatches .json to the JSON path", () => {
		const { redactions } = sanitiseFile("files/sys/mqtt.json", JSON.stringify({ password: "x" }), "redact", counter());
		expect(redactions[0].kind).toBe("json-value");
	});

	it("dispatches everything else to the plain-text path", () => {
		const { redactions } = sanitiseFile("files/sys/notes.txt", "contact a@b.com", "redact", counter());
		expect(redactions[0].kind).toBe("text-pattern");
	});
});

describe("Verbatim mode alters nothing but still reports every site", () => {
	it("leaves a G-code file byte-identical while still populating redactions", () => {
		const line = 'M587 S"HomeNet-5G" P"correct-horse-battery"';
		const { content, redactions } = sanitiseFile("files/sys/config.g", line, "scan", counter());
		expect(content).toBe(line);
		expect(redactions).toHaveLength(1);
	});
});
