import { beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";
import { scanImpact, type FileEdit } from "dwc-gcode-core";

import { rememberReportFiles } from "../src/model/firmware/changeCheck";
import { applyFix, clearBackupMemory, planFor, squiggleWanted, summaryOf, type ApplyIO } from "../src/model/firmware/changePlan";

const CONFIG = "M955 C0\nM140 P0 H0\n";
const TOOLS = "M563 P0 D0 H0\n";
const FILES = [{ path: "0:/sys/config.g", text: CONFIG }, { path: "0:/sys/tools.g", text: TOOLS }];
const reportOf = () => rememberReportFiles(scanImpact(FILES, "3.6.3", "3.7.0-rc.2"), FILES);

/** An in-memory card; `failOn` makes the nth upload throw. */
function card(initial: Record<string, string>, failOn?: number) {
	const files = { ...initial };
	const uploads: Array<string> = [];
	const io: ApplyIO = {
		async downloadText(path) { if (!(path in files)) { throw new Error("missing"); } return files[path]; },
		async upload(path, content) {
			if (failOn !== undefined && uploads.length + 1 === failOn) { uploads.push(`${path} (failed)`); throw new Error("disk full"); }
			uploads.push(path);
			files[path] = await content.text();
		},
	};
	return { files, uploads, io };
}
const ready = { state: () => ({ connected: true, idle: true }) };
const firstEdit = (): ReadonlyArray<FileEdit> => planFor(reportOf()).problems.find((p) => p.event.id === "m955-p-required")!.fix!.options[0].edits;
const heaterProblem = () => planFor(reportOf()).problems.find((p) => p.explanation.includes("Heater 0"))!;

beforeEach(() => clearBackupMemory());

describe("planFor", () => {
	it("plans over the text the report was made from, and counts only what needs changing", () => {
		const plan = planFor(reportOf());
		expect(plan.problems.map((p) => p.event.id)).toContain("m955-p-required");
		const summary = summaryOf(plan);
		expect(summary.lines).toBe(plan.problems.length);
		expect(summary.files).toBe(new Set(plan.problems.map((p) => p.occurrence.path)).size);
	});

	it("still finds its files when the report arrives as a reactive proxy (a prop, or the update widget's deep ref)", () => {
		const proxied = reactive({ report: reportOf() }).report;
		expect(planFor(proxied).problems.some((p) => p.event.id === "m955-p-required")).toBe(true);
	});

	it("finds a heater given two jobs across two files, once", () => {
		expect(planFor(reportOf()).problems.filter((p) => p.explanation.includes("Heater 0"))).toHaveLength(1);
	});
});

describe("squiggleWanted", () => {
	const up = { from: "3.6.3", to: "3.7.0-rc.2" };
	it("draws what needs attention and nothing that cannot hurt", () => {
		expect(squiggleWanted("m408-removed", up)).toBe(true);
		expect(squiggleWanted("m955-p-required", up)).toBe(true);
		expect(squiggleWanted("expr-array-literal", up)).toBe(false); // added
		expect(squiggleWanted("m140-h-colon-list", up)).toBe(false); // only a problem when two files disagree, which one squiggle cannot say
		expect(squiggleWanted("m575-p-channel-numbering", up)).toBe(true); // behaves differently: still worth a mark
	});
});

describe("applyFix", () => {
	it("writes the edit and keeps the original beside it", async () => {
		const c = card({ "0:/sys/config.g": CONFIG });
		const out = await applyFix(reportOf(), firstEdit(), { io: c.io, ...ready });
		expect(out.ok).toBe(true);
		expect(c.files["0:/sys/config.g"]).toBe("M955 C0 P0\nM140 P0 H0\n");
		expect(c.files["0:/sys/config.g.bak"]).toBe(CONFIG);
		expect(out.ok && out.needsRestart).toBe(true);
	});

	it("saves the original only once per page session, so a second fix cannot overwrite it", async () => {
		const c = card({ "0:/sys/config.g": CONFIG });
		await applyFix(reportOf(), firstEdit(), { io: c.io, ...ready });
		c.files["0:/sys/config.g"] = CONFIG; // as if undone by hand
		await applyFix(reportOf(), firstEdit(), { io: c.io, ...ready });
		expect(c.uploads.filter((u) => u.endsWith(".bak"))).toHaveLength(1);
	});

	it("will not write unless connected and idle", async () => {
		const c = card({ "0:/sys/config.g": CONFIG });
		expect(await applyFix(reportOf(), firstEdit(), { io: c.io, state: () => ({ connected: false, idle: false }) })).toEqual({ ok: false, reason: "offline" });
		expect(await applyFix(reportOf(), firstEdit(), { io: c.io, state: () => ({ connected: true, idle: false }) })).toEqual({ ok: false, reason: "busy" });
		expect(c.uploads).toEqual([]);
	});

	it("will not write to a file that changed since the check", async () => {
		const c = card({ "0:/sys/config.g": CONFIG + "; added since\n" });
		expect(await applyFix(reportOf(), firstEdit(), { io: c.io, ...ready })).toEqual({ ok: false, reason: "changed", path: "0:/sys/config.g" });
		expect(c.uploads).toEqual([]);
	});

	it("reports a file it cannot read as a failure, not a crash", async () => {
		const c = card({});
		expect(await applyFix(reportOf(), firstEdit(), { io: c.io, ...ready })).toEqual({ ok: false, reason: "failed", path: "0:/sys/config.g" });
	});

	it("puts back what it already wrote when a later write fails", async () => {
		const edits = [...firstEdit(), ...heaterProblem().fix!.options.flatMap((o) => o.edits).filter((e) => e.path === "0:/sys/tools.g")];
		expect(new Set(edits.map((e) => e.path)).size).toBe(2); // one edit in each file, so there is a first write to roll back
		const c = card({ "0:/sys/config.g": CONFIG, "0:/sys/tools.g": TOOLS }, 4); // two .bak writes, then the first file, then the second fails
		expect(await applyFix(reportOf(), edits, { io: c.io, ...ready })).toEqual({ ok: false, reason: "failed" });
		expect(c.files["0:/sys/config.g"]).toBe(CONFIG);
		expect(c.files["0:/sys/tools.g"]).toBe(TOOLS);
	});

	it("undo restores the file, but not over a later edit by someone else", async () => {
		const c = card({ "0:/sys/config.g": CONFIG });
		const out = await applyFix(reportOf(), firstEdit(), { io: c.io, ...ready });
		if (!out.ok) { throw new Error("apply failed"); }
		c.files["0:/sys/config.g"] += "; later\n";
		expect(await out.undo()).toEqual({ ok: false, reason: "changed", path: "0:/sys/config.g" });
		expect(c.files["0:/sys/config.g"]).toContain("; later");
		c.files["0:/sys/config.g"] = "M955 C0 P0\nM140 P0 H0\n";
		expect(await out.undo()).toEqual({ ok: true });
		expect(c.files["0:/sys/config.g"]).toBe(CONFIG);
	});

	it("refuses an edit for a file the report never read", async () => {
		const c = card({ "0:/sys/other.g": "x\n" });
		const out = await applyFix(reportOf(), [{ path: "0:/sys/other.g", start: 0, end: 0, replacement: "a" }], { io: c.io, ...ready });
		expect(out).toEqual({ ok: false, reason: "changed", path: "0:/sys/other.g" });
	});

	it("each side of a heater choice leaves a well-formed line", async () => {
		for (const option of heaterProblem().fix!.options) {
			clearBackupMemory();
			const c = card({ "0:/sys/config.g": CONFIG, "0:/sys/tools.g": TOOLS });
			expect((await applyFix(reportOf(), option.edits, { io: c.io, ...ready })).ok).toBe(true);
			const text = c.files["0:/sys/config.g"] + c.files["0:/sys/tools.g"];
			expect(text).not.toMatch(/H(\s|$)/); // never an empty H
			expect(text).not.toMatch(/ {2}/); // never a stray space where a parameter was
			expect(text).toMatch(/M140 P0 H-1|M563 P0 D0\n/); // the bed gives it up (H-1), or the tool loses its H
		}
	});
});
