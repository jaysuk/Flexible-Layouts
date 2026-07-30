/**
 * Maps RRF's own error text (from M552/M586 replies) to friendly reason codes, using the exact
 * troubleshooting table in RRF's HTTPS setup.md. RRF's raw reply is the authoritative signal here -
 * this is a translation layer for the UI, not a replacement for it, so an unrecognised error still
 * surfaces (as "unknown", with the raw text attached) rather than being silently swallowed.
 */

export type TlsReplyReason =
	| "cert-missing" | "key-missing" | "mismatched-pair"
	| "wifi-firmware-too-old" | "wifi-no-material" | "wifi-rejected" | "unknown";

export type TlsCommandOutcome =
	| { ok: true }
	| { ok: false; reason: TlsReplyReason; raw: string };

export function interpretTlsReply(reply: string): TlsCommandOutcome {
	const text = reply.toLowerCase();
	if (text.includes("cannot open") && text.includes("server.crt")) { return { ok: false, reason: "cert-missing", raw: reply }; }
	if (text.includes("cannot open") && text.includes("server.key")) { return { ok: false, reason: "key-missing", raw: reply }; }
	if (text.includes("failed to create tls config")) { return { ok: false, reason: "mismatched-pair", raw: reply }; }
	if (text.includes("not supported on this wifi firmware version")) { return { ok: false, reason: "wifi-firmware-too-old", raw: reply }; }
	if (text.includes("no tls cert/key on wifi module flash")) { return { ok: false, reason: "wifi-no-material", raw: reply }; }
	if (text.includes("wifi module rejected new tls material")) { return { ok: false, reason: "wifi-rejected", raw: reply }; }
	if (text.includes("error")) { return { ok: false, reason: "unknown", raw: reply }; }
	return { ok: true };
}
