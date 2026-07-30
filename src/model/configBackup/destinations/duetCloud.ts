/**
 * Duet backup service destination (§6 Phase 6). Talks to the shared `duet-backup-backend` (Express,
 * JWT bearer auth over the user's Duet3D forum credentials). Three backend realities this module
 * works around - see CONFIG-BACKUP-PLAN.md §2.1/§2.3 for the full writeup:
 *
 * 1. Upload/download use the ZIP endpoints (`/api/upload-backup-zip` /
 *    `/api/download-backup-zip-by-id`), NOT the expanded-files pair - kept adjacent below in case that
 *    ever needs to change, since switching one without the other breaks restore. Consequence: a hard
 *    2 MB cap enforced server-side, so callers MUST pre-flight `blob.size` themselves.
 * 2. `DELETE /api/delete-backup-by-id/:id` has a server bug (db-functions.js reads `.deletedCount` off
 *    an un-awaited Promise) that makes it return 500 even when the delete succeeded. `deleteBackup`
 *    below treats a non-2xx as INDETERMINATE and re-lists to check whether the entry is actually gone
 *    before reporting failure.
 * 3. There is no server-side FIFO - the "keep at most N backups per machine" limit is entirely this
 *    module's job (`pruneToLimit`).
 */
import { DUET_DOWNLOAD_PATH, DUET_FIFO_MAX_LIMIT, DUET_FIFO_MIN_LIMIT, DUET_UPLOAD_MAX_BYTES, DUET_UPLOAD_PATH } from "../constants";
// The expanded-files alternative (no size cap), kept adjacent per the plan - switching endpoints
// means switching both this file's paths AND the download pairing above, together:
// const DUET_UPLOAD_PATH = "/api/upload-backup"; const DUET_DOWNLOAD_PATH = "/api/download-backup-by-id";
import { getDuetCloudSession, setDuetCloudSession } from "../credentials";
import type { DuetCloudSession } from "../credentials";

export class DuetCloudError extends Error {
	constructor(message: string, public status?: number) { super(message); this.name = "DuetCloudError"; }
}

export interface MachineSummary { boardGuid: string; machineHostname: string; backupCount: number; latestBackupDate: string; latestBackupId: number }
export interface BackupSummary { id: number; timestamp: string; machine: string; machineHostname: string; boardGuid: string }

function authHeaders(): Record<string, string> {
	const session = getDuetCloudSession();
	if (!session) { throw new DuetCloudError("Not signed in."); }
	return { Authorization: `Bearer ${session.token}` };
}

function assertHttpsCompatible(apiUrl: string): void {
	if (typeof location !== "undefined" && location.protocol === "https:" && apiUrl.startsWith("http://")) {
		throw new DuetCloudError("This page is loaded over HTTPS but the backup service URL is plain HTTP, which browsers block. Download the backup locally instead.");
	}
}

export async function login(apiUrl: string, email: string, password: string): Promise<DuetCloudSession> {
	assertHttpsCompatible(apiUrl);
	const res = await fetch(`${apiUrl}/api/auth/connect/login`, {
		method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
	});
	const data = await res.json().catch(() => null);
	if (!res.ok || !data || data.logged_in !== true || !data.token) {
		throw new DuetCloudError("Sign in failed. Check your email and password.");
	}
	const session: DuetCloudSession = { token: data.token, username: data.username ?? email, expiresAt: Date.now() + 59 * 24 * 60 * 60 * 1000 };
	setDuetCloudSession(session);
	return session;
}

export function logout(): void {
	setDuetCloudSession(null);
}

function mapBackupEntry(e: Record<string, unknown>): BackupSummary {
	return {
		id: e.incr_id as number, timestamp: e.timestamp as string, machine: e.machine as string,
		machineHostname: e.machine_hostname as string, boardGuid: e.board_guid as string,
	};
}

// Some deployments of the shared backend predate the guid-scoped `get-machine-list` /
// `get-backup-list-by-guid` routes and only have the older flat `get-backup-list` (every backup for
// the signed-in user, across all their machines, unfiltered). Confirmed by direct probing against a
// live deployment: the scoped routes came back as Express's own "no route registered here" 404 while
// the flat one correctly 401'd on a bad token - i.e. genuinely absent, not an auth or data problem.
// Every entry already carries board_guid/machine_hostname, so both listMachines/listBackups can
// recover by fetching the flat list once and doing the grouping/filtering client-side instead.
async function fetchFlatBackupList(apiUrl: string): Promise<Array<BackupSummary>> {
	const res = await fetch(`${apiUrl}/api/get-backup-list`, { headers: authHeaders() });
	if (!res.ok) { throw new DuetCloudError("Could not list backups.", res.status); }
	const data = await res.json();
	return (Array.isArray(data) ? data : []).map(mapBackupEntry);
}

