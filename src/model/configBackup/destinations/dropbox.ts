/**
 * Dropbox destination. Authenticated with a long-lived access token generated directly in the
 * Dropbox App Console (App Console -> your app -> "Generated access token") - no interactive OAuth
 * redirect, so unlike Google Drive this works fine from a plain-HTTP DWC origin. Both Dropbox API
 * hosts (`api.dropboxapi.com` for metadata calls, `content.dropboxapi.com` for upload/download) are
 * CORS-open for browser apps.
 */
export class DropboxError extends Error {
	constructor(message: string) { super(message); this.name = "DropboxError"; }
}

const API = "https://api.dropboxapi.com/2";
const CONTENT_API = "https://content.dropboxapi.com/2";
const ROOT_FOLDER = "/Duet Config Backups";

function sanitiseSegment(name: string): string {
	return name.replace(/[^A-Za-z0-9_-]+/g, "_") || "machine";
}

function folderFor(hostname: string): string {
	return `${ROOT_FOLDER}/${sanitiseSegment(hostname)}`;
}

async function apiCall(path: string, token: string, body: unknown): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
	const res = await fetch(`${API}${path}`, {
		method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) { throw new DropboxError(data?.error_summary ?? `Dropbox API error (${res.status}).`); }
	return data;
}

export interface DropboxBackupEntry { path: string; name: string; size: number; serverModified: string }

/** Lists the per-machine subfolders under the shared backup root - the cross-machine restore path
 * (e.g. after a mainboard swap, the old machine's folder is still listed here). Empty if nothing has
 * ever been backed up to this account yet. */
export async function listMachineFolders(token: string): Promise<Array<string>> {
	try {
		const data = await apiCall("/files/list_folder", token, { path: ROOT_FOLDER, recursive: false });
		return (data.entries ?? [])
			.filter((e: { [".tag"]: string }) => e[".tag"] === "folder")
			.map((e: { name: string }) => e.name);
	} catch (e) {
		if (e instanceof DropboxError && /not_found/i.test(e.message)) { return []; }
		throw e;
	}
}

/** Lists backups for one machine's folder. A never-backed-up-yet machine (folder doesn't exist) is
 * an empty list, not an error. */
export async function listBackups(token: string, hostname: string): Promise<Array<DropboxBackupEntry>> {
	try {
		const data = await apiCall("/files/list_folder", token, { path: folderFor(hostname), recursive: false });
		return (data.entries ?? [])
			.filter((e: { [".tag"]: string }) => e[".tag"] === "file")
			.map((e: { path_lower: string; name: string; size: number; server_modified: string }) => ({
				path: e.path_lower, name: e.name, size: e.size, serverModified: e.server_modified,
			}));
	} catch (e) {
		if (e instanceof DropboxError && /not_found/i.test(e.message)) { return []; }
		throw e;
	}
}

export async function uploadBackup(token: string, hostname: string, filename: string, blob: Blob): Promise<DropboxBackupEntry> {
	const path = `${folderFor(hostname)}/${filename}`;
	const res = await fetch(`${CONTENT_API}/files/upload`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/octet-stream",
			"Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: true }),
		},
		body: blob,
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) { throw new DropboxError(data?.error_summary ?? `Upload failed (${res.status}).`); }
	return { path: data.path_lower, name: data.name, size: data.size, serverModified: data.server_modified };
}

export async function downloadBackup(token: string, path: string): Promise<Blob> {
	const res = await fetch(`${CONTENT_API}/files/download`, {
		method: "POST", headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path }) },
	});
	if (!res.ok) { throw new DropboxError(`Download failed (${res.status}).`); }
	return res.blob();
}

export async function deleteBackup(token: string, path: string): Promise<void> {
	await apiCall("/files/delete_v2", token, { path });
}

/** Verifies the token works at all (a cheap `users/get_current_account` call) - used by the
 * configuration panel's "Save" button to confirm the token before persisting it. */
export async function verifyToken(token: string): Promise<string> {
	const data = await apiCall("/users/get_current_account", token, null);
	return data?.name?.display_name ?? data?.email ?? "Dropbox account";
}
