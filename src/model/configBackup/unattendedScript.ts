/**
 * "Set up an unattended backup" (MISSING-FEATURES-PLAN §A5): generate ONE self-contained Node script that backs up a
 * Duet's configuration on a schedule, run by cron / Task Scheduler / systemd on any always-on machine.
 *
 * Why a script: a browser plugin cannot run with no tab open, and RepRapFirmware macros cannot make outbound HTTP calls
 * (SCHEDULED-BACKUPS-PLAN.md §1), so true unattended backup has to run somewhere else. The script keeps the trust
 * boundary obvious - user-owned code on the user's own machine, nothing uploaded anywhere - and removes the toil of
 * writing it.
 *
 * What it does: connects (standalone RepRapFirmware REST, or the DSF `/machine` API on an SBC), walks `0:/sys`,
 * `0:/macros` and `0:/filaments` (subfolders included), writes a dated folder, keeps the newest N, and exits non-zero
 * on failure so the scheduler notices. A run downloads into a `.partial` folder that is renamed only once complete, so a
 * failed run never leaves a half backup that retention would count.
 *
 * What it does NOT do (the UI says so): no redaction (WiFi and machine passwords are in those files, so the target folder
 * must be private), no encryption, no cloud upload, no restore path (restore stays in the plugin). The board password is
 * read from an environment variable at run time and is NEVER embedded in the script.
 *
 * Pure string generation: no imports from Flexible Layouts or DWC, so it can move into `dwc-config-backup-core` and be
 * shared with the standalone plugins unchanged.
 */

export type UnattendedFlavour = "standalone" | "sbc";

export interface UnattendedOptions {
	/** Host name or address, with a port if it is not the default: `duet3.local`, `192.168.1.50`, `printer:8080`. */
	host: string;
	/** Default "http". */
	protocol?: "http" | "https";
	/** RepRapFirmware REST (`standalone`) or the DuetSoftwareFramework API of an SBC (`sbc`). */
	flavour: UnattendedFlavour;
	/** How many dated backups to keep (newest first). Default 14. */
	keep?: number;
	/** Folders to back up. Default `0:/sys`, `0:/macros`, `0:/filaments`. `0:/sys` is required to exist; the rest are optional. */
	folders?: Array<string>;
	/** Where the dated folders go. Default `./duet-backups`. */
	outDir?: string;
	/** Name of the environment variable holding the board password. Default `DUET_PASSWORD`. */
	passwordEnv?: string;
}

export interface ResolvedUnattendedOptions {
	host: string;
	protocol: "http" | "https";
	flavour: UnattendedFlavour;
	keep: number;
	folders: Array<string>;
	outDir: string;
	passwordEnv: string;
}

export const DEFAULT_UNATTENDED_FOLDERS = ["0:/sys", "0:/macros", "0:/filaments"] as const;
export const UNATTENDED_SCRIPT_FILENAME = "duet-backup.mjs";

export class UnattendedOptionsError extends Error {
	constructor(readonly field: string, message: string) {
		super(message);
		this.name = "UnattendedOptionsError";
	}
}

