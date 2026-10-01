import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setGlobals, setModel } from "dwc-plugin-test-kit";

import MaintenancePage from "../maintenance/MaintenancePage.vue";
import { parseMaintenanceLog, MAINT_LOG_PATH } from "../model/maintenance/log";
import {
	MAINTENANCE_CUSTOM_FILE, MAINTENANCE_CUSTOM_FLUSH_FILE, MAINTENANCE_DAEMON_FILE, MAINTENANCE_DAEMON_MACRO,
	MAINTENANCE_MACRO_FOLDER,
} from "../model/maintenance/macros";
import { MAINT_RULES_PATH, parseRulesDoc, serializeRulesDoc, type MaintenanceRulesDoc } from "../model/reminders/rulesStore";

// An in-memory SD card behind the machine store: the page's log, rules file and macro uploads all go
// through download/upload/getFileList/delete, so this exercises the real chain end to end.
const card = vi.hoisted(() => ({
	files: new Map<string, string>(), sent: [] as Array<string>,
	/** While set, reading the rules file waits for it - simulates a slow SD card. */
	holdRules: null as Promise<void> | null,
}));

vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => ({
			...actual.useMachineStore(),
			async download(opts: { filename: string; type?: string }) {
				if (opts.filename.endsWith("maintenance-rules.json") && card.holdRules) { await card.holdRules; }
				const text = card.files.get(opts.filename);
				if (text === undefined) { throw new Error("not found"); }
				return opts.type === "blob" ? new Blob([text]) : text;
			},
			async upload(opts: { filename: string; content: Blob }) { card.files.set(opts.filename, await opts.content.text()); },
			async delete(filename: string) { card.files.delete(filename); },
			async sendCode(code: string) { card.sent.push(code); return ""; },
			async getFileList(directory: string) {
				return [...card.files.keys()].filter((p) => p.startsWith(`${directory}/`)).map((p) => ({ name: p.slice(directory.length + 1), isDirectory: false }));
			},
		}),
	};
});

