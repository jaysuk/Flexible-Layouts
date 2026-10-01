import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";
import { reactive } from "vue";
import { VTextField } from "vuetify/components";

import type { MaintenanceLog } from "../model/maintenance/log";
import { emptyRulesDoc, type MaintenanceRulesDoc } from "../model/reminders/rulesStore";
import type { MaintenanceIntervalRule } from "../model/reminders/storage";
import CustomCountersPanel from "../maintenance/CustomCountersPanel.vue";
import MaintenanceRulesPanel from "../maintenance/MaintenanceRulesPanel.vue";
import PluginTimersPanel from "../maintenance/PluginTimersPanel.vue";
import type { MaintenanceRulesState } from "../maintenance/useMaintenanceRules";

const mocks = vi.hoisted(() => ({ sendReply: "true", request: vi.fn(async () => null), sentCodes: [] as Array<string> }));

vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => ({
			...actual.useMachineStore(),
			async sendCode(code: string) { mocks.sentCodes.push(code); return mocks.sendReply; },
			request: mocks.request,
		}),
	};
});

beforeEach(() => {
	mocks.sendReply = "true";
	mocks.sentCodes.length = 0;
	mocks.request.mockClear();
});

const TR = "plugins.flexibleLayouts.maintenance.";
const emptyLog = (): MaintenanceLog => ({ kind: "flexible-layouts-maintenance-log", schemaVersion: 1, entries: [] });

/** A MaintenanceRulesState double: the real composable talks to the SD card, which these tests are not about. */
function fakeState(doc: MaintenanceRulesDoc = emptyRulesDoc()) {
	const change = vi.fn(async (fn: (d: MaintenanceRulesDoc) => MaintenanceRulesDoc) => { state.doc = fn(state.doc); return "written" as const; });
	const state = reactive({
		doc, source: "machine", integrity: "ok", sync: null, busy: false, reload: vi.fn(), change, resync: vi.fn(),
	}) as unknown as MaintenanceRulesState;
	return { state, change };
}

function buttonByText(w: ReturnType<typeof mountInDwc>, text: string) {
	// Exact, not `includes`: "customAddCondition" would otherwise match a search for "customAdd".
	const b = w.findAll("button").find((x) => x.text().trim() === text);
	if (!b) { throw new Error(`no button "${text}"`); }
	return b;
}