const HOST_RE = /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?)(:\d{1,5})?$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
// A board path: a drive, then names free of what a Duet's own file system refuses (backslash, quote, * ? < > | and a colon).
const FOLDER_RE = /^\d+:\/[^\0\\"*?<>|:]*$/;

/** Validate and fill in defaults. Throws `UnattendedOptionsError` naming the bad field - nothing is silently corrected. */
export function resolveUnattendedOptions(o: UnattendedOptions): ResolvedUnattendedOptions {
	const host = (o.host ?? "").trim();
	if (!host || !HOST_RE.test(host)) { throw new UnattendedOptionsError("host", `Not a usable host name or address: "${o.host}"`); }
	const protocol = o.protocol ?? "http";
	if (protocol !== "http" && protocol !== "https") { throw new UnattendedOptionsError("protocol", `Protocol must be http or https, not "${String(o.protocol)}"`); }
	if (o.flavour !== "standalone" && o.flavour !== "sbc") { throw new UnattendedOptionsError("flavour", `Flavour must be "standalone" or "sbc"`); }
	const keep = o.keep ?? 14;
	if (!Number.isInteger(keep) || keep < 1 || keep > 365) { throw new UnattendedOptionsError("keep", "Keep must be a whole number from 1 to 365"); }
	const folders = (o.folders ?? [...DEFAULT_UNATTENDED_FOLDERS]).map((f) => f.trim().replace(/\/+$/, ""));
	if (folders.length === 0) { throw new UnattendedOptionsError("folders", "Choose at least one folder"); }
	for (const f of folders) {
		if (!FOLDER_RE.test(f) || f.split("/").includes("..")) { throw new UnattendedOptionsError("folders", `Not a valid board folder: "${f}" (expected something like 0:/sys)`); }
	}
	const passwordEnv = o.passwordEnv ?? "DUET_PASSWORD";
	if (!ENV_RE.test(passwordEnv)) { throw new UnattendedOptionsError("passwordEnv", `Not a valid environment variable name: "${passwordEnv}"`); }
	const outDir = (o.outDir ?? "./duet-backups").trim();
	if (!outDir || outDir.includes("\0")) { throw new UnattendedOptionsError("outDir", "Choose an output folder"); }
	return { host, protocol, flavour: o.flavour, keep, folders: [...new Set(folders)], outDir, passwordEnv };
}

/**
 * Which flavour a connected machine is, from its object model: an attached SBC reports `state.dsfVersion` (and, on newer
 * firmware, an `sbc` section). Anything else is a standalone board.
 */
export function detectFlavour(model: unknown): UnattendedFlavour {
	const m = (model ?? {}) as { state?: { dsfVersion?: unknown }; sbc?: unknown };
	return m.state?.dsfVersion || (m.sbc && typeof m.sbc === "object") ? "sbc" : "standalone";
}

/** The generated script's body. Contains no `${}` placeholders and no backticks: the only thing injected is CONFIG. */
const SCRIPT_BODY = String.raw`
import { access, mkdir, writeFile, rename, rm, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const log = (m) => console.log(new Date().toISOString() + "  " + m);

class Fail extends Error {
	constructor(message, code = 1) { super(message); this.code = code; }
}
class NotFound extends Error {}

const base = CONFIG.protocol + "//" + CONFIG.host + "/";
const password = process.env[CONFIG.passwordEnv] ?? "";
let sessionKey = null;

function pad(n) { return String(n).padStart(2, "0"); }
// A Duet's rr_connect wants the local time as YYYY-MM-DDTHH:mm:ss.
function localTime(d = new Date()) {
	return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}
// A sortable UTC stamp: 20260930-101530.
function utcStamp(d = new Date()) {
	return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "-" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
}

async function call(path, query = {}) {
	const url = new URL(path, base);
	for (const [k, v] of Object.entries(query)) { url.searchParams.set(k, String(v)); }
	const headers = sessionKey ? { "X-Session-Key": sessionKey } : {};
	try {
		return await fetch(url, { headers, signal: AbortSignal.timeout(CONFIG.timeoutMs) });
	} catch (e) {
		throw new Fail("cannot reach " + url.origin + " (" + ((e && e.cause && e.cause.code) || (e && e.message) || e) + ")");
	}
}

async function json(res, what) {
	try { return await res.json(); } catch { throw new Fail("unexpected reply from " + what); }
}

// ---- standalone RepRapFirmware (REST: rr_connect / rr_filelist / rr_download) --------------------------------
const standalone = {
	async connect() {
		const res = await call("rr_connect", { password, time: localTime(), sessionKey: "yes" });
		const body = await json(res, "rr_connect");
		if (body.err === 1) { throw new Fail("the board rejected the password (set the " + CONFIG.passwordEnv + " environment variable)", 2); }
		if (body.err === 2) { throw new Fail("the board has no free sessions right now", 3); }
		if (body.err !== 0) { throw new Fail("rr_connect failed (err " + body.err + ")"); }
		sessionKey = body.sessionKey ?? null;
	},
	async disconnect() { await call("rr_disconnect"); },
	async list(dir) {
		const out = [];
		let next = 0;
		do {
			const body = await json(await call("rr_filelist", { dir, first: next }), "rr_filelist");
			if (body.err === 1) { throw new NotFound("drive not mounted for " + dir); }
			if (body.err === 2) { throw new NotFound(dir); }
			out.push(...(body.files ?? []));
			next = body.next ?? 0;
		} while (next !== 0);
		return out;
	},
	async download(path) {
		const res = await call("rr_download", { name: path });
		if (!res.ok) { throw new Fail("could not download " + path + " (HTTP " + res.status + ")"); }
		return Buffer.from(await res.arrayBuffer());
	},
};

// ---- SBC (DuetSoftwareFramework: /machine/connect, /machine/directory, /machine/file) --------------------------
const sbc = {
	async connect() {
		const res = await call("machine/connect", { password });
		if (res.status === 403) { throw new Fail("the board rejected the password (set the " + CONFIG.passwordEnv + " environment variable)", 2); }
		if (res.status === 503) { throw new Fail("the board has no free sessions right now", 3); }
		if (res.status === 404) { return; } // firmware older than 3.4 has no sessions or passwords
		if (!res.ok) { throw new Fail("machine/connect failed (HTTP " + res.status + ")"); }
		const body = await json(res, "machine/connect");
		sessionKey = body.sessionKey ?? null;
	},
	async disconnect() { await call("machine/disconnect"); },
	async list(dir) {
		const res = await call("machine/directory/" + encodeURIComponent(dir));
		if (res.status === 404) { throw new NotFound(dir); }
		if (!res.ok) { throw new Fail("could not list " + dir + " (HTTP " + res.status + ")"); }
		const body = await json(res, "machine/directory");
		return Array.isArray(body) ? body : [];
	},
	async download(path) {
		const res = await call("machine/file/" + encodeURIComponent(path));
		if (!res.ok) { throw new Fail("could not download " + path + " (HTTP " + res.status + ")"); }
		return Buffer.from(await res.arrayBuffer());
	},
};

const board = CONFIG.flavour === "sbc" ? sbc : standalone;

// A name from the board becomes a local file name, so refuse anything that could escape the backup folder.
function safeName(name) {
	return typeof name === "string" && name !== "" && name !== "." && name !== ".." && !/[\\/:*?"<>|\u0000-\u001f]/.test(name);
}

async function walk(dir, rel, out) {
	for (const entry of await board.list(dir)) {
		if (!safeName(entry.name)) { log("skipping an entry with an unsafe name in " + dir); continue; }
		if (entry.type === "d") { await walk(dir + "/" + entry.name, rel + "/" + entry.name, out); }
		else { out.push({ path: dir + "/" + entry.name, rel: rel + "/" + entry.name }); }
	}
}

const stripDrive = (folder) => folder.replace(/^\d+:\//, "");

// Two runs in the same second must not collide: the second gets a -2, -3, ... suffix (which still sorts after the first).
async function uniqueFolder(root, stamp) {
	for (let n = 1; n < 1000; n++) {
		const name = n === 1 ? stamp : stamp + "-" + n;
		try { await access(join(root, name)); } catch { return name; }
	}
	throw new Fail("could not find a free folder name under " + root);
}

async function prune(root) {
	const done = (await readdir(root)).filter((n) => /^\d{8}-\d{6}(-\d+)?$/.test(n)).sort().reverse();
	for (const old of done.slice(CONFIG.keep)) {
		await rm(join(root, old), { recursive: true, force: true });
		log("removed old backup " + old);
	}
}

async function main() {
	const root = resolve(CONFIG.outDir, CONFIG.host.replace(/[^A-Za-z0-9.-]/g, "-"));
	await mkdir(root, { recursive: true });
	// A run that was killed part-way leaves a .partial folder behind; it is never counted, so just clear it away.
	for (const n of await readdir(root)) { if (n.endsWith(".partial")) { await rm(join(root, n), { recursive: true, force: true }); } }
	const name = await uniqueFolder(root, utcStamp());
	const partial = join(root, name + ".partial");
	const final = join(root, name);
	await mkdir(partial, { recursive: true });
	let connected = false;
	try {
		await board.connect();
		connected = true;
		let files = 0;
		let bytes = 0;
		for (const folder of CONFIG.folders) {
			const found = [];
			try {
				await walk(folder, stripDrive(folder), found);
			} catch (e) {
				if (e instanceof NotFound && !CONFIG.required.includes(folder)) { log("skipping " + folder + " (not on this board)"); continue; }
				if (e instanceof NotFound) { throw new Fail("required folder " + folder + " was not found on the board"); }
				throw e;
			}
			for (const file of found) {
				const data = await board.download(file.path);
				const dest = join(partial, ...file.rel.split("/"));
				await mkdir(dirname(dest), { recursive: true });
				await writeFile(dest, data);
				files += 1;
				bytes += data.length;
			}
		}
		if (files === 0) { throw new Fail("nothing was downloaded - is the folder list right?"); }
		await rename(partial, final);
		log("backed up " + files + " files (" + bytes + " bytes) to " + final);
	} catch (e) {
		await rm(partial, { recursive: true, force: true });
		throw e;
	} finally {
		if (connected) { await board.disconnect().catch(() => {}); }
	}
	await prune(root);
}

main().then(
	() => process.exit(0),
	(e) => {
		console.error(new Date().toISOString() + "  FAILED: " + (e && e.message ? e.message : e));
		process.exit(e && typeof e.code === "number" ? e.code : 1);
	},
);
`;

/** Text of the standalone script for these options. The board password is not in it - only the NAME of the variable to read. */
export function generateUnattendedScript(options: UnattendedOptions): string {
	const o = resolveUnattendedOptions(options);
	const config = {
		host: o.host,
		protocol: `${o.protocol}:`,
		flavour: o.flavour,
		keep: o.keep,
		folders: o.folders,
		required: ["0:/sys"].filter((f) => o.folders.includes(f)),
		outDir: o.outDir,
		passwordEnv: o.passwordEnv,
		timeoutMs: 30000,
	};
	return [
		"#!/usr/bin/env node",
		"// Unattended Duet configuration backup - generated by Flexible Layouts (a plugin for DuetWebControl).",
		"//",
		`// Backs up ${o.folders.join(", ")} from ${o.protocol}://${o.host} (${o.flavour === "sbc" ? "SBC / DuetSoftwareFramework" : "standalone RepRapFirmware"}),`,
		`// into dated folders under ${o.outDir}, keeping the newest ${o.keep}. Needs Node 18 or newer and nothing else.`,
		"//",
		`// The board password is read from the ${o.passwordEnv} environment variable - it is NOT stored in this file.`,
		"// Exit codes: 0 ok - 1 failed - 2 wrong password - 3 no free session on the board.",
		"//",
		"// WARNING: the backed-up files are copied as they are - config.g etc. can contain WiFi and machine passwords -",
		"// so keep the output folder private. Nothing is encrypted, redacted or uploaded anywhere.",
		"",
		`const CONFIG = ${JSON.stringify(config, null, "\t")};`,
		SCRIPT_BODY,
	].join("\n");
}

// #region scheduler snippets
export interface SchedulerSnippets {
	cron: string;
	schtasks: string;
	systemdService: string;
	systemdTimer: string;
}

/** Ready-to-paste scheduling for the three usual places. `scriptPath` is where the user saved the script. */
export function schedulerSnippets(options: UnattendedOptions, scriptPath: string = `/path/to/${UNATTENDED_SCRIPT_FILENAME}`, hour = 3): SchedulerSnippets {
	const o = resolveUnattendedOptions(options);
	const h = Math.min(23, Math.max(0, Math.floor(hour)));
	const winPath = scriptPath.replace(/\//g, "\\");
	return {
		cron: [
			"# Every day at " + String(h).padStart(2, "0") + ":00. Put the board password in the crontab (or a file it sources) - chmod 600 it.",
			`${o.passwordEnv}='your-board-password'`,
			`0 ${h} * * * /usr/bin/env node "${scriptPath}" >> "$HOME/duet-backup.log" 2>&1`,
		].join("\n"),
		schtasks: [
			`REM One-off: store the board password for your user (not in the script).`,
			`setx ${o.passwordEnv} "your-board-password"`,
			`REM Every day at ${String(h).padStart(2, "0")}:00 (open a NEW terminal after setx so it sees the variable).`,
			`schtasks /Create /SC DAILY /ST ${String(h).padStart(2, "0")}:00 /TN "Duet config backup" /TR "cmd /c node \\"${winPath}\\" >> \\"%USERPROFILE%\\duet-backup.log\\" 2>&1"`,
		].join("\n"),
		systemdService: [
			"# /etc/systemd/system/duet-backup.service",
			"[Unit]",
			"Description=Back up the Duet configuration",
			"After=network-online.target",
			"Wants=network-online.target",
			"",
			"[Service]",
			"Type=oneshot",
			`Environment=${o.passwordEnv}=your-board-password`,
			`ExecStart=/usr/bin/env node ${scriptPath}`,
		].join("\n"),
		systemdTimer: [
			"# /etc/systemd/system/duet-backup.timer   (then: systemctl enable --now duet-backup.timer)",
			"[Unit]",
			"Description=Daily Duet configuration backup",
			"",
			"[Timer]",
			`OnCalendar=*-*-* ${String(h).padStart(2, "0")}:00:00`,
			"Persistent=true",
			"",
			"[Install]",
			"WantedBy=timers.target",
		].join("\n"),
	};
}
// #endregion
