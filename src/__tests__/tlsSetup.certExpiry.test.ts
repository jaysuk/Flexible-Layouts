import { describe, expect, it } from "vitest";

import { isExpiringSoon, parseCertExpiry } from "../model/tlsSetup/certExpiry";

// A real self-signed P-256 certificate (openssl, CN=duet3.local, notAfter 2036-08-24T07:55:32Z),
// checked in as a fixture. This used to be produced at test time by the in-browser generator; that
// feature is gone, and a static cert is the better test subject anyway - it pins the parser against
// a known-good OpenSSL encoding rather than against whatever we ourselves emitted.
const CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIBmDCCAT+gAwIBAgIUYgELDLc6tzth5zmnu2YsKjj8xzcwCgYIKoZIzj0EAwIw
FjEUMBIGA1UEAwwLZHVldDMubG9jYWwwHhcNMjYwODI3MDc1NTMyWhcNMzYwODI0
MDc1NTMyWjAWMRQwEgYDVQQDDAtkdWV0My5sb2NhbDBZMBMGByqGSM49AgEGCCqG
SM49AwEHA0IABIJrESavAr8IdPHv2K4CPSi/tM94Z0qzGVNepmOutMAE5hCRW+nq
mG4x5WhYEEdkbgI9mJ7Z85LW7dgW01GonyajazBpMB0GA1UdDgQWBBTGy9E0mWlc
MAkWLmG9+CH8QJXW/TAfBgNVHSMEGDAWgBTGy9E0mWlcMAkWLmG9+CH8QJXW/TAP
BgNVHRMBAf8EBTADAQH/MBYGA1UdEQQPMA2CC2R1ZXQzLmxvY2FsMAoGCCqGSM49
BAMCA0cAMEQCIBiQg+3ru3onaaxZ5DvpqRz6wcArsg5Zhmv9BMaDL1h2AiBHeG4D
pBzyfoRFsqN5dy6Y5IkciOoLcU70KUaVnco71A==
-----END CERTIFICATE-----
`;

describe("parseCertExpiry", () => {
	it("reads the notAfter date out of a real certificate", () => {
		const parsed = parseCertExpiry(CERT_PEM);
		expect(parsed).not.toBeNull();
		expect(parsed!.toISOString()).toBe("2036-08-24T07:55:32.000Z");
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
