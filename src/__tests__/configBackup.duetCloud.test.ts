import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteBackup, DuetCloudError, listBackups, listMachines, login, preflightSize, pruneToLimit, uploadBackup } from "../model/configBackup/destinations/duetCloud";
import { setDuetCloudSession } from "../model/configBackup/credentials";
import { DUET_UPLOAD_MAX_BYTES } from "../model/configBackup/constants";

const API = "https://backup.example.com";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
	return { ok, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) } as unknown as Response;
}

beforeEach(() => {
	setDuetCloudSession({ token: "tok", username: "james", expiresAt: Date.now() + 1000000 });
});
afterEach(() => {
	vi.unstubAllGlobals();
	setDuetCloudSession(null);
});

describe("preflightSize", () => {
	it("passes a blob under the 2 MB cap", () => {
		const result = preflightSize(new Blob([new Uint8Array(1024)]));
		expect(result.ok).toBe(true);
		expect(result.limit).toBe(DUET_UPLOAD_MAX_BYTES);
	});
	it("fails a blob over the 2 MB cap", () => {
		const result = preflightSize(new Blob([new Uint8Array(DUET_UPLOAD_MAX_BYTES + 1)]));
		expect(result.ok).toBe(false);
	});
});

describe("uploadBackup", () => {
	it("refuses to POST an over-cap blob (never a blind upload)", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const big = new Blob([new Uint8Array(DUET_UPLOAD_MAX_BYTES + 1)]);
		await expect(uploadBackup(API, big, { machine: "m", hostname: "h", guid: "g" })).rejects.toThrow(DuetCloudError);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("sends the file with a .zip name and application/zip type", async () => {
		let capturedForm: FormData | undefined;
		vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
			capturedForm = init.body as FormData;
			return jsonResponse({ entry: { incr_id: 1, timestamp: "t", machine: "m", machine_hostname: "h", board_guid: "g" } });
		}));
		await uploadBackup(API, new Blob(["ok"]), { machine: "m", hostname: "h", guid: "g" });
		const file = capturedForm!.get("file") as File;
		expect(file.name).toBe("backup.zip");
		expect(file.type).toBe("application/zip");
	});
});

describe("login", () => {
	it("stores the session token on success", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ logged_in: true, token: "abc", username: "james" })));
		const session = await login(API, "james@example.com", "pw");
		expect(session.token).toBe("abc");
	});

	it("throws on failed login without leaking the raw response", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(false, false, 401)));
		await expect(login(API, "james@example.com", "wrong")).rejects.toThrow(/Sign in failed/);
	});
});

describe("deleteBackup - tolerates the backend's buggy 500-on-success", () => {
	it("treats a 500 as success if the backup is actually gone afterwards", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/api/delete-backup-by-id/")) { return jsonResponse("Requested content not found!", false, 500); }
			if (url.includes("/api/get-backup-list-by-guid/")) { return jsonResponse([]); } // now empty - it WAS deleted
			throw new Error("unexpected url " + url);
		}));
		const ok = await deleteBackup(API, 1, "guid-1");
		expect(ok).toBe(true);
	});

	it("treats a 500 as real failure if the backup is still listed afterwards", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/api/delete-backup-by-id/")) { return jsonResponse("error", false, 500); }
			if (url.includes("/api/get-backup-list-by-guid/")) { return jsonResponse([{ incr_id: 1, timestamp: "t", machine: "m", machine_hostname: "h", board_guid: "guid-1" }]); }
			throw new Error("unexpected url " + url);
		}));
		const ok = await deleteBackup(API, 1, "guid-1");
		expect(ok).toBe(false);
	});

	it("returns true immediately on a real 2xx", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
		const ok = await deleteBackup(API, 1, "guid-1");
		expect(ok).toBe(true);
	});
});

