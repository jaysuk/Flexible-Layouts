import { describe, expect, it } from "vitest";

import { interpretTlsReply } from "../model/tlsSetup/commandReplies";

describe("interpretTlsReply", () => {
	it("treats an empty/plain reply as success", () => {
		expect(interpretTlsReply("")).toEqual({ ok: true });
	});
	it("recognises a missing certificate", () => {
		expect(interpretTlsReply("Error: cannot open server.crt")).toEqual({
			ok: false, reason: "cert-missing", raw: "Error: cannot open server.crt",
		});
	});
	it("recognises a missing key", () => {
		expect(interpretTlsReply("Error: cannot open server.key")).toEqual({
			ok: false, reason: "key-missing", raw: "Error: cannot open server.key",
		});
	});
	it("recognises a mismatched key/cert pair", () => {
		const raw = "Error: failed to create TLS config";
		expect(interpretTlsReply(raw)).toEqual({ ok: false, reason: "mismatched-pair", raw });
	});
	it("recognises WiFi firmware too old", () => {
		const raw = "TLS: not supported on this WiFi firmware version";
		expect(interpretTlsReply(raw)).toEqual({ ok: false, reason: "wifi-firmware-too-old", raw });
	});
	it("recognises no TLS material available to import", () => {
		const raw = "TLS: no TLS cert/key on WiFi module flash and none in /sys/ to import";
		expect(interpretTlsReply(raw)).toEqual({ ok: false, reason: "wifi-no-material", raw });
	});
	it("recognises the WiFi module rejecting new material", () => {
		const raw = "TLS: WiFi module rejected new TLS material";
		expect(interpretTlsReply(raw)).toEqual({ ok: false, reason: "wifi-rejected", raw });
	});
	it("falls back to unknown for an unrecognised error", () => {
		const raw = "Error: something else entirely went wrong";
		expect(interpretTlsReply(raw)).toEqual({ ok: false, reason: "unknown", raw });
	});
});
