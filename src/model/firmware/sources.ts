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
	id: "duet3d" | "gloomyandy";
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