describe("pruneToLimit - FIFO ordering", () => {
	it("deletes only the oldest entries beyond the limit", async () => {
		const backups = [
			{ incr_id: 1, timestamp: "2026-01-01T00:00:00Z", machine: "m", machine_hostname: "h", board_guid: "g" },
			{ incr_id: 2, timestamp: "2026-01-02T00:00:00Z", machine: "m", machine_hostname: "h", board_guid: "g" },
			{ incr_id: 3, timestamp: "2026-01-03T00:00:00Z", machine: "m", machine_hostname: "h", board_guid: "g" },
		];
		const deleted: Array<number> = [];
		vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === "DELETE") {
				const id = Number(url.split("/").pop());
				deleted.push(id);
				return jsonResponse({});
			}
			return jsonResponse(backups);
		}));
		const result = await pruneToLimit(API, "g", 1); // keep only the newest 1
		expect(result.prunedIds.sort()).toEqual([1, 2]);
		expect(deleted.sort()).toEqual([1, 2]);
	});

	it("prunes nothing when under the limit", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ incr_id: 1, timestamp: "2026-01-01T00:00:00Z", machine: "m", machine_hostname: "h", board_guid: "g" }])));
		const result = await pruneToLimit(API, "g", 5);
		expect(result.prunedIds).toEqual([]);
	});
});

describe("listBackups - falls back when the guid-scoped route isn't deployed", () => {
	const flatList = [
		{ incr_id: 1, timestamp: "2026-01-01T00:00:00Z", machine: "m1", machine_hostname: "voron24", board_guid: "guid-a" },
		{ incr_id: 2, timestamp: "2026-01-02T00:00:00Z", machine: "m1", machine_hostname: "voron24", board_guid: "guid-a" },
		{ incr_id: 3, timestamp: "2026-01-03T00:00:00Z", machine: "m2", machine_hostname: "other", board_guid: "guid-b" },
	];

	it("falls back to /api/get-backup-list and filters by guid when the scoped route 404s", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/api/get-backup-list-by-guid/")) { return jsonResponse({}, false, 404); }
			if (url.includes("/api/get-backup-list")) { return jsonResponse(flatList); }
			throw new Error("unexpected url " + url);
		}));
		const result = await listBackups(API, "guid-a");
		expect(result.map((b) => b.id)).toEqual([1, 2]);
	});

	it("still throws for a real error status from the scoped route", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 500)));
		await expect(listBackups(API, "g")).rejects.toThrow(DuetCloudError);
	});

	it("still throws if the fallback flat list also fails", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/api/get-backup-list-by-guid/")) { return jsonResponse({}, false, 404); }
			return jsonResponse({}, false, 500);
		}));
		await expect(listBackups(API, "guid-a")).rejects.toThrow(DuetCloudError);
	});
});

describe("listMachines - falls back when get-machine-list isn't deployed", () => {
	it("groups the flat backup list by guid, picking the newest entry per machine", async () => {
		const flatList = [
			{ incr_id: 1, timestamp: "2026-01-01T00:00:00Z", machine: "m1", machine_hostname: "voron24", board_guid: "guid-a" },
			{ incr_id: 2, timestamp: "2026-01-02T00:00:00Z", machine: "m1", machine_hostname: "voron24", board_guid: "guid-a" },
			{ incr_id: 3, timestamp: "2026-01-03T00:00:00Z", machine: "m2", machine_hostname: "other", board_guid: "guid-b" },
		];
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/api/get-machine-list")) { return jsonResponse({}, false, 404); }
			if (url.includes("/api/get-backup-list")) { return jsonResponse(flatList); }
			throw new Error("unexpected url " + url);
		}));
		const result = await listMachines(API);
		expect(result.sort((a, b) => a.boardGuid.localeCompare(b.boardGuid))).toEqual([
			{ boardGuid: "guid-a", machineHostname: "voron24", backupCount: 2, latestBackupDate: "2026-01-02T00:00:00Z", latestBackupId: 2 },
			{ boardGuid: "guid-b", machineHostname: "other", backupCount: 1, latestBackupDate: "2026-01-03T00:00:00Z", latestBackupId: 3 },
		]);
	});
});

describe("pruneToLimit - falls back correctly for a machine the scoped route doesn't know", () => {
	it("prunes nothing when the fallback flat list has no entries for this guid", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			if (url.includes("/api/get-backup-list-by-guid/")) { return jsonResponse({}, false, 404); }
			return jsonResponse([]);
		}));
		const result = await pruneToLimit(API, "brand-new-guid", 5);
		expect(result).toEqual({ prunedIds: [], failedIds: [] });
	});
});

describe("mixed-content detection", () => {
	it("refuses an http:// API from an https:// page", async () => {
		vi.stubGlobal("location", { protocol: "https:" });
		await expect(listBackups("http://insecure.example.com", "g")).rejects.toThrow(/HTTPS/);
	});
});
