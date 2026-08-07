/**
 * Shared line/word tokenizer for the G-code analysis modules (parse.ts, modalState.ts). Kept
 * dependency-free and pure so both the geometry parser and the modal-state replay stay in lockstep
 * on comment stripping and word extraction - a divergence here would silently desync run-from-line's
 * reconstructed preamble from what the geometry parser actually saw.
 */

export interface GcodeWord {
	letter: string;
	value: number;
}

export interface GcodeLine {
	/** Byte offset (UTF-8) of this line's first character in the source text - RRF's job.filePosition
	 *  and M26's seek target are byte offsets into the SD file, not character or line indices. */
	offset: number;
	/** Parsed words, in the order they appeared, comments already stripped. */
	words: Array<GcodeWord>;
}

/** Strip `;` line comments and `(...)` parenthetical comments (not nested, per RepRapFirmware). */
function stripComments(line: string): string {
	return line.replace(/\(.*?\)/g, " ").replace(/;.*$/, "");
}

const WORD_RE = /([A-Za-z])\s*(-?(?:\d+\.?\d*|\.\d+))/g;

function tokenize(line: string): Array<GcodeWord> {
	const words: Array<GcodeWord> = [];
	WORD_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = WORD_RE.exec(line)) !== null) {
		words.push({ letter: m[1].toUpperCase(), value: Number(m[2]) });
	}
	return words;
}

/**
 * Split G-code source into lines with their UTF-8 byte offsets. A `\r\n` or bare `\n` terminator is
 * consumed as part of the byte count of the line it ends; the final line needs no terminator.
 */
export function parseLines(text: string): Array<GcodeLine> {
	const encoder = new TextEncoder();
	const out: Array<GcodeLine> = [];
	let pos = 0;
	let byteOffset = 0;
	const len = text.length;
	while (pos <= len) {
		const nl = text.indexOf("\n", pos);
		const end = nl === -1 ? len : nl;
		let raw = text.slice(pos, end);
		if (raw.endsWith("\r")) { raw = raw.slice(0, -1); }
		out.push({ offset: byteOffset, words: tokenize(stripComments(raw)) });
		const consumedEnd = nl === -1 ? len : nl + 1;
		byteOffset += encoder.encode(text.slice(pos, consumedEnd)).length;
		if (nl === -1) { break; }
		pos = nl + 1;
	}
	return out;
}

/** First value for `letter` on a line, if present. */
export function wordValue(words: Array<GcodeWord>, letter: string): number | undefined {
	return words.find((w) => w.letter === letter)?.value;
}

/** All values for `letter` on a line, in order - letters like G/M can legally repeat on one line. */
export function wordValues(words: Array<GcodeWord>, letter: string): Array<number> {
	return words.filter((w) => w.letter === letter).map((w) => w.value);
}
