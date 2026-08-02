import { X509Certificate, createPrivateKey } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkCertificatePem, checkPrivateKeyPem } from "../model/tlsSetup/certFiles";
import { generateSelfSignedCert, isSecureContextAvailable, unsignedIntegerToDer } from "../model/tlsSetup/certGenerate";

/**
 * Cross-validates the generated cert/key using Node's OWN built-in crypto module (X509Certificate),
 * independent of the @peculiar/asn1-* library used to build them - if this suite's own hand-assembled
 * ASN.1 encoding were subtly wrong, an independent parser/verifier is what would actually catch it,
 * rather than just round-tripping through the same library that produced it.
 *
 * Note: `X509Certificate.prototype.verify()` itself was found to misbehave specifically under this
 * Vitest/happy-dom sandbox (returns false here, but true for the exact same cert/code run under plain
 * Node, and independently confirmed valid via `openssl verify` on the same PEM) - an environment
 * quirk, not a real signal, so the self-signature check below shells out to `openssl verify` instead
 * (skipped, not failed, if openssl isn't on PATH) rather than relying on the unreliable-here API.
 */
describe("generateSelfSignedCert", () => {
	it("reports a secure context is available (Node's Vitest runtime provides Web Crypto)", () => {
		expect(isSecureContextAvailable()).toBe(true);
	});

	it("produces a key/cert pair that pass this repo's own PEM sanity checks", async () => {
		const { keyPem, certPem } = await generateSelfSignedCert({ hostname: "duet3.local" });
		expect(checkPrivateKeyPem(keyPem)).toEqual({ ok: true });
		expect(checkCertificatePem(certPem)).toEqual({ ok: true });
	});

	const opensslAvailable = (() => {
		try { execFileSync("openssl", ["version"], { stdio: "ignore" }); return true; } catch { return false; }
	})();
	it.skipIf(!opensslAvailable)("produces a certificate whose self-signature verifies against an independent tool (openssl)", async () => {
		const { certPem } = await generateSelfSignedCert({ hostname: "duet3.local" });
		const dir = mkdtempSync(join(tmpdir(), "fl-tls-test-"));
		try {
			const certPath = join(dir, "gen.crt");
			writeFileSync(certPath, certPem);
			const output = execFileSync("openssl", ["verify", "-CAfile", certPath, certPath], { encoding: "utf8" });
			expect(output).toContain("OK");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("produces a private key that actually matches the certificate's public key", async () => {
		const { keyPem, certPem } = await generateSelfSignedCert({ hostname: "duet3.local" });
		const cert = new X509Certificate(certPem);
		const privateKey = createPrivateKey(keyPem);
		expect(cert.checkPrivateKey(privateKey)).toBe(true);
	});

	it("sets the subject/issuer common name to the given hostname", async () => {
		const { certPem } = await generateSelfSignedCert({ hostname: "voron24.local" });
		const cert = new X509Certificate(certPem);
		expect(cert.subject).toContain("CN=voron24.local");
		expect(cert.issuer).toContain("CN=voron24.local");
	});

	it("includes the hostname (and IP, if given) in subjectAltName", async () => {
		const { certPem } = await generateSelfSignedCert({ hostname: "duet3.local", ip: "192.168.1.50" });
		const cert = new X509Certificate(certPem);
		expect(cert.subjectAltName).toContain("DNS:duet3.local");
		expect(cert.subjectAltName).toContain("192.168.1.50");
	});

	it("omits the IP from subjectAltName when none is given", async () => {
		const { certPem } = await generateSelfSignedCert({ hostname: "duet3.local" });
		const cert = new X509Certificate(certPem);
		expect(cert.subjectAltName).toContain("DNS:duet3.local");
		expect(cert.subjectAltName).not.toMatch(/IP Address/);
	});

	it("sets validity to roughly the requested number of days", async () => {
		const before = Date.now();
		const { notAfter, certPem } = await generateSelfSignedCert({ hostname: "duet3.local", validityDays: 30 });
		const cert = new X509Certificate(certPem);
		const expectedMs = before + 30 * 24 * 60 * 60 * 1000;
		expect(Math.abs(notAfter.getTime() - expectedMs)).toBeLessThan(60_000);
		// `validTo` (a string) rather than `validToDate` (a Date getter): the latter was only added to
		// Node's X509Certificate around v23 and is undefined on the Node 20 LTS this plugin's CI runs -
		// `new Date(undefined)` is an Invalid Date, so asserting against it there always failed with
		// NaN regardless of the certificate's actual (correct) validity. `validTo`'s OpenSSL-style
		// date string ("Jan  1 00:00:00 2026 GMT") has been parseable by Date() for as long as Node
		// has had X509Certificate at all.
		expect(Math.abs(new Date(cert.validTo).getTime() - expectedMs)).toBeLessThan(60_000);
	});

	it("defaults to a 10-year validity period when none is given", async () => {
		const { notAfter } = await generateSelfSignedCert({ hostname: "duet3.local" });
		const days = (notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
		expect(days).toBeGreaterThan(3649);
		expect(days).toBeLessThan(3651);
	});

	it("generates a distinct key pair (and serial number) on every call", async () => {
		const a = await generateSelfSignedCert({ hostname: "duet3.local" });
		const b = await generateSelfSignedCert({ hostname: "duet3.local" });
		expect(a.keyPem).not.toBe(b.keyPem);
		const certA = new X509Certificate(a.certPem);
		const certB = new X509Certificate(b.certPem);
		expect(certA.serialNumber).not.toBe(certB.serialNumber);
	});

	// Repeating cert generation many times exercises rawSignatureToDer against REAL random ECDSA
	// signatures rather than only the hand-picked byte patterns above - real r/s values are ~uniform
	// over the P-256 curve order, so across enough runs this hits a top-bit-set high byte (needs a
	// sign-guard pad) and, less often, a natural leading zero (must NOT be left as illegal padding)
	// without either ever needing to be a fixture. Node's own X509Certificate parser is the
	// independent check: it threw "illegal padding" on the unfixed code within the first few dozen
	// certificates in manual testing.
	it("produces a parseable, distinctly-signed certificate across many random signatures", async () => {
		for (let i = 0; i < 40; i++) {
			const { certPem } = await generateSelfSignedCert({ hostname: "duet3.local" });
			expect(() => new X509Certificate(certPem)).not.toThrow();
		}
	});
});

/**
 * Deterministic regression coverage for the DER sign-guard bug this file's tests originally caught
 * only by chance (a random ECDSA signature half's top bit is set ~50% of the time, so the buggy
 * version failed unpredictably rather than every run). These fixtures pin the exact byte patterns
 * that were wrong before the fix, independent of any randomness.
 */
describe("unsignedIntegerToDer", () => {
	function hex(buf: ArrayBuffer): string {
		return Buffer.from(buf).toString("hex");
	}

	it("adds a leading 0x00 pad when the top bit is set, to keep the value positive", () => {
		const input = new Uint8Array(4); input.set([0xf0, 0x00, 0x00, 0x01]);
		const der = unsignedIntegerToDer(input);
		expect(hex(der)).toBe("00f0000001");
	});

	it("strips a redundant leading zero when the next byte's top bit is already clear (would otherwise be illegal padding)", () => {
		const input = new Uint8Array(4); input.set([0x00, 0x01, 0x00, 0x05]);
		const der = unsignedIntegerToDer(input);
		expect(hex(der)).toBe("010005");
	});

	it("keeps exactly one leading zero when it's genuinely needed after stripping (next byte's top bit is set)", () => {
		const input = new Uint8Array(4); input.set([0x00, 0xff, 0x00, 0x05]);
		const der = unsignedIntegerToDer(input);
		expect(hex(der)).toBe("00ff0005");
	});

	it("leaves an already-minimal, sign-safe value untouched", () => {
		const input = new Uint8Array(4); input.set([0x40, 0x00, 0x00, 0x11]);
		const der = unsignedIntegerToDer(input);
		expect(hex(der)).toBe("40000011");
	});

	it("encodes an all-zero value as a single 0x00 byte", () => {
		const der = unsignedIntegerToDer(new Uint8Array(4));
		expect(hex(der)).toBe("00");
	});

	const opensslAvailable = (() => {
		try { execFileSync("openssl", ["version"], { stdio: "ignore" }); return true; } catch { return false; }
	})();

	// The regression this whole module was tracked down from: `openssl asn1parse` (independent of the
	// @peculiar/asn1-* library that both produces and, symmetrically, could mis-parse this) confirmed
	// the UNFIXED encoding decoded the top-bit-set case back as a NEGATIVE integer rather than the
	// intended positive one - a wrong signature value, not merely a malformed one.
	it.skipIf(!opensslAvailable)("openssl's own ASN.1 parser reads the sign-guarded value back as positive", () => {
		const r = new Uint8Array(4); r.set([0xf0, 0x00, 0x00, 0x01]);
		const der = Buffer.from(unsignedIntegerToDer(r));
		const withTag = Buffer.concat([Buffer.from([0x02, der.length]), der]); // wrap as a bare INTEGER
		const dir = mkdtempSync(join(tmpdir(), "fl-tls-der-test-"));
		try {
			const path = join(dir, "int.der");
			writeFileSync(path, withTag);
			const output = execFileSync("openssl", ["asn1parse", "-inform", "DER", "-in", path], { encoding: "utf8" });
			expect(output).toContain("INTEGER");
			expect(output).not.toContain(":-"); // a ':-' prefix on the value is openssl's negative-integer marker
			expect(output).toContain("F0000001");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
