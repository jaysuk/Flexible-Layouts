import { describe, expect, it } from "vitest";

import {
	applyGcodeRepairs, applyJsonRepairs, applyRepairsToFile, applyTextPatternRepairs,
	findRedactions, suggestFromLive, validateEnteredValue,
} from "../model/configBackup/repair";
import { sanitiseFile } from "../model/configBackup/sanitise";
import type { ParsedArchive, RedactionEntry, RepairAction } from "../model/configBackup/types";

function counter() {
	let n = 0;
	return () => n++;
}

function archiveFrom(path: string, text: string, redact = true): ParsedArchive {
	const { content, redactions } = sanitiseFile(path, text, redact ? "redact" : "scan", counter());
	return {
		manifest: {} as ParsedArchive["manifest"],
		redactions: { kind: "flexible-layouts-redactions", schemaVersion: 1, applied: redact, entries: redactions },
		textFiles: new Map([[path, content]]),
		binaryFiles: new Map(),
		objectModelJson: null,
		readmeText: null,
	};
}

describe("findRedactions - locating sites", () => {
	it("locates a gcode-command site by its tag", () => {
		const archive = archiveFrom("files/sys/config.g", 'M551 P"secret"');
		const sites = findRedactions(archive, new Set(["files/sys/config.g"]));
		expect(sites).toHaveLength(1);
		expect(sites[0].locatable).toBe(true);
		expect(sites[0].currentLine).toContain("[FL-REDACTED:0]");
	});

	it("survives line drift - lines inserted above the site", () => {
		const archive = archiveFrom("files/sys/config.g", 'G28\nM551 P"secret"');
		// Simulate the archive text having extra lines inserted above (as if hand-edited after backup).
		const text = archive.textFiles.get("files/sys/config.g")!;
		const withInsertedLines = `; new line 1\n; new line 2\n${text}`;
		archive.textFiles.set("files/sys/config.g", withInsertedLines);
		const sites = findRedactions(archive, new Set(["files/sys/config.g"]));
		expect(sites[0].locatable).toBe(true);
		expect(sites[0].lineIndex).toBe(3); // 2 inserted + original "G28" line = index 3 for M551 line
		expect(sites[0].currentLine).toContain("M551");
	});

	it("skips diagnostics/m122 entries entirely (excluded from restore scope)", () => {
		const archive = archiveFrom("diagnostics/m122-mainboard.txt", "Board ID: abc-123");
		const sites = findRedactions(archive, new Set(["diagnostics/m122-mainboard.txt"]));
		expect(sites).toHaveLength(0);
	});

	it("still finds sites when redactions.json entries exist but the file has no tag alongside plain [REDACTED] text", () => {
		const archive = archiveFrom("files/sys/config.g", 'M551 P"secret"');
		const text = archive.textFiles.get("files/sys/config.g")!;
		// Strip the tag but leave the [REDACTED] sentinel - simulates a hand-edited archive.
		const withoutTag = text.replace(/\s*\[FL-REDACTED:[\d,]+\][^\n]*/, "");
		archive.textFiles.set("files/sys/config.g", withoutTag);
		const sites = findRedactions(archive, new Set(["files/sys/config.g"]));
		expect(sites).toHaveLength(1);
		expect(sites[0].locatable).toBe(false); // no tag to locate the exact line, but still surfaced
	});

	it("locates a json-value site via its pointer", () => {
		const archive = archiveFrom("files/sys/mqtt.json", JSON.stringify({ password: "hunter2" }));
		const sites = findRedactions(archive, new Set(["files/sys/mqtt.json"]));
		expect(sites).toHaveLength(1);
		expect(sites[0].entry.pointer).toBe("/password");
		expect(sites[0].locatable).toBe(true);
	});

	it("omits a json site whose value was already resolved by other means", () => {
		const archive = archiveFrom("files/sys/mqtt.json", JSON.stringify({ password: "hunter2" }));
		archive.textFiles.set("files/sys/mqtt.json", JSON.stringify({ password: "already-fixed" }));
		const sites = findRedactions(archive, new Set(["files/sys/mqtt.json"]));
		expect(sites).toHaveLength(0);
	});
});

