import { describe, expect, it } from "vitest";

import { evalMathExpr, normalizeBtnCmdExpression } from "../src/util/mathExpr";

describe("evalMathExpr", () => {
	it("evaluates the basics with x substituted", () => {
		expect(evalMathExpr("x / 60", 120)).toBe(2);
		expect(evalMathExpr("x * 2 + 1", 10)).toBe(21);
		expect(evalMathExpr("(x - 32) * 5 / 9", 212)).toBe(100);
		expect(evalMathExpr("-x", 5)).toBe(-5);
		expect(evalMathExpr("2.5", 0)).toBe(2.5);
	});

	it("honours precedence and parentheses", () => {
		expect(evalMathExpr("2 + 3 * 4", 0)).toBe(14);
		expect(evalMathExpr("(2 + 3) * 4", 0)).toBe(20);
	});

	it("rejects malformed input instead of throwing", () => {
		expect(evalMathExpr("x +", 1)).toBeUndefined();
		expect(evalMathExpr("x))", 1)).toBeUndefined();
		expect(evalMathExpr("alert(1)", 1)).toBeUndefined();
		expect(evalMathExpr("x..2", 1)).toBeUndefined();
		expect(evalMathExpr("", 1)).toBeUndefined();
		expect(evalMathExpr("x / 0", 1)).toBeUndefined(); // Infinity is not a displayable number
	});
});

describe("normalizeBtnCmdExpression", () => {
	it("turns #VAL / VAL tokens into x", () => {
		expect(normalizeBtnCmdExpression("#VAL * 2")).toBe("x * 2");
		expect(normalizeBtnCmdExpression("VAL/60")).toBe("x/60");
	});
	it("prefixes the implicit x for operator-leading shorthand", () => {
		expect(normalizeBtnCmdExpression("*2")).toBe("x*2");
		expect(normalizeBtnCmdExpression("/ 60")).toBe("x/ 60");
	});
	it("passes x-based expressions through and rejects unusable ones", () => {
		expect(normalizeBtnCmdExpression("x + 1")).toBe("x + 1");
		expect(normalizeBtnCmdExpression("")).toBeUndefined();
		expect(normalizeBtnCmdExpression("2")).toBeUndefined(); // no value reference at all
	});
});
