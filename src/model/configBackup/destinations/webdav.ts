/**
 * WebDAV destination - targets self-hosted storage the Duet/3D-printing homelab crowd already runs:
 * Nextcloud, ownCloud, Synology NAS (WebDAV Station), or any generic WebDAV server. Plain HTTP Basic
 * auth over PUT/GET/DELETE/PROPFIND/MKCOL, so (like GitHub/Dropbox) there's no interactive-origin
 * restriction - this works from a plain-HTTP DWC page. CORS support varies by server: a server on the
 * same LAN reached over plain HTTP from a plain-HTTP DWC page needs no CORS headers at all (same
 * scheme, browsers only enforce CORS cross-origin); a different origin/HTTPS server does need the
 * server configured to allow it, which is outside this plugin's control - the UI should say so.
 */
export class WebDavError extends Error {
	constructor(message: string) { super(message); this.name = "WebDavError"; }
}

const ROOT_FOLDER = "Duet Config Backups";

function sanitiseSegment(name: string): string {
	return name.replace(/[^A-Za-z0-9_-]+/g, "_") || "machine";
}

function joinUrl(base: string, ...segments: Array<string>): string {
	let url = base.replace(/\/+$/, "");
	for (const seg of segments) { url += `/${encodeURIComponent(seg)}`; }
	return url;
}

function authHeader(username: string, password: string): string {
	return `Basic ${btoa(`${username}:${password}`)}`;
}

async function request(url: string, username: string, password: string, method: string, extraHeaders?: Record<string, string>, body?: BodyInit): Promise<Response> {
	let res: Response;
	try {
		res = await fetch(url, { method, headers: { Authorization: authHeader(username, password), ...extraHeaders }, body });
	} catch (e) {
		throw new WebDavError(`Could not reach the WebDAV server (${e instanceof Error ? e.message : String(e)}). If it's on a different origin than DWC, check its CORS configuration.`);
	}
	if (res.status === 401 || res.status === 403) { throw new WebDavError("Sign-in rejected - check the URL, username and password."); }
	return res;
}

/** Create a folder, tolerating "already exists" (405/409/412 depending on server). */
async function ensureCollection(baseUrl: string, username: string, password: string, path: string): Promise<void> {
	const res = await request(joinUrl(baseUrl, ...path.split("/").filter(Boolean)), username, password, "MKCOL");
	if (!res.ok && ![405, 409, 412].includes(res.status)) {
		throw new WebDavError(`Could not create the backup folder on the WebDAV server (status ${res.status}).`);
	}
}

async function ensureMachineFolder(baseUrl: string, username: string, password: string, hostname: string): Promise<void> {
	await ensureCollection(baseUrl, username, password, ROOT_FOLDER);
	await ensureCollection(baseUrl, username, password, `${ROOT_FOLDER}/${sanitiseSegment(hostname)}`);
}

export interface WebDavBackupEntry { path: string; name: string; size: number; lastModified: string | null }

/** Lists the per-machine subfolders under the shared backup root (the cross-machine restore path).
 * Empty (not an error) if the root folder doesn't exist yet - nothing has been backed up here. */
export async function listMachineFolders(baseUrl: string, username: string, password: string): Promise<Array<string>> {
	const rootUrl = joinUrl(baseUrl, ROOT_FOLDER);
	const res = await request(rootUrl, username, password, "PROPFIND", { Depth: "1" });
	if (res.status === 404) { return []; }
	if (!res.ok) { throw new WebDavError(`Could not list machines (status ${res.status}).`); }
	const xml = await res.text();
	return parseCollectionNames(xml, rootUrl);
}

function parseCollectionNames(xml: string, folderUrl: string): Array<string> {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const names: Array<string> = [];
	for (const node of findAllLocal(doc, "response")) {
		const href = findOneLocal(node, "href")?.textContent ?? "";
		const isCollection = findAllLocal(node, "collection").length > 0;
		if (!isCollection || !href) { continue; }
		const decodedHref = decodeURIComponent(href).replace(/\/$/, "");
		if (!decodedHref || decodeURIComponent(folderUrl).endsWith(decodedHref)) { continue; } // skip the folder's own entry
		names.push(decodedHref.split("/").filter(Boolean).pop() ?? decodedHref);
	}
	return names;
}

