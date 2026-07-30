/**
 * Reads the "not after" (expiry) date out of an existing PEM certificate - a much smaller, lower-risk
 * task than building one (pure decoding of a well-known fixed structure, no signing/encoding
 * correctness to get wrong). Reuses the same @peculiar/asn1-x509 schema as certGenerate.ts.
 */
import { AsnParser } from "@peculiar/asn1-schema";
import { Certificate } from "@peculiar/asn1-x509";

function pemToDer(pem: string): Uint8Array {
	const base64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
	return bytes;
}

/** Returns null (never throws) if the PEM can't be parsed as an X.509 certificate - expiry checking
 * should degrade gracefully, not break the rest of the flow over a malformed/missing file. */
export function parseCertExpiry(certPem: string): Date | null {
	try {
		const der = pemToDer(certPem);
		const cert = AsnParser.parse(der, Certificate);
		return cert.tbsCertificate.validity.notAfter.getTime();
	} catch {
		return null;
	}
}

export function isExpiringSoon(notAfter: Date, warningDays: number, now: number = Date.now()): boolean {
	return notAfter.getTime() - now <= warningDays * 24 * 60 * 60 * 1000;
}
