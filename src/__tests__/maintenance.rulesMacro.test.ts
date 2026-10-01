import { parseExpression } from "dwc-gcode-core";
import { describe, expect, it } from "vitest";

import { MAINTENANCE_CUSTOM_STATE_PATH, MAINTENANCE_FLUSH_FILE, MAINTENANCE_MACRO_FOLDER, MAINTENANCE_MACRO_SET_VERSION, extractMaintenanceMacroVersion } from "../model/maintenance/macros";
import {
	generateCustomFlushMacro, generateCustomMacro, needsGeneratedMacros, planRules, ruleFiredGlobalName, type RulesMacroInput,
} from "../model/maintenance/rulesMacro";
import type { MaintenanceIntervalRule } from "../model/reminders/storage";

function rule(over: Partial<MaintenanceIntervalRule> = {}): MaintenanceIntervalRule {
	return {
		id: "k3x9a-q1w2e3", label: "Grease the ways", counter: "spindleSeconds", intervalValue: 180000, enabled: true,
		action: 'M291 P"Grease the ways" R"Maintenance" S1', ...over,
	};
}

function input(over: Partial<RulesMacroInput> = {}): RulesMacroInput {
	return { customCounters: [], rules: [{ rule: rule(), baseline: 3600 }], ...over };
}

