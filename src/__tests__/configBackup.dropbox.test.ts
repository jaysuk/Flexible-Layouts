import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteBackup, downloadBackup, DropboxError, listBackups, listMachineFolders, uploadBackup, verifyToken } from "../model/configBackup/destinations/dropbox";

function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) } as unknown as Response;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("listBackups", () => {
	it("returns only files, mapped from the entries list", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
			entries: [
				{ ".tag": "file", path_lower: "/duet config backups/voron24/a.zip", name: "a.zip", size: 100, server_modified: "2026-01-01T00:00:00Z" },
				{ ".tag": "folder", path_lower: "/duet config backups/voron24/sub", name: "sub" },
			],
		})));
		const backups = await listBackups("tok", "voron24");
		expect(backups).toHaveLength(1);
		expect(backups[0].name).toBe("a.zip");
	});

	it("returns an empty list (not an error) when the machine folder doesn't exist yet", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error_summary: "path/not_found/..." }, 409)));
		const backups = await listBackups("tok", "voron24");
		expect(backups).toEqual([]);
	});

	it("still throws for a real error (e.g. bad token)", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error_summary: "invalid_access_token/..." }, 401)));
		await expect(listBackups("tok", "voron24")).rejects.toThrow(DropboxError);
	});
});

describe("listMachineFolders", () => {
	it("returns only folders under the shared root", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
			entries: [
				{ ".tag": "folder", name: "voron24" },
				{ ".tag": "folder", name: "old-mainboard" },
				{ ".tag": "file", name: "stray-file.txt" },
			],
		})));
		expect(await listMachineFolders("tok")).toEqual(["voron24", "old-mainboard"]);
	});

	it("returns an empty list when nothing has ever been backed up", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error_summary: "path/not_found/..." }, 409)));
		expect(await listMachineFolders("tok")).toEqual([]);
	});
});

describe("uploadBackup", () => {
	it("uploads to the per-hostname folder with the right API args", async () => {
		let capturedArg: any;
		vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
			capturedArg = JSON.parse((init.headers as Record<string, string>)["Dropbox-API-Arg"]);
			return jsonResponse({ path_lower: "/duet config backups/voron24/backup.zip", name: "backup.zip", size: 10, server_modified: "t" });
		}));
		await uploadBackup("tok", "voron24", "backup.zip", new Blob(["zip"]));
		expect(capturedArg.path).toBe("/Duet Config Backups/voron24/backup.zip");
		expect(capturedArg.mode).toBe("add");
	});

	it("sanitises the hostname for the folder path", async () => {
		let capturedArg: any;
		vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
			capturedArg = JSON.parse((init.headers as Record<string, string>)["Dropbox-API-Arg"]);
			return jsonResponse({ path_lower: "x", name: "x", size: 0, server_modified: "t" });
		}));
		await uploadBackup("tok", "My Printer!", "backup.zip", new Blob(["zip"]));
		expect(capturedArg.path).toBe("/Duet Config Backups/My_Printer_/backup.zip");
	});
});

describe("downloadBackup / deleteBackup / verifyToken", () => {
	it("downloads a blob", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["data"]) } as unknown as Response)));
		const blob = await downloadBackup("tok", "/duet config backups/voron24/a.zip");
		expect(await blob.text()).toBe("data");
	});

	it("deletes by path", async () => {
		const fetchSpy = vi.fn(async () => jsonResponse({}));
		vi.stubGlobal("fetch", fetchSpy);
		await deleteBackup("tok", "/duet config backups/voron24/a.zip");
		expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/files/delete_v2"), expect.anything());
	});

	it("verifies a token via the account endpoint", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ name: { display_name: "James" } })));
		expect(await verifyToken("tok")).toBe("James");
	});

	it("throws a clear error for a bad token", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error_summary: "invalid_access_token/..." }, 401)));
		await expect(verifyToken("bad")).rejects.toThrow(DropboxError);
	});
});
