import { describe, expect, it } from "vitest";

import { generateSelfSignedCert } from "../model/tlsSetup/certGenerate";
import { isExpiringSoon, parseCertExpiry } from "../model/tlsSetup/certExpiry";

describe("parseCertExpiry", () => {
	it("reads back the same expiry date a generated cert was created with", async () => {
		const { certPem, notAfter } = await generateSelfSignedCert({ hostname: "duet3.local", validityDays: 90 });
		const parsed = parseCertExpiry(certPem);
		expect(parsed).not.toBeNull();
		expect(Math.abs(parsed!.getTime() - notAfter.getTime())).toBeLessThan(1000);
	});

	it("returns null for garbage input rather than throwing", () => {
		expect(parseCertExpiry("not a certificate")).toBeNull();
		expect(parseCertExpiry("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")).toBeNull();
	});
});

describe("isExpiringSoon", () => {
	const now = new Date("2026-01-01T00:00:00.000Z").getTime();

	it("is not soon when well beyond the warning window", () => {
		expect(isExpiringSoon(new Date("2026-06-01T00:00:00.000Z"), 30, now)).toBe(false);
	});
	it("is soon when within the warning window", () => {
		expect(isExpiringSoon(new Date("2026-01-15T00:00:00.000Z"), 30, now)).toBe(true);
	});
	it("is soon when already expired", () => {
		expect(isExpiringSoon(new Date("2025-12-01T00:00:00.000Z"), 30, now)).toBe(true);
	});
});
