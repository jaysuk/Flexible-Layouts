import { X509Certificate, createPrivateKey } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkCertificatePem, checkPrivateKeyPem } from "../model/tlsSetup/certFiles";
import { generateSelfSignedCert, isSecureContextAvailable } from "../model/tlsSetup/certGenerate";

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
		expect(Math.abs(new Date(cert.validToDate).getTime() - expectedMs)).toBeLessThan(60_000);
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
});
