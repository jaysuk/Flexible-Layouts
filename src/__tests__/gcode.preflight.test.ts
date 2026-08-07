import { describe, expect, it } from "vitest";

import { parseGcode } from "../model/gcode/parse";
import { runPreflight, type PreflightMachineState } from "../model/gcode/preflight";

function axis(letter: string, patch: Partial<PreflightMachineState["axes"][number]> = {}) {
	return { letter, homed: true, min: -5, max: 200, speed: 6000, machinePosition: 10, userPosition: 0, ...patch };
}

function machine(patch: Partial<PreflightMachineState> = {}): PreflightMachineState {
	return { axes: [axis("X"), axis("Y"), axis("Z")], spindles: [{ min: 8000, max: 24000 }], ...patch };
}

function levelOf(checks: ReturnType<typeof runPreflight>, id: string): string | undefined {
	return checks.find((c) => c.id === id)?.level;
}

describe("runPreflight", () => {
	it("passes every check on a well-behaved job within a well-configured machine", () => {
		const parse = parseGcode("G90\nT1\nM3 S12000\nG1 X10 Y10 F1000\n");
		const m = machine({ axes: [axis("X", { machinePosition: 10, userPosition: 0 }), axis("Y", { machinePosition: 10, userPosition: 0 }), axis("Z", { machinePosition: 10, userPosition: 0 })] });
		const checks = runPreflight(parse, m, [{ number: 1, name: "6mm endmill", diameter: 6 }], { rapidRate: 3000 });
		expect(levelOf(checks, "axesHomed")).toBe("ok");
		expect(levelOf(checks, "envelope")).toBe("ok");
		expect(levelOf(checks, "workOrigin")).toBe("ok");
		expect(levelOf(checks, "tools")).toBe("ok");
		expect(levelOf(checks, "spindleSpeed")).toBe("ok");
		expect(levelOf(checks, "feedLimit")).toBe("ok");
		expect(levelOf(checks, "rapidZ")).toBe("ok");
	});

	it("flags an unhomed axis as an error", () => {
		const parse = parseGcode("G1 X10\n");
		const m = machine({ axes: [axis("X", { homed: false }), axis("Y"), axis("Z")] });
		const checks = runPreflight(parse, m, []);
		expect(levelOf(checks, "axesHomed")).toBe("error");
	});

	it("flags a toolpath that exceeds the travel envelope", () => {
		const parse = parseGcode("G90\nG1 X500 F1000\n"); // way past a 200mm limit
		const m = machine();
		const checks = runPreflight(parse, m, []);
		expect(levelOf(checks, "envelope")).toBe("error");
	});

	it("warns (not errors) when Z work offset reads zero", () => {
		const parse = parseGcode("G1 X10\n");
		const m = machine({ axes: [axis("X", { machinePosition: 10, userPosition: 0 }), axis("Y", { machinePosition: 10, userPosition: 0 }), axis("Z", { machinePosition: 0, userPosition: 0 })] });
		const checks = runPreflight(parse, m, []);
		expect(levelOf(checks, "workOrigin")).toBe("warn");
	});

	it("warns about a tool used in the file but missing from the tool table", () => {
		const parse = parseGcode("T5\nG1 X10 F500\n");
		const checks = runPreflight(parse, machine(), []);
		const check = checks.find((c) => c.id === "tools")!;
		expect(check.level).toBe("warn");
		expect(check.message).toContain("5");
	});

	it("warns about a spindle speed outside every configured spindle's range", () => {
		const parse = parseGcode("M3 S30000\nG1 X10 F500\n");
		const checks = runPreflight(parse, machine(), []);
		expect(levelOf(checks, "spindleSpeed")).toBe("warn");
	});

	it("warns when the commanded feed exceeds the X/Y speed limit", () => {
		const parse = parseGcode("G1 X10 F9999\n");
		const m = machine({ axes: [axis("X", { speed: 3000 }), axis("Y", { speed: 3000 }), axis("Z")] });
		const checks = runPreflight(parse, m, []);
		expect(levelOf(checks, "feedLimit")).toBe("warn");
	});

	it("warns about a rapid that dips below Z0 while moving in X/Y", () => {
		const parse = parseGcode("G90\nG0 X10 Z-1\n");
		const checks = runPreflight(parse, machine(), []);
		expect(levelOf(checks, "rapidZ")).toBe("warn");
	});

	it("never returns an error-level run-time or info check - run time is always informational", () => {
		const parse = parseGcode("G1 X10 F500\n");
		const checks = runPreflight(parse, machine(), [], { rapidRate: 3000 });
		const runTime = checks.find((c) => c.id === "runTime")!;
		expect(runTime.level).toBe("info");
		expect(runTime.message).toMatch(/Estimated run time: \d+m \d+s/);
	});

	it("surfaces parser warnings (e.g. a move with no feed rate) as warn-level checks", () => {
		const parse = parseGcode("G1 X10\n"); // no F ever given
		const checks = runPreflight(parse, machine(), []);
		const parserWarnings = checks.filter((c) => c.id.startsWith("parserWarning:"));
		expect(parserWarnings).toHaveLength(1);
		expect(parserWarnings[0].level).toBe("warn");
	});
});
