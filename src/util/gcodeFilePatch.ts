/**
 * Generic, reusable line-based text patching for RRF macro/config files (config.g, daemon.g, ...).
 * Extracted from tlsSetup/configGPatch.ts, which originated this pattern for TLS's M552/M586 lines -
 * now shared with the maintenance feature's config.g/daemon.g patches too, rather than duplicated.
 *
 * Deliberately line-based rather than one whole-file regex: these files are free-form G-code with
 * arbitrary comments and spacing, and finding "the line that matters" by scanning line-by-line is far
 * more robust than trying to anchor a single pattern across the whole file. Operates on TEXT only -
 * never touches the live machine; callers read the current file, patch it, and upload the result
 * themselves, with a preview of `changes` shown before applying.
 */

/** RRF's fixed config.g path - shared so every feature that patches it agrees on where it lives. */
export const CONFIG_G_PATH = "0:/sys/config.g";

/** RRF's fixed daemon.g path. */
export const DAEMON_G_PATH = "0:/sys/daemon.g";

export interface GcodeFilePatchResult {
	text: string;
	changed: boolean;
	/** Human-readable summary of what changed (or why nothing did), for a before/after preview in the UI. */
	changes: Array<string>;
}

export interface LineMatch { index: number; length: number; line: string }

export function findLine(text: string, predicate: (codePart: string) => boolean): LineMatch | null {
	let offset = 0;
	for (const line of text.split("\n")) {
		const codePart = line.split(";")[0];
		if (predicate(codePart)) { return { index: offset, length: line.length, line }; }
		offset += line.length + 1; // +1 for the newline this split() consumed
	}
	return null;
}

export function splitComment(line: string): { code: string; comment: string } {
	const idx = line.indexOf(";");
	return idx >= 0 ? { code: line.slice(0, idx), comment: line.slice(idx) } : { code: line, comment: "" };
}

export function paramValue(codePart: string, letter: string): string | null {
	const re = new RegExp(`(?:^|\\s)${letter}(-?\\d+(?:\\.\\d+)?)`, "i");
	return re.exec(codePart)?.[1] ?? null;
}

export function setOrAddParam(codePart: string, letter: string, value: string): string {
	const re = new RegExp(`(^|\\s)${letter}-?\\d+(?:\\.\\d+)?`, "i");
	if (re.test(codePart)) {
		return codePart.replace(re, (_m, sep: string) => `${sep}${letter}${value}`);
	}
	return `${codePart.trimEnd()} ${letter}${value}`;
}

export function replaceLine(text: string, match: LineMatch, newLine: string): string {
	return text.slice(0, match.index) + newLine + text.slice(match.index + match.length);
}

/** Appends a new line at the end of the file, adding a leading newline first if the file doesn't
 *  already end with one. Shared by any patch that needs to add a line it found no existing home for. */
export function appendLine(text: string, newLine: string): string {
	const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
	return `${text}${sep}${newLine}\n`;
}
