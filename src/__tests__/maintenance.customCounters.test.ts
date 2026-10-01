import { describe, expect, it } from "vitest";

import { checkCondition, customCounterIdFor, isCustomCounter, MAX_CONDITION_LENGTH, testConditionOnMachine } from "../model/maintenance/customCounters";
import { checkRuleAction, MAX_RULE_ACTION_LENGTH } from "../model/reminders/ruleAction";

describe("checkCondition", () => {
	it("accepts the kinds of expression a person would write", () => {
		for (const ok of [
			'state.status == "processing"',
			"state.currentTool == 1",
			"heat.heaters[0].current > 60",
			'spindles[0].state == "forward" && move.axes[2].homed',
			"abs(move.axes[0].machinePosition - global.myGlobal) < 5",
			"!(state.status == \"idle\")",
		]) {
			const out = checkCondition(ok);
			expect(out.ok, ok).toBe(true);
		}
	});

	it("trims, and returns the trimmed text", () => {
		expect(checkCondition("  state.currentTool == 2  ")).toEqual({ ok: true, condition: "state.currentTool == 2" });
	});

	it.each([
		["", "empty"],
		["   ", "empty"],
		["state.status ==\n\"idle\"", "multiline"],
		["state.status == \"idle\" ; M112", "comment"],
		["x".repeat(MAX_CONDITION_LENGTH + 1), "tooLong"],
	])("refuses %j (%s)", (text, problem) => {
		const out = checkCondition(text);
		expect(out.ok).toBe(false);
		if (!out.ok) { expect(out.problem).toBe(problem); }
	});

	it("refuses a syntactically broken expression, with the parser's reason", () => {
		for (const bad of ["state.status ==", "(1 + ", "1 +* 2", "heat.heaters[0.current > 1"]) {
			const out = checkCondition(bad);
			expect(out.ok, bad).toBe(false);
			if (!out.ok) { expect(out.problem, bad).toBe("syntax"); }
		}
	});

	it("refuses functions that do not exist, and ones that would read the SD card on every poll", () => {
		const unknown = checkCondition("frobnicate(1) > 0");
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) { expect(unknown.problem).toBe("unknownFunction"); expect(unknown.detail).toBe("frobnicate"); }
		for (const fn of ["fileexists", "fileread"]) {
			const out = checkCondition(`${fn}("0:/sys/x") == "1"`);
			expect(out.ok, fn).toBe(false);
			if (!out.ok) { expect(out.problem).toBe("disallowedFunction"); }
		}
	});

	it("refuses var./param. - the generated macro has none for the user to refer to", () => {
		for (const bad of ["var.dt > 1", "param.S == 2"]) {
			const out = checkCondition(bad);
			expect(out.ok, bad).toBe(false);
			if (!out.ok) { expect(out.problem, bad).toBe("localVariable"); }
		}
		expect(checkCondition("global.myFlag").ok).toBe(true);
	});
});

describe("testConditionOnMachine", () => {
	const io = (reply: string | Error) => ({
		sent: [] as Array<string>,
		async sendCode(code: string) { this.sent.push(code); if (reply instanceof Error) { throw reply; } return reply; },
	});

	it("echoes the condition and reports true/false", async () => {
		const a = io("true\n");
		expect(await testConditionOnMachine(a, 'state.status == "idle"')).toEqual({ ok: true, value: true });
		expect(a.sent).toEqual(['echo state.status == "idle"']);
		expect(await testConditionOnMachine(io("False"), "x")).toEqual({ ok: true, value: false });
	});

	it("refuses anything that is not a plain boolean - a bare number cannot be `if`-ed on", async () => {
		const out = await testConditionOnMachine(io("23.4"), "heat.heaters[0].current");
		expect(out).toEqual({ ok: false, message: "23.4" });
	});

	it("surfaces the machine's error text, an empty reply, and a transport failure", async () => {
		expect(await testConditionOnMachine(io("Error: unknown value tools[2].active"), "tools[2].active"))
			.toEqual({ ok: false, message: "Error: unknown value tools[2].active" });
		expect(await testConditionOnMachine(io(""), "x")).toEqual({ ok: false, message: "no reply" });
		expect(await testConditionOnMachine(io(new Error("link down")), "x")).toEqual({ ok: false, message: "link down" });
	});
});

describe("custom counter shape", () => {
	it("derives ids from a counter that only goes up", () => {
		expect(customCounterIdFor(1)).toBe("c1");
		expect(customCounterIdFor(14)).toBe("c14");
	});

	it("accepts a well-formed counter and refuses one whose id could not be an RRF name", () => {
		expect(isCustomCounter({ id: "c1", title: "Tool 1", conditions: ["state.currentTool == 1"] })).toBe(true);
		expect(isCustomCounter({ id: "C1", title: "x", conditions: [] })).toBe(false);
		expect(isCustomCounter({ id: "c1;", title: "x", conditions: [] })).toBe(false);
		expect(isCustomCounter({ id: "c1", title: "x", conditions: [1] })).toBe(false);
		expect(isCustomCounter(null)).toBe(false);
	});
});

describe("checkRuleAction", () => {
	it.each([
		['M291 P"Grease the ways" R"Maintenance" S1', true],
		["M118 S\"hello\"", true],
		["T1", true],
		["G4 S1", true],
		["m291 p\"x\"", true],
		["M98 P\"0:/macros/service.g\"", true],
	])("accepts %s", (text, ok) => {
		expect(checkRuleAction(text).ok).toBe(ok);
	});

	it("returns the trimmed action", () => {
		expect(checkRuleAction("  M291 P\"x\"  ")).toEqual({ ok: true, action: 'M291 P"x"' });
	});

	it.each([
		["", "empty"],
		["   ", "empty"],
		["M291 P\"a\"\nM112", "multiline"],
		["echo hello", "notGcode"],
		["if true", "notGcode"],
		["Mx", "notGcode"],
		["M" + "1".repeat(MAX_RULE_ACTION_LENGTH), "tooLong"],
	])("refuses %j (%s)", (text, problem) => {
		const out = checkRuleAction(text);
		expect(out.ok).toBe(false);
		if (!out.ok) { expect(out.problem).toBe(problem); }
	});
});
