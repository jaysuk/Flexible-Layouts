import { describe, expect, it } from "vitest";

import { evaluateFirmwareUpdate } from "../model/firmware/updateNotify";

describe("evaluateFirmwareUpdate", () => {
	it("flags a newer tag as available", () => {
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: "3.6.2", latestTag: "3.6.3" }))
			.toEqual({ updateAvailable: true });
	});

	it("does not flag an equal tag", () => {
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: "3.6.3", latestTag: "3.6.3" }))
			.toEqual({ updateAvailable: false, reason: "upToDate" });
	});

	it("does not flag an older tag", () => {
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: "3.6.3", latestTag: "3.6.2" }))
			.toEqual({ updateAvailable: false, reason: "upToDate" });
	});

	// A missing/empty running version (e.g. mid-reconnect) must never be treated as "version 0" and
	// compared against every real release as newer.
	it("refuses to compare when the running version is empty", () => {
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: "", latestTag: "3.6.3" }))
			.toEqual({ updateAvailable: false, reason: "noRunningVersion" });
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: undefined, latestTag: "3.6.3" }))
			.toEqual({ updateAvailable: false, reason: "noRunningVersion" });
	});

	it("reports no releases distinctly from up to date", () => {
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: "3.6.3", latestTag: null }))
			.toEqual({ updateAvailable: false, reason: "noReleases" });
	});

	it("handles RRF's own version shape against a plain gloomyandy tag", () => {
		expect(evaluateFirmwareUpdate({ runningFirmwareVersion: "3.6.0-beta.3+3", latestTag: "3.6.3" }))
			.toEqual({ updateAvailable: true });
	});
});