describe("MaintenanceRulesPanel", () => {
	it("shows each rule with its progress in the counter's own unit", async () => {
		setModel(loadObjectModel(undefined, { overrides: { global: new Map([["flMaintSpindleSec", 3600]]) } }));
		const rule: MaintenanceIntervalRule = { id: "r1", label: "Grease the ways", counter: "spindleSeconds", intervalValue: 7200, enabled: true };
		const log = { ...emptyLog(), entries: [{ id: "e", loggedAt: 1, category: "c", note: "", spindleSecondsAtEntry: 0, jobSecondsAtEntry: null }] };
		const { state } = fakeState({ ...emptyRulesDoc(), rules: [rule] });
		const w = mountInDwc(MaintenanceRulesPanel, { props: { state, log, isFff: false } });
		await flushPromises();
		expect(w.text()).toContain("Grease the ways");
		expect(w.text()).toContain("1.0h / 2.0h");
	});

	it("takes the interval in HOURS and stores seconds (the old box said 'seconds/mm/count': 50 meant 50 seconds)", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state, change } = fakeState();
		const w = mountInDwc(MaintenanceRulesPanel, { props: { state, log: emptyLog(), isFff: true } });
		await flushPromises();
		const fields = w.findAllComponents(VTextField);
		await fields[0].setValue("Replace nozzle");
		await fields[2].setValue("50");
		await buttonByText(w, `${TR}reminderAdd`).trigger("click");
		await flushPromises();
		expect(change).toHaveBeenCalledTimes(1);
		expect(state.doc.rules).toHaveLength(1);
		expect(state.doc.rules[0]).toMatchObject({ label: "Replace nozzle", counter: "printSeconds", intervalValue: 180000, enabled: true });
		expect(state.doc.rules[0].action).toBeUndefined();
	});

	it("keeps Add disabled, and says why, for an action that is not a G/M/T-code", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state, change } = fakeState();
		const w = mountInDwc(MaintenanceRulesPanel, { props: { state, log: emptyLog(), isFff: true } });
		await flushPromises();
		const fields = w.findAllComponents(VTextField);
		await fields[0].setValue("Thing");
		await fields[2].setValue("10");
		await fields[3].setValue("echo hello");
		await flushPromises();
		expect(w.text()).toContain(`${TR}ruleActionProblem.notGcode`);
		const add = buttonByText(w, `${TR}reminderAdd`);
		expect(add.attributes("disabled")).toBeDefined();
		await add.trigger("click");
		expect(change).not.toHaveBeenCalled();
	});

	it("stores a valid action, idle-only by default", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state } = fakeState();
		const w = mountInDwc(MaintenanceRulesPanel, { props: { state, log: emptyLog(), isFff: true } });
		await flushPromises();
		const fields = w.findAllComponents(VTextField);
		await fields[0].setValue("Grease");
		await fields[2].setValue("100");
		await fields[3].setValue('M291 P"Grease" R"Maintenance" S1');
		await buttonByText(w, `${TR}reminderAdd`).trigger("click");
		await flushPromises();
		expect(state.doc.rules[0]).toMatchObject({ action: 'M291 P"Grease" R"Maintenance" S1', actionWhenIdle: true });
	});

	it("tells the user when a rule's action is not active yet because no service has been logged", async () => {
		setModel(loadObjectModel(undefined, {}));
		const rule: MaintenanceIntervalRule = { id: "r1", label: "Grease", counter: "spindleSeconds", intervalValue: 3600, enabled: true, action: 'M291 P"x" S1' };
		const { state } = fakeState({ ...emptyRulesDoc(), rules: [rule] });
		const w = mountInDwc(MaintenanceRulesPanel, { props: { state, log: emptyLog(), isFff: false } });
		await flushPromises();
		expect(w.text()).toContain(`${TR}ruleNotArmed.noBaseline`);
	});

	it("refuses to look editable while the machine's file could not be read", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state } = fakeState();
		(state as { source: string }).source = "cache";
		const w = mountInDwc(MaintenanceRulesPanel, { props: { state, log: emptyLog(), isFff: true } });
		await flushPromises();
		expect(w.text()).toContain(`${TR}rulesOffline`);
	});
});

