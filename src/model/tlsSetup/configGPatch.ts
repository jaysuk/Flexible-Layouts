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

/** Adds/updates `T1` on the config.g line for the given M586 protocol (0=HTTP, 1=FTP, 2=Telnet),
 * appending a fresh `M586 P<n> S1 T1` line right after the M552 line if none exists yet for that
 * protocol - appending a new line is far lower-risk than guessing where an existing, differently
 * laid-out one might be. */
export function patchM586ForTls(configText: string, protocol: 0 | 1 | 2): GcodeFilePatchResult {
	const pRe = new RegExp(`(?:^|\\s)P${protocol}(?:\\s|$)`, "i");
	const match = findLine(configText, (code) => /^\s*M586\b/i.test(code) && pRe.test(code));

	if (match) {
		const { code, comment } = splitComment(match.line);
		if (paramValue(code, "T") === "1") {
			return { text: configText, changed: false, changes: [`M586 P${protocol} already has T1 - nothing to change.`] };
		}
		const newCode = setOrAddParam(code, "T", "1");
		const newLine = comment ? `${newCode.trimEnd()} ${comment}` : newCode;
		return {
			text: replaceLine(configText, match, newLine),
			changed: true,
			changes: [`"${match.line.trim()}" → "${newLine.trim()}"`],
		};
	}

	// No line for this protocol yet - append a new one right after the M552 line (or at the end, if
	// there's somehow no M552 line either).
	const m552 = findLine(configText, (code) => /^\s*M552\b/i.test(code));
	const newLine = `M586 P${protocol} S1 T1`;
	if (!m552) {
		return { text: appendLine(configText, newLine), changed: true, changes: [`Added new line: "${newLine}"`] };
	}
	const insertAt = m552.index + m552.length;
	const text = `${configText.slice(0, insertAt)}\n${newLine}${configText.slice(insertAt)}`;
	return { text, changed: true, changes: [`Added new line: "${newLine}"`] };
}
