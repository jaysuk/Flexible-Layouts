/**
 * GitHub destination (§6 Phase 7). One backup = one commit, built via the Git Data API (not the
 * Contents API) so every file lands in a single atomic commit rather than one commit per file. All
 * calls are to `api.github.com`, which is CORS-open (unlike the release-asset CDN - see FL's own
 * update-check history for that gotcha elsewhere in this plugin).
 *
 * Commits the EXPANDED files (redacted or not, per the caller's choice) under `machines/<name>/…` so
 * `config.g` diffs across backups, plus the ZIP itself (stable filename, `backup.zip` - each push
 * OVERWRITES it rather than accumulating one file per backup) as one more blob in the same commit.
 * `<name>` defaults to the machine's hostname but can be overridden per-repo (GithubSettings.machineName)
 * for readability across multiple machines.
 *
 * Restore browses history via `GET .../commits?path=machines/<name>/backup.zip` (one entry per past
 * backup, newest first - exactly the payoff of keeping the zip path stable) and fetches an old
 * revision's blob via commit -> tree -> blob, all Git Data API reads so no special restore endpoint
 * is needed.
 */
export class GithubError extends Error {
	constructor(message: string, public status?: number) { super(message); this.name = "GithubError"; }
}

const API = "https://api.github.com";

export interface GithubFile { path: string; content: string; binary: boolean }

export interface PushBackupOptions {
	token: string;
	repo: string; // "owner/repo"
	branch: string;
	machineFolder: string; // e.g. the hostname or machineKey
	files: Array<GithubFile>;
	zip: { path: string; blob: Blob };
	message: string;
}

function headers(token: string): Record<string, string> {
	return { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
}

async function request(path: string, token: string, init?: RequestInit): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
	const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(token), ...(init?.headers as Record<string, string> | undefined) } });
	if (!res.ok) {
		if (res.status === 404) { throw new GithubError("Repository not found, or the token doesn't have access to it.", 404); }
		if (res.status === 401) { throw new GithubError("Sign-in rejected - check the token.", 401); }
		const body = await res.json().catch(() => null);
		throw new GithubError(body?.message ?? `GitHub API error (${res.status}).`, res.status);
	}
	return res.status === 204 ? null : res.json();
}

async function blobToBase64(blob: Blob): Promise<string> {
	const buf = await blob.arrayBuffer();
	const bytes = new Uint8Array(buf);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) { binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize)); }
	return btoa(binary);
}

/** True (`private: true`) / false / null (repo doesn't exist yet, or the token can't see it). */
export async function isRepoPrivate(token: string, repo: string): Promise<boolean | null> {
	try {
		const data = await request(`/repos/${repo}`, token);
		return Boolean(data.private);
	} catch {
		return null;
	}
}

export interface PushBackupResult { sha: string; url: string }