describe("suggestFromLive", () => {
	function entryFor(text: string, path = "files/sys/config.g"): RedactionEntry {
		const { redactions } = sanitiseFile(path, text, "redact", counter());
		return redactions[0];
	}

	it("finds exactly one match", () => {
		const entry = entryFor('M587 S"HomeNet" P"secret"');
		const live = 'M587 S"HomeNet" P"realpassword"';
		const result = suggestFromLive(entry, live);
		expect(result).toEqual({ status: "found", values: { S: "HomeNet", P: "realpassword" } });
	});

	it("returns none when the command doesn't appear live", () => {
		const entry = entryFor('M551 P"secret"');
		const result = suggestFromLive(entry, "G28\nM106 P0 S1");
		expect(result).toEqual({ status: "none" });
	});

	it("returns ambiguous when two differing candidates exist", () => {
		const entry = entryFor('M551 P"secret"');
		const live = 'M551 P"first"\nM551 P"second"';
		const result = suggestFromLive(entry, live);
		expect(result.status).toBe("ambiguous");
	});

	it("de-dupes identical repeated matches into a single found result", () => {
		const entry = entryFor('M551 P"secret"');
		const live = 'M551 P"same"\nM551 P"same"';
		const result = suggestFromLive(entry, live);
		expect(result).toEqual({ status: "found", values: { P: "same" } });
	});

	it("resolves a GLOBAL variable assignment from the live file", () => {
		const entry = entryFor('set global.wifiPassword = "secret"');
		const result = suggestFromLive(entry, 'set global.wifiPassword = "realvalue"');
		expect(result).toEqual({ status: "found", values: { wifiPassword: "realvalue" } });
	});
});

describe("validateEnteredValue", () => {
	it("accepts a well-formed MAC for M540", () => {
		expect(validateEnteredValue({ code: "M540" } as RedactionEntry, "P", "aa:bb:cc:dd:ee:ff")).toBeNull();
	});
	it("rejects a malformed MAC for M540", () => {
		expect(validateEnteredValue({ code: "M540" } as RedactionEntry, "P", "not-a-mac")).toMatch(/MAC address/);
	});
	it("accepts a well-formed IPv4 for M552", () => {
		expect(validateEnteredValue({ code: "M552" } as RedactionEntry, "P", "192.168.1.50")).toBeNull();
	});
	it("rejects a malformed IPv4 for M552", () => {
		expect(validateEnteredValue({ code: "M552" } as RedactionEntry, "P", "not-an-ip")).toMatch(/IPv4/);
	});
	it("rejects an empty value", () => {
		expect(validateEnteredValue({ code: "M551" } as RedactionEntry, "P", "  ")).toMatch(/required/);
	});
	it("rejects the literal placeholder being re-entered", () => {
		expect(validateEnteredValue({ code: "M551" } as RedactionEntry, "P", "[REDACTED]")).toMatch(/placeholder/);
	});
	it("has no shape requirement for a plain password field", () => {
		expect(validateEnteredValue({ code: "M551" } as RedactionEntry, "P", "any-password-shape-ok")).toBeNull();
	});
});

describe("applyGcodeRepairs - the four actions", () => {
	function siteAndDecisions(text: string, action: RepairAction) {
		const { content, redactions } = sanitiseFile("files/sys/config.g", text, "redact", counter());
		const lines = content.split("\n");
		const idToLine = new Map<number, number>();
		lines.forEach((l, i) => {
			const m = /\[FL-REDACTED:([\d,]+)\]/.exec(l);
			if (m) { for (const id of m[1].split(",")) { idToLine.set(Number(id), i); } }
		});
		const sites = redactions.map((entry) => ({ entry, locatable: true, lineIndex: idToLine.get(entry.id), currentLine: lines[idToLine.get(entry.id)!] }));
		const decisions = new Map(redactions.map((e) => [e.id, action]));
		return { content, sites, decisions };
	}

	it("keep-live substitutes the live value and removes the tag", () => {
		const { content, sites, decisions } = siteAndDecisions('M551 P"secret"', { type: "keep-live", values: { P: "realpass" } });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired).toBe('M551 P"realpass"');
		expect(repaired).not.toContain("FL-REDACTED");
	});

	it("enter-value substitutes a manually-typed value", () => {
		const { content, sites, decisions } = siteAndDecisions('M552 P192.168.1.50'.replace("192.168.1.50", "10.0.0.5"), { type: "enter-value", values: { P: "10.0.0.9" } });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired).toBe("M552 P10.0.0.9");
	});

	it("preserves unquoted style for a numeric/IP param", () => {
		const { content, sites, decisions } = siteAndDecisions("M552 P192.168.1.50", { type: "enter-value", values: { P: "10.0.0.9" } });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired).toBe("M552 P10.0.0.9"); // no quotes added around an originally-bare value
	});

	it("comment-out disables the line and explains why", () => {
		const { content, sites, decisions } = siteAndDecisions('M551 P"secret"', { type: "comment-out" });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired.startsWith(";")).toBe(true);
		expect(repaired).toContain("M551");
		expect(repaired).not.toContain("FL-REDACTED");
	});

	it("omit-key is a safe no-op for gcode (not a valid action there)", () => {
		const { content, sites, decisions } = siteAndDecisions('M551 P"secret"', { type: "omit-key" });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired).not.toContain("FL-REDACTED"); // tag still stripped even though value is untouched
	});

	it("multi-param entry (M587 S+P) is fully repaired from one decision", () => {
		const { content, sites, decisions } = siteAndDecisions('M587 S"HomeNet" P"secret"', { type: "keep-live", values: { S: "HomeNet", P: "realpass" } });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired).toBe('M587 S"HomeNet" P"realpass"');
	});

	it("preserves a genuine pre-existing user comment", () => {
		const { content, sites, decisions } = siteAndDecisions('M551 P"secret" ; the door code', { type: "keep-live", values: { P: "realpass" } });
		const repaired = applyGcodeRepairs(content, sites, decisions);
		expect(repaired).toBe('M551 P"realpass" ; the door code');
	});
});

