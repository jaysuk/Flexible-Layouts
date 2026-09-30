// @vitest-environment node
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
	detectFlavour, generateUnattendedScript, resolveUnattendedOptions, schedulerSnippets, UnattendedOptionsError,
	type UnattendedFlavour, type UnattendedOptions,
} from "../src/model/configBackup/unattendedScript";
import { startFakeDuet, type FakeDuet, type FakeDuetOptions } from "./fixtures/fakeDuet";

const run = promisify(execFile);

describe("resolveUnattendedOptions", () => {
	const ok: UnattendedOptions = { host: "duet3.local", flavour: "standalone" };

	it("fills in the defaults", () => {
		expect(resolveUnattendedOptions(ok)).toEqual({
			host: "duet3.local", protocol: "http", flavour: "standalone", keep: 14,
			folders: ["0:/sys", "0:/macros", "0:/filaments"], outDir: "./duet-backups", passwordEnv: "DUET_PASSWORD",
		});
	});

	it.each(["duet3.local", "192.168.1.50", "printer:8080", "[fe80::1]:8080", "a", "my-printer.lan"])("accepts host %s", (host) => {
		expect(resolveUnattendedOptions({ ...ok, host }).host).toBe(host);
	});

	it.each(["", "  ", "has space", "a/b", "http://x", "x;rm -rf /", "x`y`", "x$(y)", "x'y", 'x"y', "host:99999x", "-lead", "trail-", "a b:80"])("rejects host %j", (host) => {
		expect(() => resolveUnattendedOptions({ ...ok, host })).toThrow(UnattendedOptionsError);
	});

	it("rejects a bad protocol, flavour, keep, folder, env name and empty folder list - naming the field", () => {
		const field = (o: Partial<UnattendedOptions>) => { try { resolveUnattendedOptions({ ...ok, ...o } as UnattendedOptions); } catch (e) { return (e as UnattendedOptionsError).field; } return null; };
		expect(field({ protocol: "ftp" as never })).toBe("protocol");
		expect(field({ flavour: "x" as never })).toBe("flavour");
		expect(field({ keep: 0 })).toBe("keep");
		expect(field({ keep: 400 })).toBe("keep");
		expect(field({ keep: 2.5 })).toBe("keep");
		expect(field({ folders: [] })).toBe("folders");
		expect(field({ folders: ["/sys"] })).toBe("folders");
		expect(field({ folders: ["0:/../etc"] })).toBe("folders");
		expect(field({ folders: ['0:/sys"; evil'] })).toBe("folders");
		expect(field({ passwordEnv: "1BAD" })).toBe("passwordEnv");
		expect(field({ passwordEnv: "A B" })).toBe("passwordEnv");
		expect(field({ outDir: "  " })).toBe("outDir");
		expect(field({})).toBeNull();
	});

	it("normalises trailing slashes and drops duplicate folders", () => {
		expect(resolveUnattendedOptions({ ...ok, folders: ["0:/sys/", "0:/sys", "0:/macros//"] }).folders).toEqual(["0:/sys", "0:/macros"]);
	});
});

describe("detectFlavour", () => {
	it("an SBC reports a DSF version (and/or an sbc section); everything else is standalone", () => {
		expect(detectFlavour({ state: { dsfVersion: "3.5.1" } })).toBe("sbc");
		expect(detectFlavour({ sbc: { dsf: { version: "3.5" } } })).toBe("sbc");
		expect(detectFlavour({ state: { status: "idle" } })).toBe("standalone");
		expect(detectFlavour({})).toBe("standalone");
		expect(detectFlavour(undefined)).toBe("standalone");
		expect(detectFlavour(null)).toBe("standalone");
	});
});