export async function pushBackup(opts: PushBackupOptions): Promise<PushBackupResult> {
	const { token, repo, branch } = opts;

	// 1/2: resolve the base commit + tree (an empty repo has no ref yet - start from nothing).
	let baseTreeSha: string | undefined;
	let parentSha: string | undefined;
	try {
		const ref = await request(`/repos/${repo}/git/ref/heads/${branch}`, token);
		parentSha = ref.object.sha;
		const commit = await request(`/repos/${repo}/git/commits/${parentSha}`, token);
		baseTreeSha = commit.tree.sha;
	} catch (e) {
		if (e instanceof GithubError && e.status === 404) {
			parentSha = undefined; // no branch yet - this will be the first commit
		} else {
			throw e;
		}
	}

	// 3: one blob per file (+ the zip).
	const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
	for (const f of opts.files) {
		const content = f.binary ? f.content : undefined;
		const encoding = f.binary ? "base64" : "utf-8";
		const blob = await request(`/repos/${repo}/git/blobs`, token, {
			method: "POST", body: JSON.stringify({ content: content ?? f.content, encoding }),
		});
		treeEntries.push({ path: `machines/${opts.machineFolder}/${f.path}`, mode: "100644", type: "blob", sha: blob.sha });
	}
	const zipBase64 = await blobToBase64(opts.zip.blob);
	const zipBlob = await request(`/repos/${repo}/git/blobs`, token, {
		method: "POST", body: JSON.stringify({ content: zipBase64, encoding: "base64" }),
	});
	treeEntries.push({ path: `machines/${opts.machineFolder}/${opts.zip.path}`, mode: "100644", type: "blob", sha: zipBlob.sha });

	// 4: one tree, 5: one commit, 6: move the branch ref (or create it).
	const tree = await request(`/repos/${repo}/git/trees`, token, {
		method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
	});
	const commit = await request(`/repos/${repo}/git/commits`, token, {
		method: "POST", body: JSON.stringify({ message: opts.message, tree: tree.sha, parents: parentSha ? [parentSha] : [] }),
	});
	if (parentSha) {
		await request(`/repos/${repo}/git/refs/heads/${branch}`, token, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
	} else {
		await request(`/repos/${repo}/git/refs`, token, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
	}

	return { sha: commit.sha, url: `https://github.com/${repo}/commit/${commit.sha}` };
}

// --- Restore: browsing history and fetching an old revision -----------------------------------------

/** Machine folders under `machines/` - the cross-machine restore path (e.g. after a mainboard swap,
 * the old machine's folder is still listed here). Empty if nothing has been pushed yet. */
export async function listMachineFolders(token: string, repo: string, branch: string): Promise<Array<string>> {
	try {
		const data = await request(`/repos/${repo}/contents/machines?ref=${encodeURIComponent(branch)}`, token);
		return (Array.isArray(data) ? data : [])
			.filter((e: { type: string }) => e.type === "dir")
			.map((e: { name: string }) => e.name);
	} catch (e) {
		if (e instanceof GithubError && e.status === 404) { return []; } // no machines/ folder yet
		throw e;
	}
}

export interface GithubBackupRevision { sha: string; date: string; message: string }

/** Every commit that touched this machine's `backup.zip`, newest first - one entry per past backup. */
export async function listBackupHistory(token: string, repo: string, branch: string, machineFolder: string): Promise<Array<GithubBackupRevision>> {
	const path = `machines/${machineFolder}/backup.zip`;
	try {
		const data = await request(`/repos/${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=50`, token);
		return (Array.isArray(data) ? data : []).map((c: { sha: string; commit: { message: string; author?: { date?: string }; committer?: { date?: string } } }) => ({
			sha: c.sha, message: c.commit.message, date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
		}));
	} catch (e) {
		if (e instanceof GithubError && e.status === 404) { return []; }
		throw e;
	}
}

/** Fetch the `backup.zip` blob exactly as it was at one historical commit (commit -> tree -> blob -
 * the Git Data API has no "get file at ref" shortcut for binary content beyond 1 MB, which a real
 * config backup regularly exceeds, so this walks the object graph directly instead of the simpler
 * but size-capped Contents API). */
export async function downloadBackupAtCommit(token: string, repo: string, machineFolder: string, commitSha: string): Promise<Blob> {
	const path = `machines/${machineFolder}/backup.zip`;
	const commit = await request(`/repos/${repo}/git/commits/${commitSha}`, token);
	const tree = await request(`/repos/${repo}/git/trees/${commit.tree.sha}?recursive=true`, token);
	const entries: Array<{ path: string; sha: string; type: string }> = tree.tree ?? [];
	const entry = entries.find((e) => e.path === path && e.type === "blob");
	if (!entry) { throw new GithubError("This backup's ZIP could not be found in that commit - it may have been renamed or removed since."); }
	const blob = await request(`/repos/${repo}/git/blobs/${entry.sha}`, token);
	if (blob.encoding !== "base64") { throw new GithubError("Unexpected blob encoding from GitHub."); }
	const binary = atob((blob.content as string).replace(/\n/g, ""));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
	return new Blob([bytes], { type: "application/zip" });
}
