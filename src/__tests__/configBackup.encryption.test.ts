import { describe, expect, it } from "vitest";

import {
	decryptValue, deriveKey, encryptValue, generateSalt, isCryptoAvailable, saltFromBase64, saltToBase64,
} from "../model/configBackup/encryption";

describe("isCryptoAvailable", () => {
	it("is true in this test environment", () => {
		expect(isCryptoAvailable()).toBe(true);
	});
});

describe("round-trip encryption", () => {
	it("decrypts back to the original plaintext with the right passphrase", async () => {
		const salt = generateSalt();
		const key = await deriveKey("correct horse battery staple", salt);
		const encrypted = await encryptValue(key, "ghp_supersecrettoken");
		const decrypted = await decryptValue(key, encrypted);
		expect(decrypted).toBe("ghp_supersecrettoken");
	});

	it("produces a different ciphertext each time (random IV) for the same plaintext", async () => {
		const salt = generateSalt();
		const key = await deriveKey("pw", salt);
		const a = await encryptValue(key, "same value");
		const b = await encryptValue(key, "same value");
		expect(a.ciphertext).not.toBe(b.ciphertext);
		expect(a.iv).not.toBe(b.iv);
	});

	it("fails to decrypt with the wrong passphrase", async () => {
		const salt = generateSalt();
		const key = await deriveKey("right passphrase", salt);
		const wrongKey = await deriveKey("wrong passphrase", salt);
		const encrypted = await encryptValue(key, "secret");
		await expect(decryptValue(wrongKey, encrypted)).rejects.toThrow();
	});

	it("fails to decrypt with the right passphrase but the wrong salt", async () => {
		const key = await deriveKey("pw", generateSalt());
		const otherKey = await deriveKey("pw", generateSalt());
		const encrypted = await encryptValue(key, "secret");
		await expect(decryptValue(otherKey, encrypted)).rejects.toThrow();
	});

	it("salt survives a base64 round-trip", async () => {
		const salt = generateSalt();
		const roundTripped = saltFromBase64(saltToBase64(salt));
		expect(Array.from(roundTripped)).toEqual(Array.from(salt));
	});

	it("handles unicode plaintext correctly", async () => {
		const salt = generateSalt();
		const key = await deriveKey("pw", salt);
		const encrypted = await encryptValue(key, "pässwörd 密码 🔒");
		expect(await decryptValue(key, encrypted)).toBe("pässwörd 密码 🔒");
	});
});
