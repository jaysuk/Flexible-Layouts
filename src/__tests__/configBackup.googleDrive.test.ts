import { afterEach, describe, expect, it, vi } from "vitest";

import { isOriginSupported, signIn, uploadBackup } from "../model/configBackup/destinations/googleDrive";

function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("isOriginSupported", () => {
	it("allows https origins", () => {
		expect(isOriginSupported({ protocol: "https:", hostname: "myprinter.example.com" })).toBe(true);
	});
	it("allows localhost even over http", () => {
		expect(isOriginSupported({ protocol: "http:", hostname: "localhost" })).toBe(true);
	});
	it("refuses a plain-http printer IP - the common Duet case", () => {
		expect(isOriginSupported({ protocol: "http:", hostname: "192.168.1.50" })).toBe(false);
	});
});

describe("signIn", () => {
	it("refuses outright on an unsupported origin, without attempting to load Google's script", async () => {
		vi.stubGlobal("location", { protocol: "http:", hostname: "192.168.1.50" });
		await expect(signIn("client-id")).rejects.toThrow(/HTTPS/);
	});
});

describe("uploadBackup", () => {
	it("creates the backup root folder, the per-hostname folder, then uploads", async () => {
		const calls: Array<string> = [];
		vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
			if (url.includes("/files?q=")) { return jsonResponse({ files: [] }); } // no existing folder either time
			if (url.includes("/upload/drive/v3/files")) { return jsonResponse({ id: "file-1", webViewLink: "https://drive.google.com/x" }); }
			return jsonResponse({ id: "folder-id" });
		}));
		const result = await uploadBackup("token", "voron24", "backup.zip", new Blob(["zip"]));
		expect(result.fileId).toBe("file-1");
		expect(calls.filter((c) => c.startsWith("POST") && c.endsWith("googleapis.com/drive/v3/files"))).toHaveLength(2); // 2 folders created
	});

	it("reuses an existing folder instead of creating a duplicate", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/files?q=")) { return jsonResponse({ files: [{ id: "existing-folder", name: "x" }] }); }
			if (url.includes("/upload/")) { return jsonResponse({ id: "file-1" }); }
			throw new Error("should not create a folder when one already exists: " + url);
		}));
		const result = await uploadBackup("token", "voron24", "backup.zip", new Blob(["zip"]));
		expect(result.fileId).toBe("file-1");
	});
});
