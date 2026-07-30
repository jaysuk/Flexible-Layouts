import { beforeEach, describe, expect, it } from "vitest";

import {
	disableEncryption, enableEncryption, exportEncryptedBundle, getGithubSettings, importEncryptedBundle,
	isEncryptionEnabled, isSessionUnlocked, lockSession, resetForTests, setGithubSettings, unlockSession,
} from "../model/configBackup/credentials";

beforeEach(() => {
	resetForTests();
});

describe("enableEncryption", () => {
	it("migrates an existing plaintext credential to encrypted storage and unlocks the session", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		expect(isEncryptionEnabled()).toBe(true);
		expect(isSessionUnlocked()).toBe(true);
		expect(getGithubSettings()).toEqual({ token: "ghp_plain", repo: "user/repo", branch: "main" });
	});

	it("the stored form is ciphertext, not the plaintext token/repo", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		const bundle = exportEncryptedBundle()!;
		const stored = JSON.stringify(bundle.values.github);
		expect(stored).not.toContain("ghp_plain");
		expect(stored).not.toContain("user/repo");
		expect(bundle.values.github).toHaveProperty("ciphertext");
		expect(bundle.values.github).toHaveProperty("iv");
	});

	it("works with nothing saved yet", async () => {
		await enableEncryption("my passphrase");
		expect(isEncryptionEnabled()).toBe(true);
		expect(getGithubSettings()).toBeNull();
	});
});

describe("lock / unlock", () => {
	it("locking clears the in-memory cache so getters see nothing until unlocked again", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		lockSession();
		expect(isSessionUnlocked()).toBe(false);
		expect(getGithubSettings()).toBeNull();
	});

	it("unlocking with the correct passphrase restores access", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		lockSession();
		const ok = await unlockSession("my passphrase");
		expect(ok).toBe(true);
		expect(getGithubSettings()).toEqual({ token: "ghp_plain", repo: "user/repo", branch: "main" });
	});

	it("unlocking with the wrong passphrase fails and leaves the session locked", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		lockSession();
		const ok = await unlockSession("wrong passphrase");
		expect(ok).toBe(false);
		expect(isSessionUnlocked()).toBe(false);
		expect(getGithubSettings()).toBeNull();
	});

	it("unlocking when encryption was never enabled fails cleanly", async () => {
		const ok = await unlockSession("anything");
		expect(ok).toBe(false);
	});
});

describe("writes while encrypted", () => {
	it("saving while unlocked updates both the readable cache and the persisted ciphertext", async () => {
		await enableEncryption("my passphrase");
		setGithubSettings({ token: "ghp_new", repo: "user/repo2", branch: "dev" });
		expect(getGithubSettings()).toEqual({ token: "ghp_new", repo: "user/repo2", branch: "dev" });
		lockSession();
		await unlockSession("my passphrase");
		expect(getGithubSettings()).toEqual({ token: "ghp_new", repo: "user/repo2", branch: "dev" });
	});

	it("saving while locked is a silent no-op (UI must gate this on isSessionUnlocked)", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		lockSession();
		setGithubSettings({ token: "ghp_should_not_save", repo: "x", branch: "main" });
		await unlockSession("my passphrase");
		expect(getGithubSettings()).toEqual({ token: "ghp_plain", repo: "user/repo", branch: "main" });
	});
});

describe("disableEncryption", () => {
	it("decrypts everything back to plaintext and getters work without unlocking afterwards", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		await disableEncryption();
		expect(isEncryptionEnabled()).toBe(false);
		expect(getGithubSettings()).toEqual({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		expect(exportEncryptedBundle()).toBeNull(); // no longer encrypted, nothing to export as ciphertext
	});

	it("refuses to run while locked (would silently lose whatever's in the locked ciphertext)", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("my passphrase");
		lockSession();
		await expect(disableEncryption()).rejects.toThrow();
	});
});

describe("exportEncryptedBundle / importEncryptedBundle (SD sync building blocks)", () => {
	it("round-trips: export, wipe local state, import, unlock with the same passphrase", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("shared passphrase");
		const bundle = exportEncryptedBundle();
		expect(bundle).not.toBeNull();

		// Simulate a fresh browser: wipe everything, then import just the bundle.
		resetForTests();
		expect(getGithubSettings()).toBeNull();

		importEncryptedBundle(bundle!);
		expect(isEncryptionEnabled()).toBe(true);
		expect(isSessionUnlocked()).toBe(false); // still locked - importing ciphertext isn't unlocking it

		const ok = await unlockSession("shared passphrase");
		expect(ok).toBe(true);
		expect(getGithubSettings()).toEqual({ token: "ghp_plain", repo: "user/repo", branch: "main" });
	});

	it("returns null when encryption isn't enabled - nothing sensitive to export as plaintext by accident", () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		expect(exportEncryptedBundle()).toBeNull();
	});
});
