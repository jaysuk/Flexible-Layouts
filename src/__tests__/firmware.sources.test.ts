import { afterEach, describe, expect, it, vi } from "vitest";

import { matchesBoardFile } from "../model/firmware/sources";

describe("matchesBoardFile", () => {
	it("matches the exact filename a board asked for", () => {
		expect(matchesBoardFile("Duet3Firmware_MB6HC.bin", "Duet3Firmware_MB6HC.bin")).toBe(true);
	});
	it("allows a version infix before the extension", () => {
		expect(matchesBoardFile("Duet3Firmware_MB6HC.bin", "Duet3Firmware_MB6HC-3.6.1.bin")).toBe(true);
		expect(matchesBoardFile("firmware_kraken_h723.bin", "firmware_kraken_h723-v2.zip")).toBe(false); // wrong extension
	});
	it("does not match a different board's file", () => {
		expect(matchesBoardFile("Duet3Firmware_MB6HC.bin", "Duet3Firmware_SBC.bin")).toBe(false);
	});
	it("matches .uf2 the same way as .bin", () => {
		expect(matchesBoardFile("Duet3Firmware_SB2040MAX3.uf2", "Duet3Firmware_SB2040MAX3.uf2")).toBe(true);
		expect(matchesBoardFile("Duet3Firmware_SB2040MAX3.uf2", "Duet3Firmware_SB2040MAX3-1.0.uf2")).toBe(true);
	});
	it("is case-insensitive", () => {
		expect(matchesBoardFile("Duet3Firmware_MB6HC.bin", "duet3firmware_mb6hc.bin")).toBe(true);
	});
});

describe("duet3dSource", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("parses releases, dropping drafts, and lists that release's assets", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [
				{ tag_name: "3.6.1", published_at: "2026-01-01T00:00:00Z", prerelease: false, html_url: "https://x/3.6.1", draft: false,
					assets: [{ name: "Duet3Firmware_MB6HC.bin", browser_download_url: "https://dl/Duet3Firmware_MB6HC.bin", size: 100 }] },
				{ tag_name: "3.6.2-draft", published_at: "", prerelease: false, html_url: "", draft: true, assets: [] },
			],
		});
		vi.stubGlobal("fetch", fetchMock);
		const { duet3dSource } = await import("../model/firmware/duet3dSource");

		const releases = await duet3dSource.listReleases();
		expect(releases).toEqual([{ tag: "3.6.1", publishedAt: "2026-01-01T00:00:00Z", prerelease: false, htmlUrl: "https://x/3.6.1" }]);

		const files = await duet3dSource.listFiles(releases[0]);
		expect(files).toEqual([{ name: "Duet3Firmware_MB6HC.bin", url: "https://dl/Duet3Firmware_MB6HC.bin", size: 100, directDownload: false }]);
		expect(fetchMock).toHaveBeenCalledTimes(1); // listFiles reused the cached listReleases() call
	});

	it("throws a clear error when GitHub rate-limits the request", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
		const { duet3dSource } = await import("../model/firmware/duet3dSource");
		await expect(duet3dSource.listReleases()).rejects.toThrow(/rate-limiting/);
	});
});

describe("gloomyandySource", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("lists version folders under releases/, sorted newest first", async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes("/contents/releases?")) {
				return { ok: true, status: 200, json: async () => [
					{ name: "3.6.1", path: "releases/3.6.1", type: "dir", download_url: null, size: 0 },
					{ name: "3.6.3", path: "releases/3.6.3", type: "dir", download_url: null, size: 0 },
					{ name: "3.6.2", path: "releases/3.6.2", type: "dir", download_url: null, size: 0 },
				] };
			}
			return { ok: true, status: 200, json: async () => [] };
		});
		vi.stubGlobal("fetch", fetchMock);
		const { gloomyandySource } = await import("../model/firmware/gloomyandySource");

		const releases = await gloomyandySource("v3.6-dev").listReleases();
		expect(releases.map((r) => r.tag)).toEqual(["3.6.3", "3.6.2", "3.6.1"]);
	});

	it("recursively walks subdirectories and returns every file found, with directDownload true", async () => {
		const fetchMock = vi.fn().mockImplementation(async (url: string) => {
			if (url.includes("/contents/releases/3.6.3?")) {
				return { ok: true, status: 200, json: async () => [
					{ name: "mainboard", path: "releases/3.6.3/mainboard", type: "dir", download_url: null, size: 0 },
					{ name: "STM32RepRapFirmwareSBC.zip", path: "releases/3.6.3/STM32RepRapFirmwareSBC.zip", type: "file", download_url: "https://raw/zip", size: 5 },
				] };
			}
			if (url.includes("/contents/releases/3.6.3/mainboard?")) {
				return { ok: true, status: 200, json: async () => [
					{ name: "btt", path: "releases/3.6.3/mainboard/btt", type: "dir", download_url: null, size: 0 },
				] };
			}
			if (url.includes("/contents/releases/3.6.3/mainboard/btt?")) {
				return { ok: true, status: 200, json: async () => [
					{ name: "firmware_kraken_h723.bin", path: "releases/3.6.3/mainboard/btt/firmware_kraken_h723.bin", type: "file", download_url: "https://raw/kraken.bin", size: 700000 },
				] };
			}
			return { ok: true, status: 200, json: async () => [] };
		});
		vi.stubGlobal("fetch", fetchMock);
		const { gloomyandySource } = await import("../model/firmware/gloomyandySource");

		const src = gloomyandySource("v3.6-dev");
		const files = await src.listFiles({ tag: "3.6.3", publishedAt: "", prerelease: false, htmlUrl: "" });
		expect(files).toEqual(expect.arrayContaining([
			{ name: "STM32RepRapFirmwareSBC.zip", url: "https://raw/zip", size: 5, directDownload: true },
			{ name: "firmware_kraken_h723.bin", url: "https://raw/kraken.bin", size: 700000, directDownload: true },
		]));
		expect(files).toHaveLength(2);
	});

	it("throws a clear error when GitHub rate-limits the request", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
		const { gloomyandySource } = await import("../model/firmware/gloomyandySource");
		await expect(gloomyandySource("v3.7-dev").listReleases()).rejects.toThrow(/rate-limiting/);
	});
});
