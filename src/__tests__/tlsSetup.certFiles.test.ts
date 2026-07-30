import { describe, expect, it } from "vitest";

import { checkCertificatePem, checkPrivateKeyPem } from "../model/tlsSetup/certFiles";

const CERT = "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n";
const EC_KEY = "-----BEGIN EC PRIVATE KEY-----\nMHcC...\n-----END EC PRIVATE KEY-----\n";
const GENERIC_KEY = "-----BEGIN PRIVATE KEY-----\nMIGH...\n-----END PRIVATE KEY-----\n";
const RSA_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n";
const ENCRYPTED_KEY = "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIF...\n-----END ENCRYPTED PRIVATE KEY-----\n";

describe("checkCertificatePem", () => {
	it("accepts a well-formed certificate", () => {
		expect(checkCertificatePem(CERT)).toEqual({ ok: true });
	});
	it("rejects plain text", () => {
		expect(checkCertificatePem("not a cert")).toEqual({ ok: false, reason: "not-pem" });
	});
	it("rejects a key file mistakenly selected as the cert", () => {
		expect(checkCertificatePem(EC_KEY)).toEqual({ ok: false, reason: "not-pem" });
	});
});

describe("checkPrivateKeyPem", () => {
	it("accepts an EC private key", () => {
		expect(checkPrivateKeyPem(EC_KEY)).toEqual({ ok: true });
	});
	it("accepts a generic PKCS#8 private key", () => {
		expect(checkPrivateKeyPem(GENERIC_KEY)).toEqual({ ok: true });
	});
	it("rejects an RSA key (RRF only accepts EC keys)", () => {
		expect(checkPrivateKeyPem(RSA_KEY)).toEqual({ ok: false, reason: "wrong-key-type" });
	});
	it("rejects a passphrase-protected key", () => {
		expect(checkPrivateKeyPem(ENCRYPTED_KEY)).toEqual({ ok: false, reason: "encrypted-key" });
	});
	it("rejects a certificate mistakenly selected as the key", () => {
		expect(checkPrivateKeyPem(CERT)).toEqual({ ok: false, reason: "not-pem" });
	});
});
