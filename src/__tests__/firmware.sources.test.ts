import { afterEach, describe, expect, it, vi } from "vitest";

import { selectDwcAsset } from "../model/firmware/dwcSource";
import {
	boardsNeedingOtherSource, looksLikeGloomyandyFirmware, matchAllBoardFiles, matchesBoardFile,
	type FirmwareCandidateFile,
} from "../model/firmware/sources";

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

describe("matchAllBoardFiles", () => {
	const cand = (name: string): FirmwareCandidateFile => ({ name, url: `https://x/${name}`, size: 1, directDownload: true });

	it("matches every board's file, not just the first one", () => {
		const boards = [
			{ firmwareFileName: "firmware_kraken_h723.bin" },
			{ firmwareFileName: "Duet3Firmware_SB2040MAX3.uf2" },
		];
		const files = [cand("firmware_kraken_h723.bin"), cand("Duet3Firmware_SB2040MAX3.uf2"), cand("unrelated.bin")];
		const matched = matchAllBoardFiles(boards, files);
		expect(matched.map((f) => f.name).sort()).toEqual(["Duet3Firmware_SB2040MAX3.uf2", "firmware_kraken_h723.bin"]);
	});

	it("skips a board with no match in this release, without erroring", () => {
		const boards = [{ firmwareFileName: "main.bin" }, { firmwareFileName: "no-match-here.bin" }];
		const files = [cand("main.bin")];
		expect(matchAllBoardFiles(boards, files).map((f) => f.name)).toEqual(["main.bin"]);
	});

	it("skips a board with no firmwareFileName reported at all", () => {
		const boards = [{ firmwareFileName: "main.bin" }, {}];
		const files = [cand("main.bin")];
		expect(matchAllBoardFiles(boards, files)).toHaveLength(1);
	});

	it("also matches a board's iapFileNameSD, if it has one", () => {
		const boards = [{ firmwareFileName: "main.bin", iapFileNameSD: "Duet3_SDiap_MB6HC.bin" }];
		const files = [cand("main.bin"), cand("Duet3_SDiap_MB6HC.bin")];
		expect(matchAllBoardFiles(boards, files).map((f) => f.name).sort()).toEqual(["Duet3_SDiap_MB6HC.bin", "main.bin"]);
	});

	it("deduplicates when two boards happen to want the same file", () => {
		const boards = [{ firmwareFileName: "same.bin" }, { firmwareFileName: "same.bin" }];
		const files = [cand("same.bin")];
		expect(matchAllBoardFiles(boards, files)).toHaveLength(1);
	});

	it("matches iapFileNameSBC instead of iapFileNameSD when isSbc is true", () => {
		const boards = [{ firmwareFileName: "main.bin", iapFileNameSD: "iap_sd.bin", iapFileNameSBC: "iap_sbc.bin" }];
		const files = [cand("main.bin"), cand("iap_sd.bin"), cand("iap_sbc.bin")];
		const matched = matchAllBoardFiles(boards, files, { isSbc: true }).map((f) => f.name).sort();
		expect(matched).toEqual(["iap_sbc.bin", "main.bin"]);
		expect(matched).not.toContain("iap_sd.bin");
	});

	it("still matches iapFileNameSD (not SBC) by default, unaffected by the new option", () => {
		const boards = [{ firmwareFileName: "main.bin", iapFileNameSD: "iap_sd.bin", iapFileNameSBC: "iap_sbc.bin" }];
		const files = [cand("main.bin"), cand("iap_sd.bin"), cand("iap_sbc.bin")];
		const matched = matchAllBoardFiles(boards, files).map((f) => f.name).sort();
		expect(matched).toEqual(["iap_sd.bin", "main.bin"]);
	});

	it("only matches wifiFirmwareFileName when includeWifi is true", () => {
		const boards = [{ firmwareFileName: "main.bin", wifiFirmwareFileName: "DuetWiFiServer.bin" }];
		const files = [cand("main.bin"), cand("DuetWiFiServer.bin")];
		expect(matchAllBoardFiles(boards, files).map((f) => f.name)).toEqual(["main.bin"]);
		expect(matchAllBoardFiles(boards, files, { includeWifi: true }).map((f) => f.name).sort())
			.toEqual(["DuetWiFiServer.bin", "main.bin"]);
	});
});

