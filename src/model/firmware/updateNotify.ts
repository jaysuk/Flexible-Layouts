/**
 * Pure comparison logic for FirmwareUpdateWidget's background "is a newer release available" check -
 * kept separate from the widget so the comparison itself is unit-testable without mounting anything,
 * same reasoning that already justified extracting `matchesBoardFile` into sources.ts.
 */
import { compareVersions } from "dwc-plugin-runtime";

export interface FirmwareUpdateCheckInput {
	/** boards[0].firmwareVersion - may be empty/undefined during a reconnect window. */
	runningFirmwareVersion: string | null | undefined;
	/** The best release tag offered for the detected source/channel, already filtered for
	 *  includePrereleases and restricted to the SAME branch as the running firmware - this function
	 *  does not itself guard against a cross-branch comparison, callers must only pass same-branch tags. */
	latestTag: string | null;
}

export interface FirmwareUpdateCheckResult {
	updateAvailable: boolean;
	reason?: "noRunningVersion" | "noReleases" | "upToDate";
}

export function evaluateFirmwareUpdate(input: FirmwareUpdateCheckInput): FirmwareUpdateCheckResult {
	if (!input.runningFirmwareVersion) {
		return { updateAvailable: false, reason: "noRunningVersion" };
	}
	if (!input.latestTag) {
		return { updateAvailable: false, reason: "noReleases" };
	}
	const newer = compareVersions(input.latestTag, input.runningFirmwareVersion) > 0;
	return newer ? { updateAvailable: true } : { updateAvailable: false, reason: "upToDate" };
}
