/**
 * Evaluate object-model-driven conditional rules into a set of widget effects.
 *
 * This is what gives widgets BtnCmd-style "smart" behaviour: a button can turn green when a heater
 * reaches temperature, a read-out can hide unless a job is printing, etc. Pure and dependency-free
 * so callers wrap it in a computed for reactivity.
 */
import type { ConditionRule } from "../model/document";
import { resolveOmPath } from "./omPath";

export interface ConditionEffects {
	/** Colour token to apply, or undefined to keep the widget's own colour. */
	color?: string;
	hidden: boolean;
	disabled: boolean;
}

/** Coerce a compared pair to numbers when both look numeric, else compare as strings. */
function compare(actual: unknown, expected: string | number | undefined): { a: number; b: number } | { sa: string; sb: string } {
	const an = typeof actual === "number" ? actual : Number(actual);
	const bn = typeof expected === "number" ? expected : Number(expected);
	if (Number.isFinite(an) && Number.isFinite(bn)) {
		return { a: an, b: bn };
	}
	return { sa: String(actual ?? ""), sb: String(expected ?? "") };
}

function ruleMatches(actual: unknown, rule: ConditionRule): boolean {
	switch (rule.operator) {
		case "truthy":
			return Boolean(actual);
		case "falsy":
			return !actual;
		case "contains":
			return String(actual ?? "").toLowerCase().includes(String(rule.value ?? "").toLowerCase());
		default: {
			const c = compare(actual, rule.value);
			if ("a" in c) {
				switch (rule.operator) {
					case "eq": return c.a === c.b;
					case "ne": return c.a !== c.b;
					case "gt": return c.a > c.b;
					case "lt": return c.a < c.b;
					case "gte": return c.a >= c.b;
					case "lte": return c.a <= c.b;
				}
			} else {
				switch (rule.operator) {
					case "eq": return c.sa === c.sb;
					case "ne": return c.sa !== c.sb;
					// String ordering for gt/lt is rarely meaningful; fall back to lexicographic
					case "gt": return c.sa > c.sb;
					case "lt": return c.sa < c.sb;
					case "gte": return c.sa >= c.sb;
					case "lte": return c.sa <= c.sb;
				}
			}
			return false;
		}
	}
}

/** True if a single rule currently matches. Used for page-level show/hide gating. */
export function evaluateRule(model: unknown, rule: ConditionRule | undefined): boolean {
	if (!rule || !rule.omPath) {
		return true;
	}
	return ruleMatches(resolveOmPath(model, rule.omPath), rule);
}

export function evaluateConditions(model: unknown, rules: Array<ConditionRule> | undefined): ConditionEffects {
	const effects: ConditionEffects = { hidden: false, disabled: false };
	if (!rules || rules.length === 0) {
		return effects;
	}
	for (const rule of rules) {
		if (!rule.omPath) {
			continue;
		}
		const actual = resolveOmPath(model, rule.omPath);
		if (ruleMatches(actual, rule)) {
			if (rule.color) {
				effects.color = rule.color;
			}
			if (rule.hide) {
				effects.hidden = true;
			}
			if (rule.disable) {
				effects.disabled = true;
			}
		}
	}
	return effects;
}