describe("the generated script text", () => {
	const opts: UnattendedOptions = { host: "duet3.local", flavour: "standalone", keep: 7, passwordEnv: "MY_DUET_PW" };

	it("starts with a shebang and states what it does, what it does not, and its exit codes", () => {
		const text = generateUnattendedScript(opts);
		expect(text.startsWith("#!/usr/bin/env node\n")).toBe(true);
		expect(text).toContain("Needs Node 18 or newer");
		expect(text).toContain("MY_DUET_PW");
		expect(text).toContain("it is NOT stored in this file");
		expect(text).toContain("Exit codes: 0 ok - 1 failed - 2 wrong password - 3 no free session");
		expect(text).toContain("Nothing is encrypted, redacted or uploaded");
	});

	it("bakes in the configuration as data and nothing the user typed as code", () => {
		const text = generateUnattendedScript({ ...opts, folders: ["0:/sys", "0:/macros"], outDir: "/var/backups/duet" });
		expect(text).toContain('"host": "duet3.local"');
		expect(text).toContain('"protocol": "http:"');
		expect(text).toContain('"flavour": "standalone"');
		expect(text).toContain('"keep": 7');
		expect(text).toContain('"folders": [\n\t\t"0:/sys",\n\t\t"0:/macros"\n\t]');
		expect(text).toContain('"outDir": "/var/backups/duet"');
		expect(text).toContain('"passwordEnv": "MY_DUET_PW"');
	});

	it("never contains a password, whatever the environment looks like", () => {
		const text = generateUnattendedScript({ ...opts, passwordEnv: "DUET_PASSWORD" });
		expect(text).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i);
		expect(text).toContain('const password = process.env[CONFIG.passwordEnv] ?? "";');
	});

	it("is deterministic: the same options give the same text (so a regenerated script diffs cleanly)", () => {
		expect(generateUnattendedScript(opts)).toBe(generateUnattendedScript(opts));
	});

	it("differs by flavour only where it should", () => {
		const a = generateUnattendedScript({ ...opts, flavour: "standalone" });
		const b = generateUnattendedScript({ ...opts, flavour: "sbc" });
		expect(a).not.toBe(b);
		expect(a).toContain('"flavour": "standalone"');
		expect(b).toContain('"flavour": "sbc"');
		expect(b).toContain("SBC / DuetSoftwareFramework");
	});

	it("marks 0:/sys as required only when it is being backed up", () => {
		expect(generateUnattendedScript({ ...opts, folders: ["0:/macros"] })).toContain('"required": []');
		expect(generateUnattendedScript(opts)).toContain('"required": [\n\t\t"0:/sys"\n\t]');
	});

	let dir: string;
	beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "fl-unattended-syntax-")); });
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it.each([
		["standalone", "http", "duet3.local"], ["sbc", "https", "192.168.1.50:8443"], ["standalone", "http", "[fe80::1]:8080"],
	] as Array<[UnattendedFlavour, "http" | "https", string]>)("is valid JavaScript (%s over %s to %s)", async (flavour, protocol, host) => {
		const file = join(dir, `check-${flavour}.mjs`);
		writeFileSync(file, generateUnattendedScript({ host, flavour, protocol }));
		await expect(run(process.execPath, ["--check", file])).resolves.toBeDefined();
	});
});

describe("scheduler snippets", () => {
	const opts: UnattendedOptions = { host: "duet3.local", flavour: "standalone", passwordEnv: "DUET_PASSWORD" };

	it("gives a crontab entry that runs the script daily and logs it", () => {
		const s = schedulerSnippets(opts, "/home/me/duet-backup.mjs", 3);
		expect(s.cron).toContain("0 3 * * *");
		expect(s.cron).toContain('node "/home/me/duet-backup.mjs"');
		expect(s.cron).toContain(">> \"$HOME/duet-backup.log\" 2>&1");
		expect(s.cron).toContain("DUET_PASSWORD='your-board-password'");
	});

	it("gives a Windows schtasks command with the path converted and the password kept out of the script", () => {
		const s = schedulerSnippets(opts, "C:/tools/duet-backup.mjs", 4);
		expect(s.schtasks).toContain("schtasks /Create /SC DAILY /ST 04:00");
		expect(s.schtasks).toContain("C:\\tools\\duet-backup.mjs");
		expect(s.schtasks).toContain('setx DUET_PASSWORD "your-board-password"');
	});

	it("gives a systemd service + timer pair that survives downtime (Persistent)", () => {
		const s = schedulerSnippets(opts, "/opt/duet-backup.mjs", 2);
		expect(s.systemdService).toContain("Type=oneshot");
		expect(s.systemdService).toContain("ExecStart=/usr/bin/env node /opt/duet-backup.mjs");
		expect(s.systemdService).toContain("Environment=DUET_PASSWORD=your-board-password");
		expect(s.systemdTimer).toContain("OnCalendar=*-*-* 02:00:00");
		expect(s.systemdTimer).toContain("Persistent=true");
		expect(s.systemdTimer).toContain("WantedBy=timers.target");
	});

	it("uses the chosen password variable name, clamps the hour, and validates the options", () => {
		expect(schedulerSnippets({ ...opts, passwordEnv: "PW" }).cron).toContain("PW='your-board-password'");
		expect(schedulerSnippets(opts, "/x", 99).cron).toContain("0 23 * * *");
		expect(schedulerSnippets(opts, "/x", -5).cron).toContain("0 0 * * *");
		expect(() => schedulerSnippets({ ...opts, host: "bad host" })).toThrow(UnattendedOptionsError);
	});
});