describe("CustomCountersPanel", () => {
	it("will not add a counter until every condition has been tested on the machine", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state, change } = fakeState();
		const w = mountInDwc(CustomCountersPanel, { props: { state } });
		await flushPromises();
		const fields = w.findAllComponents(VTextField);
		await fields[0].setValue("Tool 1 active");
		await fields[1].setValue("state.currentTool == 1");
		await flushPromises();
		const add = buttonByText(w, `${TR}customAdd`);
		expect(add.attributes("disabled")).toBeDefined();

		await buttonByText(w, `${TR}customTest`).trigger("click");
		await flushPromises();
		expect(mocks.sentCodes).toEqual(["echo state.currentTool == 1"]);
		expect(w.text()).toContain(`${TR}customTestTrue`);
		expect(buttonByText(w, `${TR}customAdd`).attributes("disabled")).toBeUndefined();

		await buttonByText(w, `${TR}customAdd`).trigger("click");
		await flushPromises();
		expect(change).toHaveBeenCalledTimes(1);
		expect(state.doc.customCounters).toEqual([{ id: "c1", title: "Tool 1 active", conditions: ["state.currentTool == 1"] }]);
		expect(state.doc.nextCustomId).toBe(2);
	});

	it("invalidates a passed test the moment the condition is edited", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state } = fakeState();
		const w = mountInDwc(CustomCountersPanel, { props: { state } });
		await flushPromises();
		const fields = w.findAllComponents(VTextField);
		await fields[0].setValue("X");
		await fields[1].setValue("state.currentTool == 1");
		await buttonByText(w, `${TR}customTest`).trigger("click");
		await flushPromises();
		expect(buttonByText(w, `${TR}customAdd`).attributes("disabled")).toBeUndefined();
		await fields[1].setValue("state.currentTool == 2");
		await flushPromises();
		expect(buttonByText(w, `${TR}customAdd`).attributes("disabled")).toBeDefined();
	});

	it("shows the machine's error and keeps Add disabled when it cannot evaluate the condition", async () => {
		setModel(loadObjectModel(undefined, {}));
		mocks.sendReply = "Error: unknown value tools[9].active";
		const { state } = fakeState();
		const w = mountInDwc(CustomCountersPanel, { props: { state } });
		await flushPromises();
		const fields = w.findAllComponents(VTextField);
		await fields[0].setValue("X");
		await fields[1].setValue("tools[9].active");
		await buttonByText(w, `${TR}customTest`).trigger("click");
		await flushPromises();
		expect(w.text()).toContain(`${TR}customTestError`);
		expect(buttonByText(w, `${TR}customAdd`).attributes("disabled")).toBeDefined();
	});

	it("rejects a condition that fails the syntax check without bothering the machine", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state } = fakeState();
		const w = mountInDwc(CustomCountersPanel, { props: { state } });
		await flushPromises();
		await w.findAllComponents(VTextField)[1].setValue("state.status ==");
		await buttonByText(w, `${TR}customTest`).trigger("click");
		await flushPromises();
		expect(mocks.sentCodes).toEqual([]);
		expect(w.text()).toContain(`${TR}customProblem.syntax`);
	});

	it("deleting a counter also removes the rules that measure it", async () => {
		setModel(loadObjectModel(undefined, {}));
		const { state } = fakeState({
			...emptyRulesDoc(), nextCustomId: 2,
			customCounters: [{ id: "c1", title: "Tool 1", conditions: ["state.currentTool == 1"] }],
			rules: [
				{ id: "a", label: "uses it", counter: "custom:c1", intervalValue: 1, enabled: true },
				{ id: "b", label: "unrelated", counter: "spindleSeconds", intervalValue: 1, enabled: true },
			],
		});
		const w = mountInDwc(CustomCountersPanel, { props: { state } });
		await flushPromises();
		await w.find('button[aria-label="plugins.flexibleLayouts.a11y.delete"]').trigger("click");
		await flushPromises();
		expect(state.doc.customCounters).toEqual([]);
		expect(state.doc.rules.map((r) => r.id)).toEqual(["b"]);
		expect(state.doc.nextCustomId).toBe(2); // never reused
	});
});

describe("PluginTimersPanel", () => {
	const plugins = (timers: Array<Record<string, unknown>>) => new Map<string, unknown>([["MaintenanceTimers", { data: new Map([["timers", timers]]) }]]);

	it("lists the plugin's timers with progress against the threshold, and resets one through its endpoint", async () => {
		setModel(loadObjectModel(undefined, { overrides: { plugins: plugins([
			{ name: "nozzle", title: "Replace nozzle", initialValue: 0, value: 90, thresholdValue: 600, conditions: ["state.status == \"processing\""], action: "", canReset: true },
			{ name: "belt", title: "Check belts", initialValue: 0, value: 10, thresholdValue: 50, conditions: [], action: "", canReset: false },
		]) } }));
		const w = mountInDwc(PluginTimersPanel, {});
		await flushPromises();
		expect(w.text()).toContain("Replace nozzle");
		expect(w.text()).toContain("1.5h / 10.0h");
		expect(w.text()).toContain("Check belts");
		// only the resettable one offers Reset
		expect(w.findAll("button").filter((b) => b.text().trim() === `${TR}pluginTimerReset`)).toHaveLength(1);

		await buttonByText(w, `${TR}pluginTimerReset`).trigger("click");
		await flushPromises();
		expect(mocks.request).toHaveBeenCalledWith("PUT", "machine/MaintenanceTimers/Reset", { timerName: "nozzle" }, "");
	});

	it("shows a count-down timer as time LEFT", async () => {
		setModel(loadObjectModel(undefined, { overrides: { plugins: plugins([
			{ name: "t", title: "Service", initialValue: 600, value: 120, thresholdValue: 0, conditions: [], action: "", canReset: true },
		]) } }));
		const w = mountInDwc(PluginTimersPanel, {});
		await flushPromises();
		expect(w.text()).toContain(`${TR}pluginTimerLeft`);
	});
});
