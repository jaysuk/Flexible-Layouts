import { beforeEach, describe, expect, it } from "vitest";

import {
	CREDENTIALS_SD_PATH, loadCredentialsFromSd, parseCredentialBundle, readCredentialsFromSd, writeCredentialsToSd,
} from "../model/configBackup/credentialsSdSync";
import {
	enableEncryption, getGithubSettings, isEncryptionEnabled, isSessionUnlocked, resetForTests,
	setGithubSettings, unlockSession,
} from "../model/configBackup/credentials";
import type { MachineIO } from "../model/configBackup/collect";

beforeEach(() => {
	resetForTests();
});

function fakeIo(files: Record<string, string> = {}): MachineIO & { uploaded: Record<string, string> } {
	const uploaded: Record<string, string> = {};
	return {
		uploaded,
		async getFileList() { return []; },
		async downloadText(filename) {
			if (filename in uploaded) { return uploaded[filename]; }
			if (filename in files) { return files[filename]; }
			throw new Error("not found");
		},
		async downloadBlob() { return new Blob(); },
		async upload(filename, content) { uploaded[filename] = await content.text(); },
		async deleteFile() { /* unused */ },
		async sendCode() { return ""; },
	};
}

describe("parseCredentialBundle", () => {
	it("accepts a well-formed bundle", () => {
		const json = JSON.stringify({ salt: "abc", canary: { iv: "x", ciphertext: "y" }, values: { github: { iv: "x", ciphertext: "y" } } });
		expect(parseCredentialBundle(json)).not.toBeNull();
	});
	it("rejects invalid JSON", () => {
		expect(parseCredentialBundle("{not json")).toBeNull();
	});
	it("rejects a JSON object missing required fields", () => {
		expect(parseCredentialBundle(JSON.stringify({ salt: "abc" }))).toBeNull();
		expect(parseCredentialBundle(JSON.stringify({ values: {} }))).toBeNull();
		expect(parseCredentialBundle("null")).toBeNull();
		expect(parseCredentialBundle('"just a string"')).toBeNull();
	});
});

describe("writeCredentialsToSd", () => {
	it("refuses to write when encryption isn't enabled - never puts plaintext on the SD card", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		const io = fakeIo();
		const result = await writeCredentialsToSd(io);
		expect(result).toBe("not-encrypted");
		expect(Object.keys(io.uploaded)).toHaveLength(0);
	});

	it("writes the encrypted bundle when encryption is enabled", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("passphrase");
		const io = fakeIo();
		const result = await writeCredentialsToSd(io);
		expect(result).toBe("written");
		expect(io.uploaded[CREDENTIALS_SD_PATH]).toBeDefined();
		expect(io.uploaded[CREDENTIALS_SD_PATH]).not.toContain("ghp_plain");
	});

	it("reports failure if the upload itself fails", async () => {
		await enableEncryption("passphrase");
		const io = fakeIo();
		io.upload = async () => { throw new Error("network error"); };
		expect(await writeCredentialsToSd(io)).toBe("failed");
	});
});

describe("readCredentialsFromSd / loadCredentialsFromSd", () => {
	it("returns null when there's nothing on the SD card", async () => {
		const io = fakeIo();
		expect(await readCredentialsFromSd(io)).toBeNull();
		expect(await loadCredentialsFromSd(io)).toBe(false);
	});

	it("round-trips: write on one 'browser', load + unlock on a fresh one", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("shared passphrase");
		const io = fakeIo();
		await writeCredentialsToSd(io);

		// Simulate a different browser with nothing stored locally yet.
		resetForTests();
		expect(getGithubSettings()).toBeNull();

		const loaded = await loadCredentialsFromSd(io);
		expect(loaded).toBe(true);
		expect(isEncryptionEnabled()).toBe(true);
		expect(isSessionUnlocked()).toBe(false); // loading the ciphertext doesn't unlock it

		const ok = await unlockSession("shared passphrase");
		expect(ok).toBe(true);
		expect(getGithubSettings()).toEqual({ token: "ghp_plain", repo: "user/repo", branch: "main" });
	});

	it("a wrong passphrase still fails after loading from SD, same as any other unlock attempt", async () => {
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		await enableEncryption("shared passphrase");
		const io = fakeIo();
		await writeCredentialsToSd(io);
		resetForTests();
		await loadCredentialsFromSd(io);
		expect(await unlockSession("wrong guess")).toBe(false);
	});
});