// The real thing: run the generated script in Node against a fake Duet, for both firmware flavours.
describe.each(["standalone", "sbc"] as const)("running the generated script against a fake Duet (%s)", (flavour) => {
	const BIN = Buffer.from([0, 1, 2, 250, 251, 252, 0, 255, 10, 13, 0]);
	const baseFiles: FakeDuetOptions["files"] = {
		"0:/sys/config.g": "; config\nM550 P\"Duet\"\n",
		"0:/sys/homeall.g": "G28\n",
		"0:/sys/deploy/tool.g": "; nested\n",
		"0:/macros/Preheat PLA.g": "M140 S60\n",
		"0:/macros/sub/deep/x.g": "; deep\n",
		"0:/filaments/PLA/load.g": "; load\n",
		"0:/sys/firmware.bin": BIN,
	};

	let fake: FakeDuet | null = null;
	let work: string;
	beforeAll(() => { work = mkdtempSync(join(tmpdir(), "fl-unattended-run-")); });
	afterAll(() => rmSync(work, { recursive: true, force: true }));
	afterEach(async () => { await fake?.close(); fake = null; });

	async function serve(over: Partial<FakeDuetOptions> = {}) {
		fake = await startFakeDuet({ flavour, files: baseFiles, ...over });
		return fake;
	}
	async function backup(host: string, extra: Partial<UnattendedOptions> = {}, env: Record<string, string> = {}, outDir = join(work, `out-${Math.random().toString(36).slice(2)}`)) {
		const script = join(work, `script-${Math.random().toString(36).slice(2)}.mjs`);
		writeFileSync(script, generateUnattendedScript({ host, flavour, outDir, ...extra }));
		try {
			const { stdout, stderr } = await run(process.execPath, [script], { env: { ...process.env, ...env }, timeout: 30000 });
			return { code: 0, stdout, stderr, outDir };
		} catch (e) {
			const err = e as { code?: number; stdout?: string; stderr?: string };
			return { code: typeof err.code === "number" ? err.code : -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "", outDir };
		}
	}
	const backups = (outDir: string, host: string) => {
		const root = join(outDir, host.replace(/[^A-Za-z0-9.-]/g, "-"));
		return existsSync(root) ? readdirSync(root).sort() : [];
	};
	const tree = (outDir: string, host: string) => {
		const root = join(outDir, host.replace(/[^A-Za-z0-9.-]/g, "-"));
		return join(root, backups(outDir, host).filter((n) => !n.endsWith(".partial")).at(-1)!);
	};

	it("writes a dated folder with every file - nested folders and binary content included - byte for byte", async () => {
		const d = await serve();
		const r = await backup(d.host);
		expect(r.code, r.stderr).toBe(0);
		expect(r.stdout).toContain("backed up 7 files");
		const [dated] = backups(r.outDir, d.host);
		expect(dated).toMatch(/^\d{8}-\d{6}$/);
		const root = tree(r.outDir, d.host);
		expect(readFileSync(join(root, "sys", "config.g"), "utf8")).toBe(baseFiles["0:/sys/config.g"]);
		expect(readFileSync(join(root, "sys", "deploy", "tool.g"), "utf8")).toBe("; nested\n");
		expect(readFileSync(join(root, "macros", "Preheat PLA.g"), "utf8")).toBe("M140 S60\n");
		expect(readFileSync(join(root, "macros", "sub", "deep", "x.g"), "utf8")).toBe("; deep\n");
		expect(readFileSync(join(root, "filaments", "PLA", "load.g"), "utf8")).toBe("; load\n");
		expect(readFileSync(join(root, "sys", "firmware.bin")).equals(BIN)).toBe(true);
	});

	it("connects once, disconnects at the end, and prints no password", async () => {
		const d = await serve({ password: "s3cret" });
		const r = await backup(d.host, {}, { DUET_PASSWORD: "s3cret" });
		expect(r.code, r.stderr).toBe(0);
		expect(d.connects).toBe(1);
		expect(d.disconnects).toBe(1);
		expect(r.stdout + r.stderr).not.toContain("s3cret");
	});

	it("sends the session key on every request when the board requires one", async () => {
		const d = await serve({ requireSession: true });
		const r = await backup(d.host);
		expect(r.code, r.stderr).toBe(0);
		expect(readFileSync(join(tree(r.outDir, d.host), "sys", "config.g"), "utf8")).toContain("M550");
	});

	it("uses the password from the variable named in the options", async () => {
		const d = await serve({ password: "pw-from-custom-var" });
		const bad = await backup(d.host, { passwordEnv: "CUSTOM_PW" }, {});
		expect(bad.code).toBe(2);
		const good = await backup(d.host, { passwordEnv: "CUSTOM_PW" }, { CUSTOM_PW: "pw-from-custom-var" });
		expect(good.code, good.stderr).toBe(0);
	});

	it("exits 2 on a wrong password and leaves no backup behind", async () => {
		const d = await serve({ password: "right" });
		const r = await backup(d.host, {}, { DUET_PASSWORD: "wrong" });
		expect(r.code).toBe(2);
		expect(r.stderr).toContain("password");
		expect(backups(r.outDir, d.host)).toEqual([]);
	});

	it("exits 3 when the board has no free session", async () => {
		const d = await serve({ noFreeSessions: true });
		const r = await backup(d.host);
		expect(r.code).toBe(3);
		expect(backups(r.outDir, d.host)).toEqual([]);
	});

	it("exits 1 with a clear message when the board cannot be reached", async () => {
		const d = await serve();
		const host = d.host;
		await d.close();
		fake = null;
		const r = await backup(host);
		expect(r.code).toBe(1);
		expect(r.stderr).toContain("cannot reach");
	});

	it("exits 1 when the required 0:/sys folder is missing", async () => {
		const d = await serve({ files: { "0:/macros/a.g": "x" } });
		const r = await backup(d.host);
		expect(r.code).toBe(1);
		expect(r.stderr).toContain("0:/sys");
		expect(backups(r.outDir, d.host)).toEqual([]);
	});

	it("skips an optional folder that is not on the board and still succeeds", async () => {
		const d = await serve({ files: { "0:/sys/config.g": "x" } });
		const r = await backup(d.host);
		expect(r.code, r.stderr).toBe(0);
		expect(r.stdout).toContain("skipping 0:/macros");
		expect(r.stdout).toContain("skipping 0:/filaments");
		expect(existsSync(join(tree(r.outDir, d.host), "sys", "config.g"))).toBe(true);
	});

	it("only backs up the folders it was asked to", async () => {
		const d = await serve();
		const r = await backup(d.host, { folders: ["0:/macros"] });
		expect(r.code, r.stderr).toBe(0);
		const root = tree(r.outDir, d.host);
		expect(existsSync(join(root, "macros"))).toBe(true);
		expect(existsSync(join(root, "sys"))).toBe(false);
	});

	it("an empty board is a failure, not a silently empty backup", async () => {
		const d = await serve({ files: {}, emptyDirs: ["0:/sys"] });
		const r = await backup(d.host);
		expect(r.code).toBe(1);
		expect(r.stderr).toContain("nothing was downloaded");
		expect(backups(r.outDir, d.host)).toEqual([]);
	});

	it("follows the file list's paging", async () => {
		const d = await serve({ pageSize: 2 });
		const r = await backup(d.host);
		expect(r.code, r.stderr).toBe(0);
		expect(r.stdout).toContain("backed up 7 files");
		if (flavour === "standalone") {
			expect(d.requests.filter((q) => q.includes("rr_filelist") && q.includes("dir=0%3A%2Fsys")).length).toBeGreaterThan(1);
		}
	});

	it("never writes outside its folder, whatever names the board reports", async () => {
		const d = await serve({
			files: { "0:/sys/config.g": "x" },
			extraEntries: { "0:/sys": [
				{ type: "f", name: "../escape.g" }, { type: "f", name: "..\\escape2.g" }, { type: "f", name: "a/b.g" },
				{ type: "f", name: "C:evil.g" }, { type: "d", name: ".." }, { type: "f", name: "con\u0001trol.g" },
			] },
		});
		const outDir = join(work, "traversal-out");
		const r = await backup(d.host, {}, {}, outDir);
		expect(r.code, r.stderr).toBe(0);
		expect(r.stdout).toContain("unsafe name");
		expect(existsSync(join(outDir, "escape.g"))).toBe(false);
		expect(existsSync(join(work, "escape.g"))).toBe(false);
		expect(readdirSync(join(tree(outDir, d.host), "sys"))).toEqual(["config.g"]);
	});

	it("a failed download fails the whole run, removes the partial folder and keeps earlier backups", async () => {
		const failing: Array<string> = [];
		const d = await serve({ failDownloads: failing }); // the fake reads this array on every request
		const outDir = join(work, "keepfail-out");
		expect((await backup(d.host, {}, {}, outDir)).code).toBe(0);
		const before = backups(outDir, d.host);
		expect(before).toHaveLength(1);

		failing.push("0:/sys/homeall.g");
		const r = await backup(d.host, {}, {}, outDir);
		expect(r.code).toBe(1);
		expect(r.stderr).toContain("could not download");
		expect(backups(outDir, d.host)).toEqual(before); // no partial folder, earlier backup untouched
		expect(d.disconnects).toBe(2); // and it still said goodbye to the board
	});

	it("keeps only the newest N dated backups, even when several runs land in the same second", async () => {
		const d = await serve();
		const outDir = join(work, "retention-out");
		for (let i = 0; i < 4; i++) {
			const r = await backup(d.host, { keep: 2 }, {}, outDir);
			expect(r.code, r.stderr).toBe(0);
		}
		const left = backups(outDir, d.host);
		expect(left).toHaveLength(2);
		expect(left.every((n) => /^\d{8}-\d{6}(-\d+)?$/.test(n))).toBe(true);
	});

	it("clears a stale .partial left by a killed run, and never counts it as a backup", async () => {
		const d = await serve();
		const outDir = join(work, "stale-out");
		const root = join(outDir, d.host.replace(/[^A-Za-z0-9.-]/g, "-"));
		const stale = join(root, "20200101-000000.partial");
		mkdirp(stale);
		writeFileSync(join(stale, "junk"), "x");
		const r = await backup(d.host, { keep: 1 }, {}, outDir);
		expect(r.code, r.stderr).toBe(0);
		expect(existsSync(stale)).toBe(false);
		expect(backups(outDir, d.host)).toHaveLength(1);
	});

	it("does not delete unrelated folders in the backup directory", async () => {
		const d = await serve();
		const outDir = join(work, "unrelated-out");
		const root = join(outDir, d.host.replace(/[^A-Za-z0-9.-]/g, "-"));
		mkdirp(join(root, "my-notes"));
		const r = await backup(d.host, { keep: 1 }, {}, outDir);
		expect(r.code, r.stderr).toBe(0);
		expect(existsSync(join(root, "my-notes"))).toBe(true);
	});
});

const mkdirp = (p: string) => mkdirSync(p, { recursive: true });
