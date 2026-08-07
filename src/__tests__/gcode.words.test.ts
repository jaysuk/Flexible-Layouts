import { describe, expect, it } from "vitest";

import { parseLines, wordValue, wordValues } from "../model/gcode/words";

describe("parseLines", () => {
	it("computes byte offsets that land on each line's start", () => {
		const text = "G1 X10\nG1 Y20\nG1 Z5";
		const lines = parseLines(text);
		expect(lines.map((l) => l.offset)).toEqual([0, 7, 14]);
	});

	it("handles CRLF line endings without shifting subsequent offsets", () => {
		const text = "G1 X10\r\nG1 Y20\r\n";
		const lines = parseLines(text);
		expect(lines.map((l) => l.offset)).toEqual([0, 8, 16]);
		expect(lines[0].words).toEqual([{ letter: "G", value: 1 }, { letter: "X", value: 10 }]);
	});

	it("counts multi-byte UTF-8 characters (e.g. inside a comment) as more than one byte", () => {
		// "°" is 2 bytes in UTF-8 - the offset of the *next* line must reflect that, even though the
		// comment itself is stripped before tokenizing.
		const text = "G1 X10 ; 90° turn\nG1 Y20\n";
		const lines = parseLines(text);
		expect(lines[1].offset).toBe(new TextEncoder().encode("G1 X10 ; 90° turn\n").length);
		expect(lines[0].words).toEqual([{ letter: "G", value: 1 }, { letter: "X", value: 10 }]);
	});

	it("strips ; and (...) comments without losing real words", () => {
		const lines = parseLines("G1 (rapid to start) X10 Y20 ; go\n");
		expect(lines[0].words).toEqual([
			{ letter: "G", value: 1 }, { letter: "X", value: 10 }, { letter: "Y", value: 20 },
		]);
	});

	it("parses negative and decimal values, including bare-G decimals like G90.1", () => {
		const lines = parseLines("G90.1 X-1.5 Y.25\n");
		expect(lines[0].words).toEqual([
			{ letter: "G", value: 90.1 }, { letter: "X", value: -1.5 }, { letter: "Y", value: 0.25 },
		]);
	});

	it("keeps repeated letters (e.g. two G-words on one line) as separate entries", () => {
		const lines = parseLines("G90 G1 X10 F500\n");
		expect(wordValues(lines[0].words, "G")).toEqual([90, 1]);
		expect(wordValue(lines[0].words, "X")).toBe(10);
	});

	it("treats an empty file as a single empty line at offset 0", () => {
		const lines = parseLines("");
		expect(lines).toEqual([{ offset: 0, words: [] }]);
	});
});
