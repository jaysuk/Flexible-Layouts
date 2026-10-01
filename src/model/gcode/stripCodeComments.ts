/**
 * "Remove comments from code lines": drop the trailing `;` comment from every line that carries a real
 * G-code command (or a conditional-G-code keyword), and leave everything else alone - comment-only
 * lines, blank lines and anything the lexer does not recognise as valid. Built on `dwc-gcode-core`'s
 * `lexLine`, so a `;` inside a quoted string or a string-argument command (`M117 "a;b"`) is not mistaken
 * for a comment.
 */

import { lexLine } from "dwc-gcode-core";

/**
 * The line without its trailing comment (and the whitespace before it), or `null` when it should be left
 * as it is: no comment, not a code line, or a line the lexer reports errors for (its idea of where the
 * comment starts is the least reliable there, and deleting text we are unsure of is the worse mistake).
 */
export function withoutCodeComment(line: string): string | null {
	const lexed = lexLine(line);
	if (lexed.comment === null) return null;
	if (lexed.kind !== "commands" && lexed.kind !== "meta") return null;
	if (lexed.errors.length > 0) return null;
	return line.slice(0, lexed.comment.start).trimEnd();
}

/** The same over a whole text; line endings are preserved. `fromLine`/`toLine` (1-based, inclusive) limit it. */
export function stripCodeComments(text: string, fromLine = 1, toLine = Infinity): { text: string; changed: number } {
	let changed = 0;
	const out = text.split("\n").map((raw, i) => {
		const n = i + 1;
		if (n < fromLine || n > toLine) return raw;
		const cr = raw.endsWith("\r");
		const stripped = withoutCodeComment(cr ? raw.slice(0, -1) : raw);
		if (stripped === null) return raw;
		changed++;
		return cr ? `${stripped}\r` : stripped;
	});
	return { text: out.join("\n"), changed };
}
