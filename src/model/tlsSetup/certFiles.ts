/**
 * Lightweight PEM sanity checks for the server key/cert files a user uploads, per RRF's HTTPS setup.md
 * requirements: PEM format only (no DER), an EC key (P-256/P-384, not RSA) with no passphrase. This is
 * NOT a cryptographic validator - it only catches the most common "wrong file" mistakes before
 * uploading something to the SD card that RRF will just reject anyway. RRF's own `M552 T1` command
 * (interpreted by commandReplies.ts) is the real authority on whether the pair is actually valid.
 */

export type PemCheckReason = "not-pem" | "encrypted-key" | "wrong-key-type";

export interface PemCheckResult {
	ok: boolean;
	reason?: PemCheckReason;
}

const CERT_MARKER_RE = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
const EC_KEY_MARKER_RE = /-----BEGIN EC PRIVATE KEY-----[\s\S]+-----END EC PRIVATE KEY-----/;
const GENERIC_KEY_MARKER_RE = /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/;
const ENCRYPTED_KEY_MARKER_RE = /-----BEGIN ENCRYPTED PRIVATE KEY-----/;
const RSA_KEY_MARKER_RE = /-----BEGIN RSA PRIVATE KEY-----/;

export function checkCertificatePem(text: string): PemCheckResult {
	if (!CERT_MARKER_RE.test(text)) { return { ok: false, reason: "not-pem" }; }
	return { ok: true };
}

export function checkPrivateKeyPem(text: string): PemCheckResult {
	if (ENCRYPTED_KEY_MARKER_RE.test(text)) { return { ok: false, reason: "encrypted-key" }; }
	if (RSA_KEY_MARKER_RE.test(text)) { return { ok: false, reason: "wrong-key-type" }; }
	if (!EC_KEY_MARKER_RE.test(text) && !GENERIC_KEY_MARKER_RE.test(text)) { return { ok: false, reason: "not-pem" }; }
	return { ok: true };
}
