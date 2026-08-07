/**
 * gloomyandy's STM32/RP2040 RRF fork (https://github.com/gloomyandy/RRFBuild) - the build this
 * user's own boards (and others they support) run, since genuine Duet3D firmware only targets
 * Duet-branded hardware. Confirmed live via the GitHub API (not assumed): not a Releases-API repo -
 * a folder tree committed to branches `v3.6-dev`/`v3.7-dev` at `releases/<version>/`, e.g.
 * `releases/3.6.3/mainboard/btt/firmware_kraken_h723.bin`, `releases/3.6.3/expansion/
 * Duet3Firmware_SB2040MAX3.uf2` (RP2040 CAN expansion boards, same naming convention as genuine
 * Duet), plus base/bootloader/map/wifi subfolders - so this needs a recursive tree walk rather
 * than a single releases-list call.
 *
 * Every file here comes from raw.githubusercontent.com (via the Contents API's own download_url),
 * which sends `Access-Control-Allow-Origin: *` - confirmed live with curl, including with an
 * Origin header set, unlike GitHub's release-asset CDN (see sources.ts). Direct browser fetch
 * works with no manual download step, unlike the duet3d source.
 */
import { compareVersions } from "dwc-plugin-runtime";

import type { FirmwareCandidateFile, FirmwareRelease, FirmwareSource } from "./sources";

const REPO = "gloomyandy/RRFBuild";
const API = "https://api.github.com";
const MAX_WALK_DEPTH = 4;

export type GloomyandyBranch = "v3.6-dev" | "v3.7-dev";

interface GhContentEntry {
	name: string;
	path: string;
	type: string;
	download_url: string | null;
	size: number;
}

async function listDir(branch: string, path: string): Promise<Array<GhContentEntry>> {
	const encodedPath = path.split("/").map(encodeURIComponent).join("/");
	let res: Response;
	try {
		res = await fetch(`${API}/repos/${REPO}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, {
			headers: { Accept: "application/vnd.github+json" },
		});
	} catch (e) {
		throw new Error(`GitHub could not be reached: ${(e as Error)?.message ?? String(e)}`);
	}
	if (res.status === 403 || res.status === 429) {
		throw new Error("GitHub is rate-limiting this address (60 requests/hour, unauthenticated). Try again later.");
	}
	if (res.status === 404) {
		return [];
	}
	if (!res.ok) {
		throw new Error(`GitHub answered ${res.status}`);
	}
	const json: unknown = await res.json();
	return Array.isArray(json) ? (json as Array<GhContentEntry>) : [];
}

async function walk(branch: string, path: string, depth: number): Promise<Array<FirmwareCandidateFile>> {
	if (depth > MAX_WALK_DEPTH) {
		return [];
	}
	const entries = await listDir(branch, path);
	const out: Array<FirmwareCandidateFile> = [];
	for (const e of entries) {
		if (e.type === "dir") {
			out.push(...await walk(branch, e.path, depth + 1));
		} else if (e.type === "file" && e.download_url) {
			out.push({ name: e.name, url: e.download_url, size: e.size ?? 0, directDownload: true });
		}
	}
	return out;
}

const releaseCache = new Map<GloomyandyBranch, Array<FirmwareRelease>>();
const fileCache = new Map<string, Array<FirmwareCandidateFile>>();

export function gloomyandySource(branch: GloomyandyBranch): FirmwareSource {
	return {
		id: "gloomyandy",
		label: `gloomyandy STM32/RP2040 fork (${branch})`,
		async listReleases() {
			const cached = releaseCache.get(branch);
			if (cached) {
				return cached;
			}
			const entries = await listDir(branch, "releases");
			const releases = entries
				.filter((e) => e.type === "dir")
				.map((e): FirmwareRelease => ({
					tag: e.name,
					publishedAt: "",
					prerelease: /alpha|beta|rc/i.test(e.name),
					htmlUrl: `https://github.com/${REPO}/tree/${branch}/releases/${e.name}`,
				}))
				.sort((a, b) => compareVersions(b.tag, a.tag));
			releaseCache.set(branch, releases);
			return releases;
		},
		async listFiles(release) {
			const key = `${branch}/${release.tag}`;
			const cached = fileCache.get(key);
			if (cached) {
				return cached;
			}
			const files = await walk(branch, `releases/${release.tag}`, 0);
			fileCache.set(key, files);
			return files;
		},
	};
}
