/**
 * Shared types + board-file matching for the firmware sources (duet3dSource.ts,
 * gloomyandySource.ts). Both answer the same question - "does this release contain a file whose
 * name matches what boards[n].firmwareFileName/iapFileNameSD says this board wants?" - only where
 * to look differs (GitHub Releases API vs a folder tree on a branch).
 */

export interface FirmwareRelease {
	tag: string;
	publishedAt: string;
	prerelease: boolean;
	htmlUrl: string;
}

export interface FirmwareCandidateFile {
	/** Filename only, no path - what a board's firmwareFileName/iapFileNameSD is matched against. */
	name: string;
	/** Where to fetch the bytes from (or, when not directDownload, where a human can download it). */
	url: string;
	size: number;
	/**
	 * False when this URL cannot be fetched directly by browser JS - confirmed empirically (not
	 * assumed): GitHub's release-asset CDN (release-assets.githubusercontent.com, as of writing -
	 * it has changed domains before) sends no Access-Control-Allow-Origin header at all, even with
	 * an Origin header present, so `fetch()` fails cross-origin from wherever this plugin runs. This
	 * directly contradicts an old assumption in a similar tool's own code (it names a now-defunct
	 * CDN domain, `objects.githubusercontent.com`) - which is exactly why this was checked live with
	 * curl rather than trusted. raw.githubusercontent.com (used by the gloomyandy source) sends
	 * `Access-Control-Allow-Origin: *` and has no such problem.
	 */
	directDownload: boolean;
}

export interface FirmwareSource {
	id: "duet3d" | "gloomyandy" | "dwc";
	label: string;
	listReleases(): Promise<Array<FirmwareRelease>>;
	listFiles(release: FirmwareRelease): Promise<Array<FirmwareCandidateFile>>;
}

/**
 * Match a filename against the name a board asked for, allowing a version infix before the
 * extension - deliberately mirrors DWC's own `useFirmwareInstall.ts::matchesBoardBinary` byte for
 * byte (including its lack of regex-escaping on `wanted`, which is DWC's existing behaviour, not
 * an FL bug to "fix" here - diverging from it would risk a case where FL and DWC disagree on
 * whether a file matches).
 */
export function matchesBoardFile(wanted: string, candidateName: string): boolean {
	const binRegEx = new RegExp(wanted.replace(/\.bin$/, "(.*)\\.bin"), "i");
	const uf2RegEx = new RegExp(wanted.replace(/\.uf2$/, "(.*)\\.uf2"), "i");
	return binRegEx.test(candidateName) || uf2RegEx.test(candidateName);
}

export interface BoardFirmwareWant {
	firmwareFileName?: string;
	iapFileNameSD?: string | null;
	/** SD-card-mediated IAP binary used when the machine is running via an attached SBC - a DIFFERENT
	 *  file from iapFileNameSD on gloomyandy's STM32 boards (see gloomyandySource.ts's *_iap_SBC.bin
	 *  files). DWC's own useFirmwareInstall.ts::findBoardBinary checks this in place of iapFileNameSD
	 *  specifically when hasSbc - mirrored here so FL can find the matching file to fetch in the
	 *  first place (DWC's own classifier only sorts files already handed to it, it doesn't search a
	 *  release tree). */
	iapFileNameSBC?: string | null;
	/** WiFi module firmware (DuetWiFiServer.bin / DuetWiFiModule-32S3.bin, standalone only - see
	 *  matchesBoardFile's caller for the isSbc gate, mirroring DWC's own `!hasSbc && hasWifi` check). */
	wifiFirmwareFileName?: string | null;
	/** Not itself matched against a filename - used only to detect a board on a different firmware
	 *  family than the main board (see boardsNeedingOtherSource below). */
	name?: string;
	canAddress?: number | null;
}

export interface MatchBoardFilesOptions {
	/** When true, matches iapFileNameSBC instead of iapFileNameSD - the machine is running via an
	 *  attached SBC, so the standalone SD-card IAP binary would never actually be used. */
	isSbc?: boolean;
	/** When true, also matches wifiFirmwareFileName. Callers should pass this only when NOT isSbc,
	 *  matching DWC's own useFirmwareInstall.ts gate (`!ctx.hasSbc && ctx.hasWifi`) - the wiki
	 *  documents M997 S1 (WiFi module) as "standalone only". */
	includeWifi?: boolean;
}

/**
 * Matches EVERY board in a CAN network (main board plus every connected expansion/toolboard), not
 * just the main one - a gloomyandy release has no combined bundle, each board's binary is its own
 * separate file, so a firmware update that also touches a toolboard needs that file found too. A
 * board with no match in this release is skipped, not an error - not every release touches every
 * board. Deduplicates (two boards asking for the same file only appears once).
 */
export function matchAllBoardFiles(
	boards: ReadonlyArray<BoardFirmwareWant>, files: ReadonlyArray<FirmwareCandidateFile>, options: MatchBoardFilesOptions = {},
): Array<FirmwareCandidateFile> {
	const { isSbc = false, includeWifi = false } = options;
	const matched: Array<FirmwareCandidateFile> = [];
	for (const b of boards) {
		if (!b.firmwareFileName) { continue; }
		const iap = isSbc ? b.iapFileNameSBC : b.iapFileNameSD;
		const wanted = [
			b.firmwareFileName,
			...(iap ? [iap] : []),
			...(includeWifi && b.wifiFirmwareFileName ? [b.wifiFirmwareFileName] : []),
		];
		for (const w of wanted) {
			const f = files.find((cand) => matchesBoardFile(w, cand.name));
			if (f && !matched.includes(f)) { matched.push(f); }
		}
	}
	return matched;
}

/** True if the given firmware name looks like gloomyandy's STM32/RP2040 port rather than genuine
 *  Duet3D firmware - the same test FirmwareUpdateWidget.vue's detectedSourceId() already applies to
 *  the main board, exported here so it can also be applied per-board (for the hybrid case: a genuine
 *  Duet mainboard with a gloomyandy-firmware CAN toolboard attached). */
export function looksLikeGloomyandyFirmware(firmwareName: string | undefined | null): boolean {
	return /stm32/i.test(firmwareName ?? "");
}

/**
 * Names of boards whose firmwareName suggests they need the OTHER source than the one currently
 * selected - e.g. a genuine Duet mainboard (duet3d selected) with a gloomyandy-firmware CAN toolboard
 * attached, which would otherwise be silently skipped since only one source's release tree is ever
 * browsed at a time. Returns [] when every board agrees with the currently active source.
 */
export function boardsNeedingOtherSource(
	boards: ReadonlyArray<{ name?: string; firmwareName?: string }>, activeSourceIsGloomyandy: boolean,
): Array<string> {
	return boards
		.filter((b) => looksLikeGloomyandyFirmware(b.firmwareName) !== activeSourceIsGloomyandy)
		.map((b) => b.name)
		.filter((n): n is string => !!n);
}