const TR = "plugins.flexibleLayouts.maintenance.";
const DAEMON = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`;
const CUSTOM = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_CUSTOM_FILE}`;
const CUSTOM_FLUSH = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_CUSTOM_FLUSH_FILE}`;

beforeEach(() => {
	card.files.clear();
	card.sent.length = 0;
	card.holdRules = null;
	card.files.set(DAEMON, MAINTENANCE_DAEMON_MACRO); // tracking is set up and current
});

function seedRules(doc: Partial<MaintenanceRulesDoc>): void {
	card.files.set(MAINT_RULES_PATH, serializeRulesDoc({ rules: [], customCounters: [], nextCustomId: 1, ...doc }));
}

function mountPage() {
	return mountInDwc(MaintenancePage, {});
}

async function settle(): Promise<void> {
	await flushPromises();
	await flushPromises();
	await flushPromises();
}

function logAService(w: ReturnType<typeof mountPage>) {
	const add = w.findAll("button").find((b) => b.text().trim() === `${TR}addEntry`);
	if (!add) { throw new Error("no add-entry button"); }
	return add.trigger("click");
}

describe("MaintenancePage", () => {
	beforeEach(() => {
		setModel(loadObjectModel(undefined, { overrides: { state: { machineMode: "CNC", currentTool: -1 } } }));
	});

	it("renders the rules and user-counter sections, and hides the plugin section when the plugin is absent", async () => {
		const w = mountPage();
		await settle();
		expect(w.text()).toContain(`${TR}remindersTitle`);
		expect(w.text()).toContain(`${TR}customTitleSection`);
		expect(w.text()).not.toContain(`${TR}pluginTimersTitle`);
	});

	it("says 'update required' for macros that are deployed but out of date, and 'not set up' only when there are none", async () => {
		card.files.set(DAEMON, MAINTENANCE_DAEMON_MACRO.replace(/FL-MAINTENANCE-MACRO-VERSION: \d+/, "FL-MAINTENANCE-MACRO-VERSION: 10"));
		const outdated = mountPage();
		await settle();
		expect(outdated.text()).toContain(`${TR}updateRequired`);
		expect(outdated.text()).not.toContain(`${TR}notSetUp`);

		card.files.delete(DAEMON);
		const missing = mountPage();
		await settle();
		expect(missing.text()).toContain(`${TR}notSetUp`);
		expect(missing.text()).not.toContain(`${TR}updateRequired`);
	});

	it("shows the Maintenance Timers plugin section when that plugin is installed", async () => {
		setModel(loadObjectModel(undefined, { overrides: {
			state: { machineMode: "CNC", currentTool: -1 },
			plugins: new Map([["MaintenanceTimers", { data: new Map([["timers", []]]) }]]),
		} }));
		const w = mountPage();
		await settle();
		expect(w.text()).toContain(`${TR}pluginTimersTitle`);
	});

	it("logging a service snapshots EVERY counter, and moves a rule's machine-side due point to baseline + interval", async () => {
		seedRules({ rules: [{ id: "g1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true, action: 'M291 P"Grease" R"Maintenance" S1' }] });
		setGlobals({
			flMaintSpindleSec: 10000, flMaintPowerOnSec: 55555, flMaintJobsFinished: 3, flMaintAxisMm: [0, 1234], flMaintCustomOn: false,
		});
		const w = mountPage();
		await settle();
		await logAService(w);
		await settle();

		const entry = parseMaintenanceLog(card.files.get(MAINT_LOG_PATH)!)!.entries[0];
		expect(entry.spindleSecondsAtEntry).toBe(10000);
		expect(entry.baselines).toMatchObject({ powerOnSeconds: 55555, jobsFinished: 3, "axisMm:1": 1234 });

		// the generated macro now fires at the NEW baseline + the interval
		expect(card.files.get(CUSTOM)).toContain("global.flMaintSpindleSec >= 13600");
		expect(card.files.get(CUSTOM)).toContain('M291 P"Grease" R"Maintenance" S1');
		expect(card.files.has(CUSTOM_FLUSH)).toBe(true);
		expect(card.sent).toContain("set global.flMaintCustomOn = true");
	});

	it("a service logged for a rule with no action generates nothing on the machine", async () => {
		seedRules({ rules: [{ id: "g1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true }] });
		setGlobals({ flMaintSpindleSec: 10000, flMaintCustomOn: false });
		const w = mountPage();
		await settle();
		await logAService(w);
		await settle();
		expect(card.files.has(CUSTOM)).toBe(false);
		expect(card.sent).not.toContain("set global.flMaintCustomOn = true");
	});

	it("regenerates when the service is logged, so an old due point does not linger", async () => {
		seedRules({ rules: [{ id: "g1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true, action: 'M291 P"x" S1' }] });
		setGlobals({ flMaintSpindleSec: 10000, flMaintCustomOn: false });
		const w = mountPage();
		await settle();
		await logAService(w);
		await settle();
		expect(card.files.get(CUSTOM)).toContain(">= 13600");

		setGlobals({ flMaintSpindleSec: 50000 });
		await settle();
		await logAService(w);
		await settle();
		expect(card.files.get(CUSTOM)).toContain(">= 53600");
		expect(card.files.get(CUSTOM)).not.toContain(">= 13600");
	});

	// Regression: syncing against the not-yet-loaded (empty) rules would decide "nothing needs the
	// generated macros" and delete them - silently switching off every machine-side action.
	it("logging a service before the rules have finished loading does not delete the generated macros", async () => {
		seedRules({ rules: [{ id: "g1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true, action: 'M291 P"x" S1' }] });
		card.files.set(CUSTOM, "; previously generated");
		card.files.set(CUSTOM_FLUSH, "; previously generated");
		setGlobals({ flMaintSpindleSec: 10000, flMaintCustomOn: true });
		let release!: () => void;
		card.holdRules = new Promise<void>((r) => { release = r; });

		const w = mountPage();
		await flushPromises(); // the rules read is still pending
		await logAService(w);
		await flushPromises();
		release();
		await settle();

		expect(card.files.get(CUSTOM)).toContain("global.flMaintSpindleSec >= 13600"); // regenerated from the REAL rules
		expect(card.files.has(CUSTOM_FLUSH)).toBe(true);
		expect(card.sent).not.toContain("set global.flMaintCustomOn = false");
	});

	it("leaves the rules file as it found it when only a service is logged", async () => {
		seedRules({ rules: [{ id: "g1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true }] });
		const before = card.files.get(MAINT_RULES_PATH);
		setGlobals({ flMaintSpindleSec: 10 });
		const w = mountPage();
		await settle();
		await logAService(w);
		await settle();
		expect(card.files.get(MAINT_RULES_PATH)).toBe(before);
		expect(parseRulesDoc(before!)?.integrity).toBe("ok");
	});
});
