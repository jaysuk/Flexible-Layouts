/**
 * PURE encryption primitives (Web Crypto: PBKDF2 -> AES-256-GCM) for the config-backup credential
 * store (§6 Phase 5 extension). This module knows nothing about localStorage/SD/what's being
 * encrypted - it just turns a passphrase + plaintext into ciphertext and back.
 *
 * The whole point is that the derived key is NEVER stored anywhere, only held in memory for the
 * browser session (see credentials.ts's session lock/unlock) - so encrypting with a key that's also
 * sitting in localStorage next to the ciphertext would be theatre. Forgetting the passphrase means
 * the credentials are genuinely unrecoverable, same as a password manager's master password.
 */

/** OWASP's current PBKDF2-HMAC-SHA256 recommendation (2023). Client-side, this costs well under a
 * second on any device capable of running a modern browser - the cost is deliberate (slows down an
 * offline brute-force of a stolen ciphertext+salt pair). */
const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM's recommended nonce size

export function isCryptoAvailable(): boolean {
	try {
		return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
	} catch {
		return false;
	}
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
	return btoa(binary);
}
function fromBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
	return bytes;
}

export function generateSalt(): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}
export function saltToBase64(salt: Uint8Array): string { return toBase64(salt); }
export function saltFromBase64(b64: string): Uint8Array { return fromBase64(b64); }

/** Derive an AES-256-GCM key from a passphrase + salt. Never cache the passphrase itself - cache
 * this returned key (in memory only) for the session instead. */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export interface EncryptedValue { iv: string; ciphertext: string }

export async function encryptValue(key: CryptoKey, plaintext: string): Promise<EncryptedValue> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
	return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

/** Throws if the key is wrong (AES-GCM's authentication tag fails to verify) or the value is corrupt. */
export async function decryptValue(key: CryptoKey, value: EncryptedValue): Promise<string> {
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64(value.iv) as BufferSource },
		key,
		fromBase64(value.ciphertext) as BufferSource,
	);
	return new TextDecoder().decode(plaintext);
}
