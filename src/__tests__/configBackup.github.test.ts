import { afterEach, describe, expect, it, vi } from "vitest";

import {
	downloadBackupAtCommit, GithubError, isRepoPrivate, listBackupHistory, listMachineFolders, pushBackup,
} from "../model/configBackup/destinations/github";

function jsonResponse(body: unknown, status = 200): Response {
	return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("isRepoPrivate", () => {
	it("returns true for a private repo", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ private: true })));
		expect(await isRepoPrivate("tok", "user/repo")).toBe(true);
	});
	it("returns false for a public repo", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ private: false })));
		expect(await isRepoPrivate("tok", "user/repo")).toBe(false);
	});
	it("returns null when the repo can't be seen", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Not Found" }, 404)));
		expect(await isRepoPrivate("tok", "user/repo")).toBeNull();
	});
});

describe("pushBackup", () => {
	it("creates blobs, then a tree, then a commit, then updates the ref, in order", async () => {
		const calls: Array<string> = [];
		vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
			const path = url.replace("https://api.github.com", "");
			calls.push(`${init?.method ?? "GET"} ${path}`);
			if (path.includes("/git/ref/heads/")) { return jsonResponse({ object: { sha: "parent-sha" } }); }
			if (path.includes("/git/commits/parent-sha")) { return jsonResponse({ tree: { sha: "base-tree-sha" } }); }
			if (path.endsWith("/git/blobs")) { return jsonResponse({ sha: "blob-sha" }); }
			if (path.endsWith("/git/trees")) { return jsonResponse({ sha: "tree-sha" }); }
			if (path.endsWith("/git/commits")) { return jsonResponse({ sha: "new-commit-sha" }); }
			if (path.includes("/git/refs/heads/")) { return jsonResponse({}); }
			throw new Error("unexpected " + path);
		}));
		const result = await pushBackup({
			token: "tok", repo: "user/repo", branch: "main", machineFolder: "voron24",
			files: [{ path: "sys/config.g", content: "M550", binary: false }],
			zip: { path: "backup.zip", blob: new Blob(["zipdata"]) },
			message: "Config backup voron24",
		});
		expect(result.sha).toBe("new-commit-sha");
		expect(calls).toEqual([
			"GET /repos/user/repo/git/ref/heads/main",
			"GET /repos/user/repo/git/commits/parent-sha",
			"POST /repos/user/repo/git/blobs", // config.g
			"POST /repos/user/repo/git/blobs", // zip
			"POST /repos/user/repo/git/trees",
			"POST /repos/user/repo/git/commits",
			"PATCH /repos/user/repo/git/refs/heads/main",
		]);
	});

	it("creates the branch ref (instead of PATCHing) when the repo has no commits yet", async () => {
		let createdRef: string | undefined;
		vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
			const path = url.replace("https://api.github.com", "");
			if (path.includes("/git/ref/heads/")) { return jsonResponse({ message: "Not Found" }, 404); }
			if (path.endsWith("/git/blobs")) { return jsonResponse({ sha: "blob-sha" }); }
			if (path.endsWith("/git/trees")) { return jsonResponse({ sha: "tree-sha" }); }
			if (path.endsWith("/git/commits")) { return jsonResponse({ sha: "first-commit-sha" }); }
			if (path.endsWith("/git/refs")) { createdRef = JSON.parse(init!.body as string).ref; return jsonResponse({}); }
			throw new Error("unexpected " + path);
		}));
		const result = await pushBackup({
			token: "tok", repo: "user/repo", branch: "main", machineFolder: "voron24",
			files: [], zip: { path: "backup.zip", blob: new Blob(["zipdata"]) }, message: "first",
		});
		expect(result.sha).toBe("first-commit-sha");
		expect(createdRef).toBe("refs/heads/main");
	});

	it("surfaces a clear error for a repo the token can't access", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Not Found" }, 404)));
		await expect(pushBackup({
			token: "tok", repo: "user/repo", branch: "main", machineFolder: "m",
			files: [], zip: { path: "backup.zip", blob: new Blob([]) }, message: "x",
		})).rejects.toThrow(GithubError);
	});
});

describe("listMachineFolders", () => {
	it("returns only directories under machines/", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([
			{ type: "dir", name: "voron24" },
			{ type: "dir", name: "old-mainboard" },
			{ type: "file", name: "README.md" },
		])));
		expect(await listMachineFolders("tok", "user/repo", "main")).toEqual(["voron24", "old-mainboard"]);
	});

	it("returns an empty list when nothing has ever been pushed", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ message: "Not Found" }, 404)));
		expect(await listMachineFolders("tok", "user/repo", "main")).toEqual([]);
	});
});

describe("listBackupHistory", () => {
	it("maps commits touching this machine's backup.zip, newest first", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			expect(url).toContain("path=machines%2Fvoron24%2Fbackup.zip");
			return jsonResponse([
				{ sha: "sha2", commit: { message: "Config backup voron24 2026-07-26", author: { date: "2026-07-26T00:00:00Z" } } },
				{ sha: "sha1", commit: { message: "Config backup voron24 2026-07-01", author: { date: "2026-07-01T00:00:00Z" } } },
			]);
		}));
		const history = await listBackupHistory("tok", "user/repo", "main", "voron24");
		expect(history).toEqual([
			{ sha: "sha2", message: "Config backup voron24 2026-07-26", date: "2026-07-26T00:00:00Z" },
			{ sha: "sha1", message: "Config backup voron24 2026-07-01", date: "2026-07-01T00:00:00Z" },
		]);
	});

	it("returns an empty list when this machine has no history", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
		expect(await listBackupHistory("tok", "user/repo", "main", "new-machine")).toEqual([]);
	});
});

describe("downloadBackupAtCommit", () => {
	it("walks commit -> tree -> blob and decodes the base64 content", async () => {
		const zipBytes = new Uint8Array([80, 75, 3, 4]); // "PK\x03\x04" zip signature
		let binary = "";
		zipBytes.forEach((b) => { binary += String.fromCharCode(b); });
		const base64 = btoa(binary);
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			const path = url.replace("https://api.github.com", "");
			if (path.includes("/git/commits/")) { return jsonResponse({ tree: { sha: "tree-sha" } }); }
			if (path.includes("/git/trees/")) {
				return jsonResponse({ tree: [{ path: "machines/voron24/backup.zip", sha: "blob-sha", type: "blob" }, { path: "machines/voron24/sys/config.g", sha: "other-sha", type: "blob" }] });
			}
			if (path.includes("/git/blobs/blob-sha")) { return jsonResponse({ content: base64, encoding: "base64" }); }
			throw new Error("unexpected " + path);
		}));
		const blob = await downloadBackupAtCommit("tok", "user/repo", "voron24", "commit-sha");
		const buf = new Uint8Array(await blob.arrayBuffer());
		expect(Array.from(buf)).toEqual(Array.from(zipBytes));
	});

	it("throws a clear error when the path is missing from that commit's tree", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			const path = url.replace("https://api.github.com", "");
			if (path.includes("/git/commits/")) { return jsonResponse({ tree: { sha: "tree-sha" } }); }
			if (path.includes("/git/trees/")) { return jsonResponse({ tree: [] }); }
			throw new Error("unexpected " + path);
		}));
		await expect(downloadBackupAtCommit("tok", "user/repo", "voron24", "commit-sha")).rejects.toThrow(GithubError);
	});
});
