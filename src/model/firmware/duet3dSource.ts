/**
 * Official Duet3D/RepRapFirmware releases, via the GitHub Releases API. `api.github.com` sends
 * permissive CORS on public endpoints, so listing releases works fine from the browser - but the
 * asset bytes themselves do not (see sources.ts's FirmwareCandidateFile.directDownload doc
 * comment), so every file here is `directDownload: false`. The widget opens the asset URL for a
 * normal browser download instead of fetch()ing it, then lets the operator hand the downloaded
 * file back in - see FirmwareUpdateWidget.vue.
 */
import type { FirmwareCandidateFile, FirmwareRelease, FirmwareSource } from "./sources";

const REPO = "Duet3D/RepRapFirmware";
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

export const duet3dSource: FirmwareSource = {
	id: "duet3d",
	label: "Duet3D (official)",
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
