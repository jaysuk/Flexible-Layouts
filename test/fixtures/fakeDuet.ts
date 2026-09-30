/**
 * A tiny fake Duet that serves a virtual file tree over BOTH protocols the unattended-backup script speaks:
 * standalone RepRapFirmware REST (rr_connect / rr_filelist / rr_download / rr_disconnect) and the SBC's DuetSoftwareFramework
 * API (machine/connect / machine/directory / machine/file / machine/disconnect). The protocol details mirror what DWC's own
 * connectors send (see @duet3d/connectors PollConnector / RestConnector).
 *
 * The kit's `createMockDuet` cannot be used for this: its rr_filelist is always empty and it has no rr_download.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeDuetOptions {
	flavour: "standalone" | "sbc";
	/** Virtual files: `"0:/sys/config.g"` -> content. */
	files: Record<string, string | Buffer>;
	/** Directories that exist but are empty. */
	emptyDirs?: Array<string>;
	password?: string;
	/** rr_filelist returns at most this many entries per call, exercising the `next` paging. */
	pageSize?: number;
	/** Every reply after connect needs the X-Session-Key header (like a password-protected board). */
	requireSession?: boolean;
	/** Refuse connects as if every session were taken. */
	noFreeSessions?: boolean;
	/** Make downloads of these paths fail with a 500. */
	failDownloads?: Array<string>;
	/** Extra raw entries to put in a directory listing (path -> entries), e.g. hostile names. */
	extraEntries?: Record<string, Array<{ type: "f" | "d"; name: string }>>;
}

export interface FakeDuet {
	server: Server;
	port: number;
	host: string;
	requests: Array<string>;
	connects: number;
	disconnects: number;
	close(): Promise<void>;
}

interface Entry { type: "f" | "d"; name: string; size: number; date: string }

function children(opts: FakeDuetOptions, dir: string): Array<Entry> | null {
	const prefix = dir.endsWith("/") ? dir : `${dir}/`;
	const seen = new Map<string, Entry>();
	// A drive root always exists; any other directory exists when something is in it or it was declared empty.
	let exists = (opts.emptyDirs ?? []).includes(dir) || /^\d+:\/?$/.test(dir);
	for (const [path, content] of Object.entries(opts.files)) {
		if (!path.startsWith(prefix)) { continue; }
		exists = true;
		const rest = path.slice(prefix.length);
		const slash = rest.indexOf("/");
		const name = slash < 0 ? rest : rest.slice(0, slash);
		seen.set(name, slash < 0
			? { type: "f", name, size: Buffer.byteLength(content), date: "2026-09-30T10:00:00" }
			: { type: "d", name, size: 0, date: "2026-09-30T10:00:00" });
	}
	for (const extra of opts.extraEntries?.[dir] ?? []) {
		exists = true;
		seen.set(extra.name, { ...extra, size: 0, date: "2026-09-30T10:00:00" });
	}
	return exists ? [...seen.values()] : null;
}

export async function startFakeDuet(opts: FakeDuetOptions): Promise<FakeDuet> {
	const requests: Array<string> = [];
	const state = { connects: 0, disconnects: 0 };
	const SESSION = "sess-4242";

	const send = (res: ServerResponse, body: unknown, status = 200) => {
		res.writeHead(status, { "content-type": "application/json" });
		res.end(JSON.stringify(body));
	};
	const bytes = (res: ServerResponse, data: string | Buffer) => {
		res.writeHead(200, { "content-type": "application/octet-stream" });
		res.end(data);
	};
	const authed = (req: IncomingMessage) => !opts.requireSession || req.headers["x-session-key"] === SESSION;

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://fake");
		const p = url.pathname;
		requests.push(`${req.method} ${p}${url.search}`);
		const q = url.searchParams;

		if (opts.flavour === "standalone") {
			if (p === "/rr_connect") {
				if (opts.noFreeSessions) { return send(res, { err: 2 }); }
				if ((opts.password ?? "") !== (q.get("password") ?? "")) { return send(res, { err: 1 }); }
				state.connects++;
				return send(res, { err: 0, sessionTimeout: 8000, apiLevel: 1, sessionKey: SESSION, boardType: "fake" });
			}
			if (p === "/rr_disconnect") { state.disconnects++; return send(res, { err: 0 }); }
			if (!authed(req)) { return send(res, {}, 401); }
			if (p === "/rr_filelist") {
				const dir = q.get("dir") ?? "";
				const first = Number(q.get("first") ?? 0);
				const all = children(opts, dir);
				if (all === null) { return send(res, { err: 2 }); }
				const size = opts.pageSize ?? all.length + 1;
				const page = all.slice(first, first + size);
				const next = first + size < all.length ? first + size : 0;
				return send(res, { dir, first, files: page, next });
			}
			if (p === "/rr_download") {
				const name = q.get("name") ?? "";
				if ((opts.failDownloads ?? []).includes(name)) { return send(res, {}, 500); }
				const file = opts.files[name];
				return file === undefined ? send(res, {}, 404) : bytes(res, file);
			}
			return send(res, {}, 404);
		}

		// SBC / DuetSoftwareFramework
		if (p === "/machine/connect") {
			if (opts.noFreeSessions) { return send(res, {}, 503); }
			if ((opts.password ?? "") !== (q.get("password") ?? "")) { return send(res, {}, 403); }
			state.connects++;
			return send(res, { sessionKey: SESSION, apiLevel: 4 });
		}
		if (p === "/machine/disconnect") { state.disconnects++; return send(res, {}); }
		if (!authed(req)) { return send(res, {}, 401); }
		if (p.startsWith("/machine/directory/")) {
			const dir = decodeURIComponent(p.slice("/machine/directory/".length));
			const all = children(opts, dir);
			return all === null ? send(res, {}, 404) : send(res, all);
		}
		if (p.startsWith("/machine/file/")) {
			const name = decodeURIComponent(p.slice("/machine/file/".length));
			if ((opts.failDownloads ?? []).includes(name)) { return send(res, {}, 500); }
			const file = opts.files[name];
			return file === undefined ? send(res, {}, 404) : bytes(res, file);
		}
		return send(res, {}, 404);
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as AddressInfo).port;
	return {
		server,
		port,
		host: `127.0.0.1:${port}`,
		requests,
		get connects() { return state.connects; },
		get disconnects() { return state.disconnects; },
		close: () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
	};
}