export async function listMachines(apiUrl: string): Promise<Array<MachineSummary>> {
	assertHttpsCompatible(apiUrl);
	const res = await fetch(`${apiUrl}/api/get-machine-list`, { headers: authHeaders() });
	if (res.status === 404) {
		const flat = await fetchFlatBackupList(apiUrl);
		const byGuid = new Map<string, Array<BackupSummary>>();
		for (const b of flat) {
			if (!byGuid.has(b.boardGuid)) { byGuid.set(b.boardGuid, []); }
			byGuid.get(b.boardGuid)!.push(b);
		}
		return [...byGuid.entries()].map(([boardGuid, entries]) => {
			const latest = [...entries].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
			return {
				boardGuid, machineHostname: latest.machineHostname, backupCount: entries.length,
				latestBackupDate: latest.timestamp, latestBackupId: latest.id,
			};
		});
	}
	if (!res.ok) { throw new DuetCloudError("Could not list machines.", res.status); }
	const data = await res.json();
	return (Array.isArray(data) ? data : []).map((m) => ({
		boardGuid: m.board_guid, machineHostname: m.machine_hostname, backupCount: m.backup_count,
		latestBackupDate: m.latest_backup_date, latestBackupId: m.latest_backup_id,
	}));
}

export async function listBackups(apiUrl: string, boardGuid: string): Promise<Array<BackupSummary>> {
	assertHttpsCompatible(apiUrl);
	const res = await fetch(`${apiUrl}/api/get-backup-list-by-guid/${encodeURIComponent(boardGuid)}`, { headers: authHeaders() });
	if (res.status === 404) {
		const flat = await fetchFlatBackupList(apiUrl);
		return flat.filter((b) => b.boardGuid === boardGuid);
	}
	if (!res.ok) { throw new DuetCloudError("Could not list backups.", res.status); }
	const data = await res.json();
	return (Array.isArray(data) ? data : []).map(mapBackupEntry);
}

export interface SizePreflightResult { ok: boolean; size: number; limit: number }

/** MUST be called before uploadBackup - never a blind POST past the server's hard cap. */
export function preflightSize(blob: Blob): SizePreflightResult {
	return { ok: blob.size <= DUET_UPLOAD_MAX_BYTES, size: blob.size, limit: DUET_UPLOAD_MAX_BYTES };
}

export async function uploadBackup(apiUrl: string, blob: Blob, meta: { machine: string; hostname: string; guid: string }): Promise<BackupSummary> {
	assertHttpsCompatible(apiUrl);
	const preflight = preflightSize(blob);
	if (!preflight.ok) {
		throw new DuetCloudError(`This backup is ${(preflight.size / (1024 * 1024)).toFixed(2)} MB, over the 2 MB limit for the cloud service.`);
	}
	const form = new FormData();
	// Filename + explicit zip MIME type are BOTH required - the server's multer fileFilter rejects
	// anything else, regardless of the FormData field name.
	form.append("file", new File([blob], "backup.zip", { type: "application/zip" }));
	form.append("machine", meta.machine);
	form.append("hostname", meta.hostname);
	form.append("guid", meta.guid);
	const res = await fetch(`${apiUrl}${DUET_UPLOAD_PATH}`, { method: "POST", headers: authHeaders(), body: form });
	const data = await res.json().catch(() => null);
	if (!res.ok || !data?.entry) { throw new DuetCloudError(data?.message ?? "Upload failed.", res.status); }
	const e = data.entry;
	return { id: e.incr_id, timestamp: e.timestamp, machine: e.machine, machineHostname: e.machine_hostname, boardGuid: e.board_guid };
}

export async function downloadBackup(apiUrl: string, id: number): Promise<Blob> {
	assertHttpsCompatible(apiUrl);
	const res = await fetch(`${apiUrl}${DUET_DOWNLOAD_PATH}/${id}`, { headers: authHeaders() });
	if (!res.ok) { throw new DuetCloudError("Download failed.", res.status); }
	return res.blob();
}

/**
 * Delete one backup. Tolerates the server bug that returns 500 even on a successful delete: a
 * non-2xx response is re-checked by re-listing the machine's backups rather than trusted at face
 * value.
 */
export async function deleteBackup(apiUrl: string, id: number, boardGuid: string): Promise<boolean> {
	assertHttpsCompatible(apiUrl);
	const res = await fetch(`${apiUrl}/api/delete-backup-by-id/${id}`, { method: "DELETE", headers: authHeaders() });
	if (res.ok) { return true; }
	const stillThere = (await listBackups(apiUrl, boardGuid)).some((b) => b.id === id);
	return !stillThere;
}

export interface PruneResult { prunedIds: Array<number>; failedIds: Array<number> }

/**
 * FIFO enforcement (§2.2 D6, §6 Phase 6): after a successful upload, delete the oldest backups for
 * this machine beyond `limit`. Best-effort - a prune failure is reported but never fails the backup
 * that triggered it.
 */
export async function pruneToLimit(apiUrl: string, boardGuid: string, limit: number): Promise<PruneResult> {
	const clamped = Math.min(Math.max(limit, DUET_FIFO_MIN_LIMIT), DUET_FIFO_MAX_LIMIT);
	const backups = await listBackups(apiUrl, boardGuid);
	const sorted = [...backups].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
	const excess = sorted.slice(0, Math.max(0, sorted.length - clamped));
	const prunedIds: Array<number> = [];
	const failedIds: Array<number> = [];
	for (const b of excess) {
		try {
			const ok = await deleteBackup(apiUrl, b.id, boardGuid);
			(ok ? prunedIds : failedIds).push(b.id);
		} catch {
			failedIds.push(b.id);
		}
	}
	return { prunedIds, failedIds };
}
