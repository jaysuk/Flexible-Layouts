/**
 * PURE hashing helpers. cyrb53 mirrors the algorithm already used for password hashing in
 * model/access.ts (accepted precedent in this codebase for a fast, well-distributed, non-crypto
 * hash) - used here as the SHA-256 fallback when `crypto.subtle` is unavailable (plain-HTTP origins
 * in some browsers - exactly how a Duet is normally served), and for the machine-key fallback for
 * Duet 2 boards whose `uniqueId` is null.
 */

/** cyrb53 - fast, well-distributed, non-cryptographic string hash. Returns a hex string. */
export function cyrb53(str: string, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function bytesToHex(bytes: ArrayBuffer): string {
	return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

let cachedHashAlgo: "sha256" | "cyrb53" | null = null;

/** Detect once per session whether `crypto.subtle` is usable on this origin. */
export async function detectHashAlgo(): Promise<"sha256" | "cyrb53"> {
	if (cachedHashAlgo) { return cachedHashAlgo; }
	try {
		await crypto.subtle.digest("SHA-256", new Uint8Array([0]));
		cachedHashAlgo = "sha256";
	} catch {
		cachedHashAlgo = "cyrb53";
	}
	return cachedHashAlgo;
}

/** Reset the cached detection (test-only escape hatch). */
export function resetHashAlgoCache(): void {
	cachedHashAlgo = null;
}

/** Hash raw bytes with the given algorithm, falling back to cyrb53 if SHA-256 throws mid-run. */
export async function hashBytes(bytes: Uint8Array, algo: "sha256" | "cyrb53"): Promise<string> {
	if (algo === "sha256") {
		try {
			const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
			return bytesToHex(digest);
		} catch {
			// fall through to cyrb53
		}
	}
	// cyrb53 operates on strings; treat the bytes as a Latin1-ish string for hashing purposes only
	// (this is a checksum, not a cryptographic guarantee - collisions are acceptable here).
	let s = "";
	for (let i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
	return cyrb53(s);
}