const FLUSH = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_FLUSH_FILE}`;

describe("planRules", () => {
	it("arms an enabled rule that has an action, a counter and a baseline - due = baseline + interval", () => {
		const { armed, unarmed } = planRules(input());
		expect(unarmed).toEqual([]);
		expect(armed).toHaveLength(1);
		expect(armed[0]).toMatchObject({ expression: "global.flMaintSpindleSec", due: 183600, action: 'M291 P"Grease the ways" R"Maintenance" S1' });
	});

	it("does NOT arm a rule with no baseline: counting from nothing would fire on a machine that has merely been running", () => {
		const { armed, unarmed } = planRules(input({ rules: [{ rule: rule(), baseline: null }] }));
		expect(armed).toEqual([]);
		expect(unarmed.map((u) => u.reason)).toEqual(["noBaseline"]);
	});

	it("ignores rules that are paused or have no action - those only remind, in the browser", () => {
		const { armed, unarmed } = planRules(input({ rules: [
			{ rule: rule({ enabled: false }), baseline: 0 },
			{ rule: rule({ id: "b", action: undefined }), baseline: 0 },
		] }));
		expect(armed).toEqual([]);
		expect(unarmed).toEqual([]);
	});

	it("reports an action that is not a G/M/T-code, and a counter that does not exist, instead of emitting them", () => {
		const { armed, unarmed } = planRules(input({ rules: [
			{ rule: rule({ id: "a", action: "echo hi" }), baseline: 0 },
			{ rule: rule({ id: "b", counter: "bogus" as never }), baseline: 0 },
			{ rule: rule({ id: "c", intervalValue: 0 }), baseline: 0 },
		] }));
		expect(armed).toEqual([]);
		expect(unarmed.map((u) => u.reason)).toEqual(["badAction", "badCounter", "badCounter"]);
	});

	it("rounds the due value up to a whole number so the fired marker survives a round trip through text", () => {
		const { armed } = planRules(input({ rules: [{ rule: rule({ counter: "filamentMm", intervalValue: 1000 }), baseline: 250.4 }] }));
		expect(armed[0].due).toBe(1251);
	});

	it("addresses an array element and a user counter by the right global", () => {
		const { armed } = planRules(input({ rules: [
			{ rule: rule({ id: "a", counter: "axisMm:2" }), baseline: 0 },
			{ rule: rule({ id: "b", counter: "custom:c4" }), baseline: 0 },
		] }));
		expect(armed.map((a) => a.expression)).toEqual(["global.flMaintAxisMm[2]", "global.flMaintC4Sec"]);
	});
});

describe("ruleFiredGlobalName", () => {
	it("is a valid RRF identifier whatever the rule id looks like", () => {
		const name = ruleFiredGlobalName("k3x9a-q1w2e3");
		expect(name).toBe("flMaintRk3x9aq1w2e3Fired");
		expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
		expect(ruleFiredGlobalName("a b;c\nM112")).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
	});
});

describe("needsGeneratedMacros", () => {
	it("is false with nothing to do, true for a user counter or an armed action", () => {
		expect(needsGeneratedMacros({ customCounters: [], rules: [] })).toBe(false);
		expect(needsGeneratedMacros({ customCounters: [], rules: [{ rule: rule({ action: undefined }), baseline: 1 }] })).toBe(false);
		expect(needsGeneratedMacros({ customCounters: [], rules: [{ rule: rule(), baseline: null }] })).toBe(false); // unarmed
		expect(needsGeneratedMacros(input())).toBe(true);
		expect(needsGeneratedMacros({ customCounters: [{ id: "c1", title: "t", conditions: ["state.currentTool == 1"] }], rules: [] })).toBe(true);
	});
});

describe("generateCustomMacro", () => {
	const counters = [
		{ id: "c1", title: "Tool 1 active", conditions: ['state.currentTool == 1', 'state.status == "processing"'] },
		{ id: "c2", title: "Hot bed", conditions: ["heat.heaters[0].current > 60 || heat.heaters[0].active > 60"] },
	];
	const full = generateCustomMacro(input({ customCounters: counters }));

	it("carries the current macro version stamp, so an outdated generated file is detectable", () => {
		expect(extractMaintenanceMacroVersion(full)).toBe(MAINTENANCE_MACRO_SET_VERSION);
	});

	it("reloads the persisted values once per boot, first, tolerating a missing state file", () => {
		const restore = full.indexOf("if !exists(global.flMaintCustomLoaded)");
		expect(restore).toBeGreaterThan(-1);
		expect(restore).toBeLessThan(full.indexOf("global flMaintC1Sec = 0"));
		expect(full).toContain(`if fileexists("${MAINTENANCE_CUSTOM_STATE_PATH}")\n\t\tM98 P"${MAINTENANCE_CUSTOM_STATE_PATH}"`);
	});

	it("seeds each counter behind its own guard, then adds the poll interval only while ALL its conditions hold", () => {
		expect(full).toContain("if !exists(global.flMaintC1Sec)\n\tglobal flMaintC1Sec = 0");
		expect(full).toContain('if (state.currentTool == 1) && (state.status == "processing")\n\tset global.flMaintC1Sec = global.flMaintC1Sec + global.flMaintDt');
	});

	it("parenthesises every condition so an || inside one cannot change how the others combine", () => {
		expect(full).toContain("if (heat.heaters[0].current > 60 || heat.heaters[0].active > 60)\n\tset global.flMaintC2Sec");
	});

	it("emits a rule's action as the last line of its block, after the marker is set and flushed", () => {
		const out = generateCustomMacro(input());
		const due = 183600;
		const block = out.slice(out.indexOf("if global.flMaintSpindleSec"));
		const lines = block.split("\n");
		expect(lines[0]).toBe(`if global.flMaintSpindleSec >= ${due} && global.flMaintRk3x9aq1w2e3Fired != ${due} && state.status == "idle"`);
		expect(lines[1]).toBe(`\tset global.flMaintRk3x9aq1w2e3Fired = ${due}`);
		expect(lines[2]).toBe(`\tM98 P"${FLUSH}"`);
		expect(lines[3]).toBe('\tM291 P"Grease the ways" R"Maintenance" S1');
	});

	it("holds the action until the machine is idle by default, and only drops that when asked", () => {
		expect(generateCustomMacro(input())).toContain('&& state.status == "idle"');
		const noIdle = generateCustomMacro(input({ rules: [{ rule: rule({ actionWhenIdle: false }), baseline: 3600 }] }));
		expect(noIdle).not.toContain("state.status");
		const explicit = generateCustomMacro(input({ rules: [{ rule: rule({ actionWhenIdle: true }), baseline: 3600 }] }));
		expect(explicit).toContain('&& state.status == "idle"');
	});

	it("re-arms by value: a new baseline gives a new due literal, so the old fired marker no longer matches", () => {
		const a = generateCustomMacro(input({ rules: [{ rule: rule(), baseline: 3600 }] }));
		const b = generateCustomMacro(input({ rules: [{ rule: rule(), baseline: 90000 }] }));
		expect(a).toContain("!= 183600");
		expect(b).toContain("!= 270000");
		expect(a).not.toBe(b);
	});

	it("seeds the fired marker to -1, which no due value can equal", () => {
		expect(generateCustomMacro(input())).toContain("if !exists(global.flMaintRk3x9aq1w2e3Fired)\n\tglobal flMaintRk3x9aq1w2e3Fired = -1");
	});

	it("never lets user text start a new line: a label or title with a newline stays inside its comment", () => {
		const out = generateCustomMacro({
			customCounters: [{ id: "c1", title: "evil\nM112\r\nM999", conditions: ["state.currentTool == 1"] }],
			rules: [{ rule: rule({ label: "x\nM112\n; y" }), baseline: 0 }],
		});
		for (const line of out.split("\n")) {
			expect(line.trim().startsWith("M112"), line).toBe(false);
			expect(line.trim().startsWith("M999"), line).toBe(false);
		}
	});

	it("seeds a counter whose conditions are all invalid but never counts for it (no condition would mean 'always')", () => {
		const out = generateCustomMacro({ customCounters: [{ id: "c1", title: "t", conditions: ["var.x > 1", "state.status =="] }], rules: [] });
		expect(out).toContain("global flMaintC1Sec = 0");
		expect(out).not.toContain("set global.flMaintC1Sec");
	});

	it("is just the restore block when there is nothing to do", () => {
		const out = generateCustomMacro({ customCounters: [], rules: [] });
		expect(out).not.toContain("set global.");
		expect(out).toContain("flMaintCustomLoaded");
	});

	it("structure: every top-level `if` is followed by an indented body", () => {
		const lines = generateCustomMacro(input({ customCounters: counters })).split("\n");
		lines.forEach((line, i) => {
			if (/^if /.test(line)) { expect(lines[i + 1], line).toMatch(/^\t\S/); }
		});
	});

	it("every expression in the generated macro parses with the same parser the editor uses", () => {
		const text = generateCustomMacro(input({
			customCounters: counters,
			rules: [
				{ rule: rule({ id: "r1" }), baseline: 3600 },
				{ rule: rule({ id: "r2", counter: "axisMm:1", intervalValue: 1000000 }), baseline: 50 },
				{ rule: rule({ id: "r3", counter: "custom:c1", actionWhenIdle: false }), baseline: 0 },
			],
		}));
		const expressions: Array<string> = [];
		for (const raw of text.split("\n")) {
			const line = raw.trim();
			const cond = /^if (.+)$/.exec(line);
			if (cond) { expressions.push(cond[1]); }
			const assign = /^(?:set global\.\w+|global \w+) = (.+)$/.exec(line);
			if (assign) { expressions.push(assign[1]); }
		}
		expect(expressions.length).toBeGreaterThan(8);
		for (const e of expressions) {
			expect(parseExpression(e).errors, e).toEqual([]);
		}
	});
});

describe("generateCustomFlushMacro", () => {
	const text = generateCustomFlushMacro(input({ customCounters: [{ id: "c1", title: "t", conditions: ["state.currentTool == 1"] }] }));

	it("truncates the state file first, then appends one guarded block per counter and per fired marker", () => {
		expect(text).toContain(`echo >"${MAINTENANCE_CUSTOM_STATE_PATH}" "; Auto-generated`);
		for (const name of ["flMaintC1Sec", "flMaintRk3x9aq1w2e3Fired"]) {
			expect(text).toContain(`if exists(global.${name})\n\techo >>"${MAINTENANCE_CUSTOM_STATE_PATH}" "if !exists(global.${name})"`);
			expect(text).toContain(`"  global ${name} = " ^ global.${name}`);
			expect(text).toContain(`"  set global.${name} = " ^ global.${name}`);
		}
	});

	it("guards every write with `exists`: the flush can run before a counter added a moment ago has been seeded", () => {
		const writes = text.split("\n").filter((l) => l.startsWith("\techo >>"));
		expect(writes.length).toBeGreaterThan(0);
		// each name's first write is preceded by its own exists() guard line
		expect(text.match(/^if exists\(global\.\w+\)$/gm)).toHaveLength(2);
	});

	it("carries the version stamp", () => {
		expect(extractMaintenanceMacroVersion(text)).toBe(MAINTENANCE_MACRO_SET_VERSION);
	});
});
