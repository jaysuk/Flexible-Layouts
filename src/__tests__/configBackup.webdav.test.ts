import { afterEach, describe, expect, it, vi } from "vitest";

import {
	deleteBackup, downloadBackup, listBackups, listMachineFolders, uploadBackup, verifyConnection, WebDavError,
} from "../model/configBackup/destinations/webdav";

const BASE = "http://nas.local/remote.php/webdav";

function multistatus(entries: Array<{ href: string; collection?: boolean; size?: number; modified?: string }>): string {
	const items = entries.map((e) => `
		<d:response>
			<d:href>${e.href}</d:href>
			<d:propstat><d:prop>
				${e.collection ? "<d:resourcetype><d:collection/></d:resourcetype>" : "<d:resourcetype/>"}
				${e.size != null ? `<d:getcontentlength>${e.size}</d:getcontentlength>` : ""}
				${e.modified ? `<d:getlastmodified>${e.modified}</d:getlastmodified>` : ""}
			</d:prop></d:propstat>
		</d:response>`).join("");
	return `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${items}</d:multistatus>`;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("verifyConnection", () => {
	it("resolves on a successful PROPFIND", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 207 } as Response)));
		await expect(verifyConnection(BASE, "user", "pass")).resolves.toBeUndefined();
	});

	it("throws a clear error on bad credentials", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 } as Response)));
		await expect(verifyConnection(BASE, "user", "wrong")).rejects.toThrow(/Sign-in rejected/);
	});

	it("wraps a network failure (unreachable server) in a clear error", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
		await expect(verifyConnection(BASE, "user", "pass")).rejects.toThrow(WebDavError);
	});
});

describe("listBackups", () => {
	it("parses a multistatus response, skipping the folder's own entry and any subfolders", async () => {
		const xml = multistatus([
			{ href: "/remote.php/webdav/Duet%20Config%20Backups/voron24/", collection: true },
			{ href: "/remote.php/webdav/Duet%20Config%20Backups/voron24/backup-1.zip", size: 12345, modified: "Mon, 01 Jan 2026 00:00:00 GMT" },
			{ href: "/remote.php/webdav/Duet%20Config%20Backups/voron24/sub", collection: true },
		]);
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 207, text: async () => xml } as unknown as Response)));
		const backups = await listBackups(BASE, "user", "pass", "voron24");
		expect(backups).toHaveLength(1);
		expect(backups[0].name).toBe("backup-1.zip");
		expect(backups[0].size).toBe(12345);
	});

	it("returns an empty list (not an error) when the machine folder doesn't exist yet", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 } as Response)));
		const backups = await listBackups(BASE, "user", "pass", "voron24");
		expect(backups).toEqual([]);
	});
});

describe("listMachineFolders", () => {
	it("returns only the machine subfolders, skipping the root's own entry", async () => {
		const xml = multistatus([
			{ href: "/remote.php/webdav/Duet%20Config%20Backups/", collection: true },
			{ href: "/remote.php/webdav/Duet%20Config%20Backups/voron24/", collection: true },
			{ href: "/remote.php/webdav/Duet%20Config%20Backups/old-mainboard/", collection: true },
		]);
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 207, text: async () => xml } as unknown as Response)));
		expect(await listMachineFolders(BASE, "user", "pass")).toEqual(["voron24", "old-mainboard"]);
	});

	it("returns an empty list when nothing has been backed up yet", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 } as Response)));
		expect(await listMachineFolders(BASE, "user", "pass")).toEqual([]);
	});
});

describe("uploadBackup", () => {
	it("creates the root and machine folders (tolerating already-exists) then PUTs the file", async () => {
		const calls: Array<string> = [];
		vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
			calls.push(`${init?.method} ${decodeURIComponent(url)}`);
			if (init?.method === "MKCOL") { return { ok: false, status: 405 } as Response; } // already exists
			return { ok: true, status: 201 } as Response;
		}));
		await uploadBackup(BASE, "user", "pass", "voron24", "backup.zip", new Blob(["zip"]));
		expect(calls).toEqual([
			`MKCOL ${BASE}/Duet Config Backups`,
			`MKCOL ${BASE}/Duet Config Backups/voron24`,
			`PUT ${BASE}/Duet Config Backups/voron24/backup.zip`,
		]);
	});

	it("sanitises the hostname for the folder path", async () => {
		const calls: Array<string> = [];
		vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
			calls.push(decodeURIComponent(url));
			return { ok: true, status: 201 } as Response;
		}));
		await uploadBackup(BASE, "user", "pass", "My Printer!", "backup.zip", new Blob(["zip"]));
		expect(calls).toContain(`${BASE}/Duet Config Backups/My_Printer_`);
	});
});

describe("downloadBackup / deleteBackup", () => {
	it("downloads by absolute href", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(["data"]) } as unknown as Response)));
		const blob = await downloadBackup(BASE, "user", "pass", "http://nas.local/remote.php/webdav/Duet%20Config%20Backups/voron24/a.zip");
		expect(await blob.text()).toBe("data");
	});

	it("deletes and tolerates an already-gone (404) file", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 } as Response)));
		await expect(deleteBackup(BASE, "user", "pass", "/Duet Config Backups/voron24/a.zip")).resolves.toBeUndefined();
	});
});
