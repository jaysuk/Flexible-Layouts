/**
 * Pure text patching for config.g: adds/updates the `T1` parameter on the existing `M552` line (the
 * persistence gotcha RRF's HTTPS setup.md calls out explicitly - a later bare `M552 S1` would silently
 * turn TLS back off, since TLS state isn't remembered across an interface enable), and adds/updates an
 * `M586 T1` line for a chosen protocol. Operates on config.g's TEXT only - never touches the live
 * machine; callers read the current file, patch it, and upload the result themselves, with a preview
 * of `changes` shown before applying.
 *
 * Deliberately line-based rather than one whole-file regex: config.g is free-form G-code with
 * arbitrary comments and spacing, and finding "the M552 line" by scanning line-by-line is far more
 * robust than trying to anchor a single pattern across the whole file.
 */

import { appendLine, findLine, paramValue, replaceLine, setOrAddParam, splitComment, type GcodeFilePatchResult } from "../../util/gcodeFilePatch";

/** Adds/updates `T1` on the config.g's M552 line so TLS survives a reboot. No-ops if already T1, or if
 * no M552 line exists at all (reported via `changes` rather than guessing where to insert one - every
 * WiFi/Ethernet-configured Duet already has one, so its absence is itself worth flagging). */
export function patchM552ForTls(configText: string): GcodeFilePatchResult {
	const match = findLine(configText, (code) => /^\s*M552\b/i.test(code));
	if (!match) {
		return { text: configText, changed: false, changes: ["No M552 line found in config.g - add one manually."] };
	}
	const { code, comment } = splitComment(match.line);
	if (paramValue(code, "T") === "1") {
		return { text: configText, changed: false, changes: ["M552 already has T1 - nothing to change."] };
	}
	const newCode = setOrAddParam(code, "T", "1");
	const newLine = comment ? `${newCode.trimEnd()} ${comment}` : newCode;
	return {
		text: replaceLine(configText, match, newLine),
		changed: true,
		changes: [`"${match.line.trim()}" → "${newLine.trim()}"`],
	};
}

/** Ensures config.g has BOTH a plain and a TLS-enabled `M586` line for the given protocol (0=HTTP,
 * 1=FTP, 2=Telnet), adding whichever is missing as its OWN new line - never converting an existing
 * plain line into a TLS one. Confirmed on real hardware: a bare `M586 P<n> S1 T1` line on its own
 * takes the plain (non-TLS) listener for that protocol offline - the two need to coexist as separate
 * lines (e.g. `M586 P0 S1` for HTTP alongside `M586 P0 S1 T1 R443` for HTTPS) for both to keep working
 * at once. This used to instead add T1 onto whichever line already existed, which is exactly the bug
 * that broke plain HTTP on a real machine.
 *
 * Both missing lines (when neither exists yet) are inserted as one block, plain line first, so
 * inserting them one at a time (each anchored independently) can't reverse their order. Anchored right
 * after the LAST existing line for this protocol if there is one - grouping a newly-added line with
 * its sibling rather than splitting them apart - falling back to right after the M552 line, or the end
 * of the file if there's somehow no M552 line either. */
export function patchM586ForTls(configText: string, protocol: 0 | 1 | 2, tlsPort: number): GcodeFilePatchResult {
	const isForProtocol = (code: string): boolean => {
		const pRe = new RegExp(`(?:^|\\s)P${protocol}(?:\\s|$)`, "i");
		return /^\s*M586\b/i.test(code) && pRe.test(code);
	};

	const linesToAdd: Array<string> = [];
	if (!findLine(configText, (code) => isForProtocol(code) && paramValue(code, "T") !== "1")) {
		linesToAdd.push(`M586 P${protocol} S1`);
	}
	if (!findLine(configText, (code) => isForProtocol(code) && paramValue(code, "T") === "1")) {
		linesToAdd.push(`M586 P${protocol} S1 T1 R${tlsPort}`);
	}
	if (linesToAdd.length === 0) {
		return { text: configText, changed: false, changes: [`M586 P${protocol} already has both a plain and a TLS line - nothing to change.`] };
	}

	// The LAST matching line, so a file with (unusually) more than one existing line for this protocol
	// still anchors after all of them, not in between.
	let lastForProtocol: ReturnType<typeof findLine> = null;
	for (let from = 0; ;) {
		const rest = configText.slice(from);
		const match = findLine(rest, isForProtocol);
		if (!match) { break; }
		lastForProtocol = { index: from + match.index, length: match.length, line: match.line };
		from += match.index + match.length + 1; // +1 to step past the newline this match ended on
	}
	const anchor = lastForProtocol ?? findLine(configText, (code) => /^\s*M552\b/i.test(code));

	const block = linesToAdd.join("\n");
	const text = anchor
		? `${configText.slice(0, anchor.index + anchor.length)}\n${block}${configText.slice(anchor.index + anchor.length)}`
		: appendLine(configText, block);
	return { text, changed: true, changes: linesToAdd.map((l) => `Added new line: "${l}"`) };
}
