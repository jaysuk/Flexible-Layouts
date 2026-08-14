/**
 * DuetWebControl's own releases, via the GitHub Releases API - same shape as duet3dSource.ts (same
 * repo owner, same CORS behaviour: release-asset bytes aren't directly fetchable, only the Releases
 * API listing is, so every file here is directDownload:false and goes through the same
 * manual-download-then-hand-the-file-back flow as the duet3d source).
 *
 * DWC ships two release bundles - DuetWebControl-SD.zip (standalone: extracted onto the board's own
 * SD card) and DuetWebControl-SBC.zip (SBC mode: the DSF-managed package) - confirmed against DWC's
 * own build output naming (vite/build-outputs.ts). Uploading either one is NOT an M997 operation at
 * all: DWC's own useFirmwareInstall.ts classifies index.html(.gz) etc. as "web files" via isWebFile(),
 * and useFirmwareInstallController.ts already rejects the wrong bundle for the current connector type
 * before upload - this source only needs to offer the RIGHT one for the current mode; the classifier
 * and reload-on-completion behaviour are already handled by the exact same DWC composables
 * FirmwareUpdateWidget.vue already calls for the board-firmware flow.
 */
import type { FirmwareCandidateFile, FirmwareRelease, FirmwareSource } from "./sources";

const REPO = "Duet3D/DuetWebControl";
const API = "https://api.github.com";

interface GhAsset { name: string; browser_download_url: string; size: number }
interface GhRelease {
	tag_name: string; published_at: string; prerelease: boolean; html_url: string; draft: boolean;
	assets: Array<GhAsset>;
}

let cachedReleases: Array<FirmwareRelease> | null = null;
const cachedAssets = new Map<string, Array<FirmwareCandidateFile>>();

async function fetchReleases(): Promise<void> {
	let res: Response;
	try {
		res = await fetch(`${API}/repos/${REPO}/releases?per_page=25`, {
			headers: { Accept: "application/vnd.github+json" },
		});
	} catch (e) {
		throw new Error(`GitHub could not be reached: ${(e as Error)?.message ?? String(e)}`);
	}
	if (res.status === 403 || res.status === 429) {
		throw new Error("GitHub is rate-limiting this address (60 requests/hour, unauthenticated). Try again later.");
	}
	if (!res.ok) {
		throw new Error(`GitHub answered ${res.status}`);
	}
	const json = (await res.json()) as Array<GhRelease>;
	const releases: Array<FirmwareRelease> = [];
	cachedAssets.clear();
	for (const r of json) {
		if (!r || r.draft || !r.tag_name) {
			continue;
		}
		releases.push({ tag: r.tag_name, publishedAt: r.published_at ?? "", prerelease: r.prerelease === true, htmlUrl: r.html_url ?? "" });
		cachedAssets.set(r.tag_name, (r.assets ?? []).map((a) => ({
			name: a.name, url: a.browser_download_url, size: a.size ?? 0, directDownload: false,
		})));
	}
	cachedReleases = releases;
}

/** The one asset that matches the current connection mode - "duetwebcontrol-sd.zip" for standalone,
 *  "duetwebcontrol-sbc.zip" when running via an attached SBC. Case-insensitive since GitHub asset
 *  names aren't guaranteed casing and useFirmwareInstallController.ts's own guard also lower-cases. */
export function selectDwcAsset(files: ReadonlyArray<FirmwareCandidateFile>, isSbc: boolean): FirmwareCandidateFile | null {
	const wanted = isSbc ? "duetwebcontrol-sbc.zip" : "duetwebcontrol-sd.zip";
	return files.find((f) => f.name.toLowerCase() === wanted) ?? null;
}

export const dwcSource: FirmwareSource = {
	id: "dwc",
	label: "DuetWebControl (official)",
	async listReleases() {
		if (!cachedReleases) {
			await fetchReleases();
		}
		return cachedReleases ?? [];
	},
	async listFiles(release) {
		if (!cachedReleases) {
			await fetchReleases();
		}
		return cachedAssets.get(release.tag) ?? [];
	},
};