describe("applyJsonRepairs", () => {
	it("keep-live / enter-value sets the pointer's value", () => {
		const { content, redactions } = sanitiseFile("files/sys/mqtt.json", JSON.stringify({ password: "hunter2" }), "redact", counter());
		const sites = redactions.map((entry) => ({ entry, locatable: true }));
		const decisions = new Map([[redactions[0].id, { type: "enter-value", values: { value: "realpass" } } as RepairAction]]);
		const repaired = applyJsonRepairs(content, sites, decisions);
		expect(JSON.parse(repaired).password).toBe("realpass");
	});

	it("omit-key removes the key", () => {
		const { content, redactions } = sanitiseFile("files/sys/mqtt.json", JSON.stringify({ password: "hunter2", host: "mqtt.example.com" }), "redact", counter());
		const sites = redactions.map((entry) => ({ entry, locatable: true }));
		const decisions = new Map([[redactions[0].id, { type: "omit-key" } as RepairAction]]);
		const repaired = applyJsonRepairs(content, sites, decisions);
		const parsed = JSON.parse(repaired);
		expect(parsed.password).toBeUndefined();
		expect(parsed.host).toBe("mqtt.example.com");
	});

	it("comment-out is a safe no-op for JSON (never offered by the UI there)", () => {
		const { content, redactions } = sanitiseFile("files/sys/mqtt.json", JSON.stringify({ password: "hunter2" }), "redact", counter());
		const sites = redactions.map((entry) => ({ entry, locatable: true }));
		const decisions = new Map([[redactions[0].id, { type: "comment-out" } as RepairAction]]);
		const repaired = applyJsonRepairs(content, sites, decisions);
		expect(JSON.parse(repaired).password).toBe("[REDACTED]"); // untouched, but still valid JSON
	});
});

describe("applyTextPatternRepairs", () => {
	it("fills in an untagged text-pattern redaction in a non-gcode, non-json file", () => {
		const { content, redactions } = sanitiseFile("files/sys/notes.txt", "contact a@b.com for help", "redact", counter());
		const sites = redactions.map((entry) => ({ entry, locatable: true }));
		const decisions = new Map([[redactions[0].id, { type: "enter-value", values: { value: "a@b.com" } } as RepairAction]]);
		const repaired = applyTextPatternRepairs(content, sites, decisions);
		expect(repaired).toBe("contact a@b.com for help");
	});
});

describe("applyRepairsToFile - dispatch + backstop sanity", () => {
	it("leaves no [FL-REDACTED tag and no [REDACTED] sentinel once every site is resolved", () => {
		const { content, redactions } = sanitiseFile("files/sys/config.g", 'M587 S"HomeNet" P"secret"', "redact", counter());
		const idToLine = new Map<number, number>();
		content.split("\n").forEach((l, i) => {
			const m = /\[FL-REDACTED:([\d,]+)\]/.exec(l);
			if (m) { for (const id of m[1].split(",")) { idToLine.set(Number(id), i); } }
		});
		const sites = redactions.map((entry) => ({ entry, locatable: true, lineIndex: idToLine.get(entry.id) }));
		const decisions = new Map(redactions.map((e) => [e.id, { type: "keep-live", values: { S: "HomeNet", P: "realpass" } } as RepairAction]));
		const repaired = applyRepairsToFile("files/sys/config.g", content, sites, decisions);
		expect(repaired).not.toContain("FL-REDACTED");
		expect(repaired).not.toContain("[REDACTED]");
	});

	it("dispatches .json files to the JSON repairer", () => {
		const { content, redactions } = sanitiseFile("files/sys/mqtt.json", JSON.stringify({ password: "x" }), "redact", counter());
		const sites = redactions.map((entry) => ({ entry, locatable: true }));
		const decisions = new Map([[redactions[0].id, { type: "enter-value", values: { value: "y" } } as RepairAction]]);
		const repaired = applyRepairsToFile("files/sys/mqtt.json", content, sites, decisions);
		expect(JSON.parse(repaired).password).toBe("y");
	});
});
