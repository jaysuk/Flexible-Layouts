import { describe, expect, it } from "vitest";

import type { MaintenanceEntry, MaintenanceLog } from "../model/maintenance/log";
import {
	MAINTENANCE_CUSTOM_FILE, MAINTENANCE_CUSTOM_FLUSH_FILE, MAINTENANCE_DAEMON_FILE, MAINTENANCE_DAEMON_MACRO,
	MAINTENANCE_MACRO_FOLDER,
} from "../model/maintenance/macros";
import { rulesMacroInput, syncMaintenanceRules } from "../model/maintenance/rulesSync";
import { emptyRulesDoc, type MaintenanceRulesDoc } from "../model/reminders/rulesStore";
import type { MaintenanceIntervalRule } from "../model/reminders/storage";

const DAEMON = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`;
const CUSTOM = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_CUSTOM_FILE}`;
const CUSTOM_FLUSH = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_CUSTOM_FLUSH_FILE}`;

/** An in-memory card: path -> text, with call logs and per-op failure switches. */
function fakeIO(seed: Record<string, string> = { [DAEMON]: MAINTENANCE_DAEMON_MACRO }) {
	const files = new Map<string, string>(Object.entries(seed));
	const sent: Array<string> = [];
	const deleted: Array<string> = [];
	const uploaded: Array<string> = [];
	const fail = { upload: false };
	return {
		files, sent, deleted, uploaded, fail,
		async upload(filename: string, content: Blob) {
			if (fail.upload) { throw new Error("upload failed"); }
			uploaded.push(filename);
			files.set(filename, await content.text());
		},
		async downloadText(filename: string) {
			const t = files.get(filename);
			if (t === undefined) { throw new Error("not found"); }
			return t;
		},
		async sendCode(code: string) { sent.push(code); return ""; },
		async deleteFile(filename: string) { deleted.push(filename); files.delete(filename); },
		async getFileList(directory: string) {
			return [...files.keys()].filter((p) => p.startsWith(`${directory}/`)).map((p) => ({ name: p.slice(directory.length + 1), isDirectory: false })) as never;
		},
	};
}

const rule = (over: Partial<MaintenanceIntervalRule> = {}): MaintenanceIntervalRule => ({
	id: "r1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true, action: 'M291 P"x" S1', ...over,
});
const doc = (over: Partial<MaintenanceRulesDoc> = {}): MaintenanceRulesDoc => ({ ...emptyRulesDoc(), ...over });
const entry = (over: Partial<MaintenanceEntry> = {}): MaintenanceEntry => ({
	id: "e", loggedAt: 1, category: "c", note: "", spindleSecondsAtEntry: 1000, jobSecondsAtEntry: null, ...over,
});
const log = (...entries: Array<MaintenanceEntry>): MaintenanceLog => ({ kind: "flexible-layouts-maintenance-log", schemaVersion: 1, entries });
const modelWithFlag = { global: new Map<string, unknown>([["flMaintCustomOn", false]]) };

describe("rulesMacroInput", () => {
	it("takes each rule's baseline from the newest entry that SERVICES its counter", () => {
		const input = rulesMacroInput(
			doc({ rules: [rule({ id: "a", counter: "spindleSeconds" }), rule({ id: "b", counter: "fanSec:0" })] }),
			log(
				entry({ id: "old", loggedAt: 1, spindleSecondsAtEntry: 100 }),
				entry({ id: "fan", loggedAt: 5, spindleSecondsAtEntry: 900, services: ["fanSec:0"], baselines: { "fanSec:0": 42 } }),
			),
		);
		expect(input.rules.map((r) => r.baseline)).toEqual([100, 42]);
	});

	it("gives null when no entry covers the counter", () => {
		expect(rulesMacroInput(doc({ rules: [rule()] }), log()).rules[0].baseline).toBeNull();
	});
});

describe("syncMaintenanceRules - something to run", () => {
	const needed = () => doc({ rules: [rule()], customCounters: [{ id: "c1", title: "Tool 1", conditions: ["state.currentTool == 1"] }] });

	it("uploads the flush file before the custom file, then switches the daemon hand-off on", async () => {
		const io = fakeIO();
		const out = await syncMaintenanceRules({ io, doc: needed(), log: log(entry()), model: modelWithFlag });
		expect(out.status).toBe("ok");
		expect(io.uploaded).toEqual([CUSTOM_FLUSH, CUSTOM]);
		expect(io.files.get(CUSTOM)).toContain("global flMaintC1Sec = 0");
		expect(io.files.get(CUSTOM)).toContain("!= 4600"); // baseline 1000 + interval 3600
		expect(io.sent).toEqual(["set global.flMaintCustomOn = true"]);
		expect(out).toMatchObject({ counters: 1, armed: 1, unarmed: [] });
	});

	it("does not `set` a global the daemon has not declared yet - the daemon derives it from the file", async () => {
		const io = fakeIO();
		await syncMaintenanceRules({ io, doc: needed(), log: log(entry()), model: {} });
		expect(io.sent).toEqual([]);
		expect(io.files.has(CUSTOM)).toBe(true);
	});

	it("reports which rules the machine will not act on yet, and why", async () => {
		const io = fakeIO();
		const out = await syncMaintenanceRules({
			io, doc: doc({ rules: [rule({ id: "noBase", counter: "printSeconds" })], customCounters: needed().customCounters }),
			log: log(entry()), model: modelWithFlag,
		});
		expect(out.status).toBe("ok"); // the counter still needs the files
		expect(out.armed).toBe(0);
		expect(out.unarmed).toEqual([{ ruleId: "noBase", reason: "noBaseline" }]);
	});

	it("says so, and uploads nothing, when the maintenance macros are not deployed at all", async () => {
		const io = fakeIO({});
		const out = await syncMaintenanceRules({ io, doc: needed(), log: log(entry()), model: modelWithFlag });
		expect(out.status).toBe("notSetUp");
		expect(io.uploaded).toEqual([]);
		expect(io.sent).toEqual([]);
	});

	it("says so, and uploads nothing, when the deployed daemon predates the hand-off", async () => {
		const io = fakeIO({ [DAEMON]: MAINTENANCE_DAEMON_MACRO.replace(/FL-MAINTENANCE-MACRO-VERSION: \d+/, "FL-MAINTENANCE-MACRO-VERSION: 10") });
		const out = await syncMaintenanceRules({ io, doc: needed(), log: log(entry()), model: modelWithFlag });
		expect(out.status).toBe("needsRedeploy");
		expect(io.uploaded).toEqual([]);
	});

	it("reports a failed upload instead of throwing", async () => {
		const io = fakeIO();
		io.fail.upload = true;
		const out = await syncMaintenanceRules({ io, doc: needed(), log: log(entry()), model: modelWithFlag });
		expect(out.status).toBe("failed");
		expect(io.sent).toEqual([]); // the hand-off is not switched on over a file that did not land
	});
});

describe("syncMaintenanceRules - nothing to run", () => {
	it("removes leftover generated files (custom first) and switches the hand-off off", async () => {
		const io = fakeIO({ [DAEMON]: MAINTENANCE_DAEMON_MACRO, [CUSTOM]: "x", [CUSTOM_FLUSH]: "y" });
		const out = await syncMaintenanceRules({ io, doc: doc({ rules: [rule({ action: undefined })] }), log: log(), model: modelWithFlag });
		expect(out.status).toBe("notNeeded");
		expect(io.deleted).toEqual([CUSTOM, CUSTOM_FLUSH]);
		expect(io.sent).toEqual(["set global.flMaintCustomOn = false"]);
		expect(io.files.has(DAEMON)).toBe(true); // the static macros are never touched
	});

	it("deletes nothing when there is nothing to delete", async () => {
		const io = fakeIO();
		const out = await syncMaintenanceRules({ io, doc: doc(), log: log(), model: {} });
		expect(out.status).toBe("notNeeded");
		expect(io.deleted).toEqual([]);
		expect(io.sent).toEqual([]);
	});

	it("does not insist on the macros being deployed when there is nothing to run", async () => {
		const out = await syncMaintenanceRules({ io: fakeIO({}), doc: doc(), log: log(), model: {} });
		expect(out.status).toBe("notNeeded");
	});

	it("a paused rule with an action needs no files", async () => {
		const out = await syncMaintenanceRules({ io: fakeIO(), doc: doc({ rules: [rule({ enabled: false })] }), log: log(entry()), model: {} });
		expect(out.status).toBe("notNeeded");
	});
});
