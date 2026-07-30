/**
 * In-browser self-signed EC certificate generation, as an optional fast path alongside the guided
 * `openssl` walkthrough (see docs/tls-setup.md). Only usable in a secure context (`crypto.subtle`
 * requires HTTPS/localhost) - the same restriction that already gates the optional credential
 * encryption feature elsewhere in this plugin.
 *
 * Uses Web Crypto for the actual key generation/signing (native, audited, no reason to reinvent it),
 * plus @peculiar/asn1-x509 + @peculiar/asn1-ecc for the X.509 ASN.1 structure - a maintained ASN.1
 * schema/serialization library rather than a hand-rolled DER encoder, since getting certificate
 * encoding subtly wrong is exactly the kind of mistake that's easy to make and hard to notice (it
 * might "work" against one parser and fail confusingly against RRF's mbedTLS). The API surface used
 * here (Certificate/TBSCertificate/Validity/Name/SubjectPublicKeyInfo/Extension/GeneralName/
 * ECDSASigValue) was read directly from the installed package's type declarations, not assumed.
 */
import { AsnParser, AsnSerializer, OctetString } from "@peculiar/asn1-schema";
import {
	Certificate, Extension, Extensions, Name, RelativeDistinguishedName,
	AttributeTypeAndValue, AttributeValue, SubjectPublicKeyInfo, TBSCertificate, Validity,
	Version, GeneralName,
} from "@peculiar/asn1-x509";
import { SubjectAlternativeName, id_ce_subjectAltName } from "@peculiar/asn1-x509";
import { ECDSASigValue, ecdsaWithSHA256 } from "@peculiar/asn1-ecc";

const COMMON_NAME_OID = "2.5.4.3"; // id-at-commonName

export function isSecureContextAvailable(): boolean {
	try {
		return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof crypto.subtle.generateKey === "function";
	} catch {
		return false;
	}
}

function buildCommonNameOnly(hostname: string): Name {
	const attr = new AttributeTypeAndValue({ type: COMMON_NAME_OID, value: new AttributeValue({ utf8String: hostname }) });
	return new Name([new RelativeDistinguishedName([attr])]);
}

function buildSanExtension(hostname: string, ip: string | null): Extension {
	const names: Array<GeneralName> = [new GeneralName({ dNSName: hostname })];
	if (ip) { names.push(new GeneralName({ iPAddress: ip })); }
	const sanDer = AsnSerializer.serialize(new SubjectAlternativeName(names));
	return new Extension({ extnID: id_ce_subjectAltName, critical: false, extnValue: new OctetString(sanDer) });
}

/** Web Crypto's ECDSA signatures are raw r||s (IEEE P1363), each half-length equal to the curve's
 * order size in bytes - X.509 needs them DER-encoded as an ECDSA-Sig-Value SEQUENCE instead. */
function rawSignatureToDer(raw: ArrayBuffer): ArrayBuffer {
	const bytes = new Uint8Array(raw);
	const half = bytes.length / 2;
	const r = bytes.slice(0, half).buffer;
	const s = bytes.slice(half).buffer;
	return AsnSerializer.serialize(new ECDSASigValue({ r, s }));
}

function derToPem(der: ArrayBuffer, label: string): string {
	const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
	const lines = base64.match(/.{1,64}/g) ?? [base64];
	return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function randomSerialNumber(): ArrayBuffer {
	// A DER INTEGER must be non-negative, so force the leading byte's top bit to 0.
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	bytes[0] &= 0x7f;
	return bytes.buffer;
}

export interface GenerateCertOptions {
	hostname: string;
	ip?: string | null;
	validityDays?: number;
}

export interface GeneratedCert {
	keyPem: string;
	certPem: string;
	notAfter: Date;
}

/** Generates a self-signed EC P-256 certificate (CN + optional IP in subjectAltName, ecdsa-with-SHA256
 * signature) and its matching private key, both in PEM. Throws if `crypto.subtle` isn't available -
 * callers must check `isSecureContextAvailable()` first. */
export async function generateSelfSignedCert(opts: GenerateCertOptions): Promise<GeneratedCert> {
	const validityDays = opts.validityDays ?? 3650;
	const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const publicKeyDer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
	const privateKeyDer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

	const notBefore = new Date();
	const notAfter = new Date(notBefore.getTime() + validityDays * 24 * 60 * 60 * 1000);
	const name = buildCommonNameOnly(opts.hostname);

	const tbs = new TBSCertificate({
		version: Version.v3,
		serialNumber: randomSerialNumber(),
		signature: ecdsaWithSHA256,
		issuer: name,
		validity: new Validity({ notBefore, notAfter }),
		subject: name,
		subjectPublicKeyInfo: AsnParser.parse(publicKeyDer, SubjectPublicKeyInfo),
		extensions: new Extensions([buildSanExtension(opts.hostname, opts.ip ?? null)]),
	});
	const tbsDer = AsnSerializer.serialize(tbs);
	const rawSignature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, tbsDer);

	const cert = new Certificate({
		tbsCertificate: tbs,
		signatureAlgorithm: ecdsaWithSHA256,
		signatureValue: rawSignatureToDer(rawSignature),
	});
	const certDer = AsnSerializer.serialize(cert);

	return {
		keyPem: derToPem(privateKeyDer, "PRIVATE KEY"),
		certPem: derToPem(certDer, "CERTIFICATE"),
		notAfter,
	};
}
