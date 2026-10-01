import { describe, expect, it } from "vitest";
import { stripCodeComments, withoutCodeComment } from "../src/model/gcode/stripCodeComments";

describe("withoutCodeComment", () => {
	it("drops a trailing comment and the space before it", () => {
		expect(withoutCodeComment("G1 X10 Y20 ; move over")).toBe("G1 X10 Y20");
		expect(withoutCodeComment("M104 S200;heat")).toBe("M104 S200");
	});

	it("keeps indentation", () => {
		expect(withoutCodeComment("  G28 ; home")).toBe("  G28");
	});

	it("leaves comment-only, blank and uncommented lines alone", () => {
		expect(withoutCodeComment("; just a note")).toBeNull();
		expect(withoutCodeComment("   ; indented note")).toBeNull();
		expect(withoutCodeComment("")).toBeNull();
		expect(withoutCodeComment("G28")).toBeNull();
	});

	it("does not treat a ; inside a quoted string as a comment", () => {
		expect(withoutCodeComment('M117 "a;b" ; trailing')).toBe('M117 "a;b"');
		expect(withoutCodeComment('M117 "a;b"')).toBeNull();
	});

	it("handles conditional G-code lines", () => {
		expect(withoutCodeComment("if heat.heaters[0].current > 50 ; hot")).toBe("if heat.heaters[0].current > 50");
	});
});

describe("stripCodeComments", () => {
	const src = ["; header", "G28 ; home", "", "G1 X5 ; go", "; footer"].join("\n");

	it("only touches code lines", () => {
		const r = stripCodeComments(src);
		expect(r.text).toBe(["; header", "G28", "", "G1 X5", "; footer"].join("\n"));
		expect(r.changed).toBe(2);
	});

	it("preserves CRLF endings", () => {
		const r = stripCodeComments("G28 ; home\r\n; note\r\nG1 X1 ; x\r\n");
		expect(r.text).toBe("G28\r\n; note\r\nG1 X1\r\n");
	});

	it("is idempotent", () => {
		const once = stripCodeComments(src).text;
		expect(stripCodeComments(once)).toEqual({ text: once, changed: 0 });
	});

	it("can be limited to a line range", () => {
		const r = stripCodeComments(src, 4, 4);
		expect(r.text).toBe(["; header", "G28 ; home", "", "G1 X5", "; footer"].join("\n"));
		expect(r.changed).toBe(1);
	});
});
