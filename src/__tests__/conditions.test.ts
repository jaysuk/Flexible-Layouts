import { describe, expect, it } from "vitest";

import { evaluateConditions, evaluateRule } from "../util/conditions";

const model = {
	heat: { heaters: [{ current: 65 }] },
	state: { status: "processing" },
	flag: true,
	zero: 0,
};

describe("evaluateRule", () => {
	it("handles numeric comparisons", () => {
		expect(evaluateRule(model, { omPath: "heat.heaters[0].current", operator: "gte", value: 60 })).toBe(true);
		expect(evaluateRule(model, { omPath: "heat.heaters[0].current", operator: "lt", value: 60 })).toBe(false);
		expect(evaluateRule(model, { omPath: "heat.heaters[0].current", operator: "eq", value: 65 })).toBe(true);
	});

	it("handles strings, contains, truthy/falsy", () => {
		expect(evaluateRule(model, { omPath: "state.status", operator: "eq", value: "processing" })).toBe(true);
		expect(evaluateRule(model, { omPath: "state.status", operator: "contains", value: "process" })).toBe(true);
		expect(evaluateRule(model, { omPath: "flag", operator: "truthy" })).toBe(true);
		expect(evaluateRule(model, { omPath: "zero", operator: "falsy" })).toBe(true);
	});

	it("treats an empty path as always-true", () => {
		expect(evaluateRule(model, { omPath: "", operator: "truthy" })).toBe(true);
		expect(evaluateRule(model, undefined)).toBe(true);
	});
});

describe("evaluateConditions", () => {
	it("collects colour / hide / disable effects from matching rules", () => {
		const effects = evaluateConditions(model, [
			{ omPath: "heat.heaters[0].current", operator: "gte", value: 60, color: "success" },
			{ omPath: "state.status", operator: "eq", value: "idle", hide: true },
			{ omPath: "flag", operator: "truthy", disable: true },
		]);
		expect(effects.color).toBe("success");
		expect(effects.hidden).toBe(false); // status is processing, not idle
		expect(effects.disabled).toBe(true);
	});

	it("returns neutral effects with no rules", () => {
		expect(evaluateConditions(model, undefined)).toEqual({ hidden: false, disabled: false });
	});
});
