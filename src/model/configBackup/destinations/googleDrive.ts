/**
 * Google Drive destination (§6 Phase 8). Google requires an HTTPS (or localhost) JavaScript origin
 * to sign in - DWC is normally served as `http://<printer-ip>`, which Google refuses outright. This
 * is not something the plugin can work around, so `isOriginSupported` is checked FIRST and the UI
 * shows a plain explanation instead of attempting (and failing) a broken sign-in flow.
 *
 * Uses `drive.file` scope only - the plugin can never see the user's other Drive files, only ones it
 * creates itself. The OAuth token is memory-only (never persisted); only the user-supplied client ID
 * is stored (in credentials.ts).
 */

export class GoogleDriveError extends Error {
	constructor(message: string) { super(message); this.name = "GoogleDriveError"; }
}

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const BACKUP_FOLDER_NAME = "Duet Config Backups";

/** Google's own origin requirement for its Identity Services sign-in flow. */
export function isOriginSupported(loc: Pick<Location, "protocol" | "hostname"> = location): boolean {
	return loc.protocol === "https:" || loc.hostname === "localhost";
}

interface TokenClient { requestAccessToken(overrides?: { prompt?: string }): void }
interface GoogleAccountsGlobal { accounts: { oauth2: { initTokenClient(config: { client_id: string; scope: string; callback: (resp: { access_token?: string; error?: string }) => void }): TokenClient } } }

function getGoogleGlobal(): GoogleAccountsGlobal | undefined {
	return (globalThis as unknown as { google?: GoogleAccountsGlobal }).google;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
	if (getGoogleGlobal()) { return Promise.resolve(); }
	if (scriptLoadPromise) { return scriptLoadPromise; }
	scriptLoadPromise = new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = GIS_SCRIPT_URL;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new GoogleDriveError("Could not load Google's sign-in script."));
		document.head.appendChild(script);
	});
	return scriptLoadPromise;
}

/** Interactive sign-in; resolves with a short-lived access token (memory-only - never persisted). */
export async function signIn(clientId: string): Promise<string> {
	if (!isOriginSupported()) {
		throw new GoogleDriveError("Google sign-in requires this page to be loaded over HTTPS (or localhost).");
	}
	await loadGisScript();
	const google = getGoogleGlobal();
	if (!google) { throw new GoogleDriveError("Google's sign-in script did not load correctly."); }
	return new Promise<string>((resolve, reject) => {
		const client = google.accounts.oauth2.initTokenClient({
			client_id: clientId,
			scope: DRIVE_SCOPE,
			callback: (resp) => {
				if (resp.access_token) { resolve(resp.access_token); } else { reject(new GoogleDriveError(resp.error ?? "Sign-in was cancelled or failed.")); }
			},
		});
		client.requestAccessToken();
	});
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
	const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers as Record<string, string> | undefined) } });
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new GoogleDriveError(body?.error?.message ?? `Google Drive API error (${res.status}).`);
	}
	return res.status === 204 ? null : res.json();
}

async function findOrCreateFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
	const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ""}`);
	const list = await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
	if (list.files?.length > 0) { return list.files[0].id; }
	const created = await driveFetch(accessToken, "https://www.googleapis.com/drive/v3/files", {
		method: "POST", headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
	});
	return created.id;
}

export interface UploadResult { fileId: string; webViewLink?: string }

/** Upload a backup ZIP into `Duet Config Backups/<hostname>/<filename>`, creating folders as needed. */
export async function uploadBackup(accessToken: string, hostname: string, filename: string, blob: Blob): Promise<UploadResult> {
	const rootFolder = await findOrCreateFolder(accessToken, BACKUP_FOLDER_NAME);
	const machineFolder = await findOrCreateFolder(accessToken, hostname, rootFolder);

	const metadata = { name: filename, parents: [machineFolder] };
	const boundary = `flexlayouts-${Date.now()}`;
	const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
	const filePartHeader = `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`;
	const closing = `\r\n--${boundary}--`;
	const body = new Blob([metadataPart, filePartHeader, blob, closing]);

	const created = await driveFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
		method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
	});
	return { fileId: created.id, webViewLink: created.webViewLink };
}