describe("looksLikeGloomyandyFirmware", () => {
	it("is true for a firmwareName containing STM32, case-insensitively", () => {
		expect(looksLikeGloomyandyFirmware("RepRapFirmware for STM32F407")).toBe(true);
		expect(looksLikeGloomyandyFirmware("RepRapFirmware for stm32h723")).toBe(true);
	});
	it("is false for a genuine Duet3D firmwareName, or an unset one", () => {
		expect(looksLikeGloomyandyFirmware("RepRapFirmware for Duet 3 MB6HC")).toBe(false);
		expect(looksLikeGloomyandyFirmware(undefined)).toBe(false);
		expect(looksLikeGloomyandyFirmware(null)).toBe(false);
	});
});

describe("boardsNeedingOtherSource", () => {
	it("names a gloomyandy-firmware CAN toolboard when the genuine-Duet source is active (the hybrid case)", () => {
		const boards = [
			{ name: "Duet 3 MB6HC", firmwareName: "RepRapFirmware for Duet 3 MB6HC" },
			{ name: "SB2040", firmwareName: "RepRapFirmware for STM32F401" },
		];
		expect(boardsNeedingOtherSource(boards, false)).toEqual(["SB2040"]);
	});

	it("is empty when every board agrees with the active source", () => {
		const boards = [{ name: "Duet 3 MB6HC", firmwareName: "RepRapFirmware for Duet 3 MB6HC" }];
		expect(boardsNeedingOtherSource(boards, false)).toEqual([]);
	});

	it("names a genuine board when gloomyandy is active but that board isn't STM32", () => {
		const boards = [{ name: "Duet 3 MB6HC", firmwareName: "RepRapFirmware for Duet 3 MB6HC" }];
		expect(boardsNeedingOtherSource(boards, true)).toEqual(["Duet 3 MB6HC"]);
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

describe("dwcSource", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("parses releases and lists that release's assets, same shape as duet3dSource", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [
				{ tag_name: "3.7.0-beta.2", published_at: "2026-01-01T00:00:00Z", prerelease: true, html_url: "https://x/3.7.0-beta.2", draft: false,
					assets: [
						{ name: "DuetWebControl-SD.zip", browser_download_url: "https://dl/DuetWebControl-SD.zip", size: 100 },
						{ name: "DuetWebControl-SBC.zip", browser_download_url: "https://dl/DuetWebControl-SBC.zip", size: 90 },
					] },
			],
		});
		vi.stubGlobal("fetch", fetchMock);
		const { dwcSource } = await import("../model/firmware/dwcSource");

		const releases = await dwcSource.listReleases();
		expect(releases).toEqual([{ tag: "3.7.0-beta.2", publishedAt: "2026-01-01T00:00:00Z", prerelease: true, htmlUrl: "https://x/3.7.0-beta.2" }]);
		const files = await dwcSource.listFiles(releases[0]);
		expect(files.map((f) => f.name).sort()).toEqual(["DuetWebControl-SBC.zip", "DuetWebControl-SD.zip"]);
		expect(files.every((f) => f.directDownload === false)).toBe(true); // same CORS limitation as duet3dSource
	});
});

describe("selectDwcAsset", () => {
	const cand = (name: string): FirmwareCandidateFile => ({ name, url: `https://x/${name}`, size: 1, directDownload: false });
	const files = [cand("DuetWebControl-SD.zip"), cand("DuetWebControl-SBC.zip")];

	it("picks the SD bundle for a standalone (non-SBC) machine", () => {
		expect(selectDwcAsset(files, false)?.name).toBe("DuetWebControl-SD.zip");
	});
	it("picks the SBC bundle when running via an attached SBC", () => {
		expect(selectDwcAsset(files, true)?.name).toBe("DuetWebControl-SBC.zip");
	});
	it("is case-insensitive on the asset name (GitHub asset casing isn't guaranteed)", () => {
		expect(selectDwcAsset([cand("DUETWEBCONTROL-SD.zip")], false)?.name).toBe("DUETWEBCONTROL-SD.zip");
	});
	it("returns null when the wanted bundle isn't present", () => {
		expect(selectDwcAsset([cand("DuetWebControl-SD.zip")], true)).toBeNull();
	});
});
