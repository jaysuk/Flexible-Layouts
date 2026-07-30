/**
 * Cross-browser/cross-PC credential storage: the encrypted credential bundle written to the Duet's
 * own SD card, so a different browser (or a different PC) hitting the same printer can load it
 * without re-entering every token from scratch - it just needs the same passphrase.
 *
 * This is a REAL widening of exposure versus browser-only storage: anyone who can reach the
 * printer's web UI, or physically pull the card, can reach this file - a browser profile requires
 * that specific device. Only the ciphertext lives here; the passphrase itself is never written
 * anywhere (see credentials.ts) and is still required to actually use whatever gets loaded from it.
 * The user chose this trade-off explicitly (2026-07 session) - it must stay opt-in, never automatic.
 */
import type { MachineIO } from "./collect";
import { exportEncryptedBundle, importEncryptedBundle } from "./credentials";
import type { EncryptedCredentialBundle } from "./credentials";

export const CREDENTIALS_SD_PATH = "0:/sys/flexible-layouts.credentials.json";

/** Validate a bundle's shape before trusting it - this file could in principle have been hand-edited
 * or come from an incompatible future version. */
export function parseCredentialBundle(text: string): EncryptedCredentialBundle | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	const b = parsed as Partial<EncryptedCredentialBundle> | null;
	if (!b || typeof b !== "object") { return null; }
	if (typeof b.salt !== "string" || !b.salt) { return null; }
	if (!b.canary || typeof b.canary !== "object") { return null; }
	if (!b.values || typeof b.values !== "object") { return null; }
	return b as EncryptedCredentialBundle;
}

export type SdWriteResult = "written" | "not-encrypted" | "failed";

/** Push the current (already-encrypted) credential bundle to the SD card. Refuses outright if
 * encryption isn't enabled - this must never write plaintext tokens to the printer's storage. */
export async function writeCredentialsToSd(io: MachineIO): Promise<SdWriteResult> {
	const bundle = exportEncryptedBundle();
	if (!bundle) { return "not-encrypted"; }
	try {
		await io.upload(CREDENTIALS_SD_PATH, new Blob([JSON.stringify(bundle)], { type: "application/json" }));
		return "written";
	} catch {
		return "failed";
	}
}

/** Read whatever bundle is on the SD card, if any (null if absent/invalid - never throws). */
export async function readCredentialsFromSd(io: MachineIO): Promise<EncryptedCredentialBundle | null> {
	try {
		const text = await io.downloadText(CREDENTIALS_SD_PATH);
		return parseCredentialBundle(text);
	} catch {
		return null;
	}
}

/** Read the SD-stored bundle and import it wholesale into this browser's localStorage. Still LOCKED
 * afterwards - importing ciphertext isn't unlocking it, the passphrase is still required. Returns
 * false when there's nothing on the SD card to load. */
export async function loadCredentialsFromSd(io: MachineIO): Promise<boolean> {
	const bundle = await readCredentialsFromSd(io);
	if (!bundle) { return false; }
	importEncryptedBundle(bundle);
	return true;
}