/** Verifies the server is reachable and the credentials work (a PROPFIND on the root). */
export async function verifyConnection(baseUrl: string, username: string, password: string): Promise<void> {
	const res = await request(baseUrl, username, password, "PROPFIND", { Depth: "0" });
	if (!res.ok) { throw new WebDavError(`The server responded with status ${res.status}.`); }
}

export async function listBackups(baseUrl: string, username: string, password: string, hostname: string): Promise<Array<WebDavBackupEntry>> {
	const folderUrl = joinUrl(baseUrl, ROOT_FOLDER, sanitiseSegment(hostname));
	const res = await request(folderUrl, username, password, "PROPFIND", { Depth: "1" });
	if (res.status === 404) { return []; } // machine never backed up yet
	if (!res.ok) { throw new WebDavError(`Could not list backups (status ${res.status}).`); }
	const xml = await res.text();
	return parsePropfindResponse(xml, folderUrl);
}

/** WebDAV servers vary in which namespace prefix they use for `DAV:` (`d:`, `D:`, `lp1:`, or none at
 * all with a default xmlns) - matching by local tag name rather than a namespace-aware query sidesteps
 * both that variance and inconsistent NS-query support across XML parsers (happy-dom's included). */
function localName(el: Element): string {
	const tag = el.tagName;
	const colon = tag.indexOf(":");
	return (colon === -1 ? tag : tag.slice(colon + 1)).toLowerCase();
}
function findAllLocal(root: Element | XMLDocument, tag: string): Array<Element> {
	return Array.from(root.querySelectorAll("*")).filter((el) => localName(el) === tag);
}
function findOneLocal(root: Element | XMLDocument, tag: string): Element | undefined {
	return findAllLocal(root, tag)[0];
}

/** Minimal WebDAV multistatus parser: enough to read file name/size/last-modified, skipping the
 * folder's own self-referencing entry and any nested collections. */
function parsePropfindResponse(xml: string, folderUrl: string): Array<WebDavBackupEntry> {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const responses = findAllLocal(doc, "response");
	const entries: Array<WebDavBackupEntry> = [];
	for (const node of responses) {
		const href = findOneLocal(node, "href")?.textContent ?? "";
		const isCollection = findAllLocal(node, "collection").length > 0;
		if (isCollection) { continue; }
		const decodedHref = decodeURIComponent(href);
		if (!decodedHref || decodeURIComponent(folderUrl).endsWith(decodedHref.replace(/\/$/, ""))) { continue; }
		const name = decodedHref.split("/").filter(Boolean).pop() ?? decodedHref;
		const sizeText = findOneLocal(node, "getcontentlength")?.textContent;
		const modifiedText = findOneLocal(node, "getlastmodified")?.textContent;
		entries.push({ path: href, name, size: sizeText ? Number(sizeText) : 0, lastModified: modifiedText ?? null });
	}
	return entries;
}

export async function uploadBackup(baseUrl: string, username: string, password: string, hostname: string, filename: string, blob: Blob): Promise<void> {
	await ensureMachineFolder(baseUrl, username, password, hostname);
	const url = joinUrl(baseUrl, ROOT_FOLDER, sanitiseSegment(hostname), filename);
	const res = await request(url, username, password, "PUT", { "Content-Type": "application/zip" }, blob);
	if (!res.ok) { throw new WebDavError(`Upload failed (status ${res.status}).`); }
}

export async function downloadBackup(baseUrl: string, username: string, password: string, hrefOrPath: string): Promise<Blob> {
	const url = hrefOrPath.startsWith("http") ? hrefOrPath : joinUrl(baseUrl, ...hrefOrPath.split("/").filter(Boolean));
	const res = await request(url, username, password, "GET");
	if (!res.ok) { throw new WebDavError(`Download failed (status ${res.status}).`); }
	return res.blob();
}

export async function deleteBackup(baseUrl: string, username: string, password: string, hrefOrPath: string): Promise<void> {
	const url = hrefOrPath.startsWith("http") ? hrefOrPath : joinUrl(baseUrl, ...hrefOrPath.split("/").filter(Boolean));
	const res = await request(url, username, password, "DELETE");
	if (!res.ok && res.status !== 404) { throw new WebDavError(`Delete failed (status ${res.status}).`); }
}
