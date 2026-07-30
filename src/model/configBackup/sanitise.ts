/**
 * PURE redaction engine for the config backup feature. No imports from `@/` or the DWC runtime -
 * this is plain string/JSON manipulation so it unit-tests trivially and can run in "scan" mode
 * (detect only, used for Verbatim-mode reporting and the pre-upload warning) or "redact" mode
 * (detect and replace). See CONFIG-BACKUP-PLAN.md §3 for the full redaction list this implements.
 *
 * Redaction is parameter-level: the command stays visible, and a redacted G-code line carries a
 * trailing `[FL-REDACTED:<id>]` tag so a later restore can locate and repair it even after the file
 * has been edited and line numbers have drifted (see repair.ts).
 */
import { REDACTED_VALUE, REDACTED_TAG_PREFIX } from "./constants";
import type { RedactionEntry, RedactionTier, RestoreHint } from "./types";

export type SanitiseMode = "scan" | "redact";

export interface SanitiseFileResult {
	content: string;
	redactions: Array<RedactionEntry>;
}

// --- Tier 1/2: G-code command parameter rules ------------------------------------------------------

interface ParamRule { tier: RedactionTier; label: string; restoreHint: RestoreHint }

/** Per-command, per-parameter-letter redaction rules (§3.1, §3.2). M550 is deliberately absent. */
const GCODE_PARAM_RULES: Record<string, Record<string, ParamRule>> = {
	M551: { P: { tier: 1, label: "Machine password", restoreHint: "credential" } },
	M587: {
		S: { tier: 1, label: "WiFi network SSID", restoreHint: "credential" },
		P: { tier: 1, label: "WiFi network password", restoreHint: "credential" },
		I: { tier: 2, label: "Static IP address", restoreHint: "network" },
		J: { tier: 2, label: "Static netmask", restoreHint: "network" },
		K: { tier: 2, label: "Static gateway", restoreHint: "network" },
		L: { tier: 2, label: "Static DNS server", restoreHint: "network" },
	},
	M588: { S: { tier: 1, label: "WiFi network SSID (forget)", restoreHint: "credential" } },
	M589: {
		S: { tier: 1, label: "Access point SSID", restoreHint: "credential" },
		P: { tier: 1, label: "Access point password", restoreHint: "credential" },
		I: { tier: 1, label: "Access point IP address", restoreHint: "network" },
	},
	"M586.4": {
		U: { tier: 1, label: "MQTT username", restoreHint: "credential" },
		K: { tier: 1, label: "MQTT password", restoreHint: "credential" },
		C: { tier: 1, label: "MQTT client ID", restoreHint: "credential" },
	},
	M540: { P: { tier: 2, label: "MAC address", restoreHint: "network" } },
	M552: { P: { tier: 2, label: "IP address", restoreHint: "network" } },
	M553: { P: { tier: 2, label: "Netmask", restoreHint: "network" } },
	M554: { P: { tier: 2, label: "Gateway", restoreHint: "network" } },
};

/** Variable-name pattern that marks a `set global.X` / `var X` assignment as sensitive (§3.3). */
// "hash" is included because that's the actual field naming FL's own access-lock config uses
// (adminHash/operatorHash, see model/access.ts) - a stored password/credential hash is exactly the
// kind of "login information" that must still be caught, plugin-owned file or not.
const SENSITIVE_NAME_RE = /pass|pwd|secret|token|key|auth|psk|ssid|cred|api|bearer|webhook|hash/i;

const LEADING_CODE_RE = /^\s*(?:N\d+\s+)?([A-Za-z]\d+(?:\.\d+)?)\b/;
const ASSIGNMENT_RE = /^(\s*(?:set\s+global\.|var\s+)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)("(?:[^"]|"")*"|\S+)(.*)$/i;
const IS_GLOBAL_RE = /^\s*set\s+global\./i;

/** Matches one `LETTER<value>` parameter token, where value is a quoted string, a number, or a bare run. */
const PARAM_TOKEN_RE = /([A-Za-z])("(?:[^"]|"")*"|-?\d+(?:\.\d+)*|[^\s;]+)/g;

/** Find the index of the first `;` that isn't inside a quoted string. -1 if none. */
function findCommentStart(line: string): number {
	let inQuote = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === "\"") {
			// A doubled quote inside a quoted string is an escaped literal quote, not a close.
			if (inQuote && line[i + 1] === "\"") { i++; continue; }
			inQuote = !inQuote;
		} else if (ch === ";" && !inQuote) {
			return i;
		}
	}
	return -1;
}

function isQuoted(token: string): boolean {
	return token.length >= 2 && token[0] === "\"" && token[token.length - 1] === "\"";
}

function unquote(token: string): string {
	return isQuoted(token) ? token.slice(1, -1).replace(/""/g, "\"") : token;
}

// --- Line-parsing helpers shared with repair.ts (locate the CURRENT value of a param/variable on a
// live machine's file, to suggest as the repaired value for a redacted site) ------------------------

export interface ParsedGcodeLine { code: string | null; params: Record<string, string> }

/** Parse one G-code line's command and every parameter's (unquoted) value, ignoring comments. */
export function parseGcodeLine(line: string): ParsedGcodeLine {
	const commentAt = findCommentStart(line);
	const codePart = commentAt === -1 ? line : line.slice(0, commentAt);
	const codeMatch = LEADING_CODE_RE.exec(codePart);
	if (!codeMatch) { return { code: null, params: {} }; }
	const params: Record<string, string> = {};
	const args = codePart.slice(codeMatch[0].length);
	PARAM_TOKEN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = PARAM_TOKEN_RE.exec(args)) !== null) {
		params[m[1].toUpperCase()] = unquote(m[2]);
	}
	return { code: codeMatch[1].toUpperCase(), params };
}

export interface ParsedAssignmentLine { varName: string; isGlobal: boolean; value: string }

/** Parse a `set global.X = …` / `var X = …` line, if that's what the line is. */
export function parseAssignmentLine(line: string): ParsedAssignmentLine | null {
	const commentAt = findCommentStart(line);
	const codePart = commentAt === -1 ? line : line.slice(0, commentAt);
	const m = ASSIGNMENT_RE.exec(codePart);
	if (!m) { return null; }
	return { varName: m[2], isGlobal: IS_GLOBAL_RE.test(codePart), value: unquote(m[3]) };
}

// --- Tier 4: content patterns, applied per-line after tier 1-3 have already scrubbed structured values

interface Tier4Rule { re: RegExp; label: string; restoreHint: RestoreHint }

const PEM_BLOCK_RE = /-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----/g;

const TIER4_LINE_RULES: Array<Tier4Rule> = [
	{ re: /(https?:\/\/)[^\/\s:@]+:[^\/\s@]+@/gi, label: "Credentials in URL", restoreHint: "credential" },
	{ re: /(api[-_ ]?key|token|secret|password|passwd|pwd|psk|auth)(\s*[:=]\s*)(["'`]?)([^\s"'`;]+)\3/gi, label: "Key/token assignment", restoreHint: "token" },
	{ re: /\b\d{8,10}:[A-Za-z0-9_-]{30,40}\b/g, label: "Telegram bot token", restoreHint: "token" },
	{ re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, label: "JWT", restoreHint: "token" },
	{ re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/gi, label: "Slack webhook URL", restoreHint: "token" },
	{ re: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/gi, label: "Discord webhook URL", restoreHint: "token" },
	{ re: /\bAKIA[0-9A-Z]{16}\b/g, label: "AWS access key", restoreHint: "token" },
	{ re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: "Email address", restoreHint: "opaque" },
];

/** Apply the tier-4 patterns to a single line, replacing the matched span (not the whole line). */
function applyTier4ToLine(
	line: string, mode: SanitiseMode, path: string, lineNo: number, nextId: () => number,
): { line: string; entries: Array<RedactionEntry> } {
	let out = line;
	const entries: Array<RedactionEntry> = [];
	for (const rule of TIER4_LINE_RULES) {
		rule.re.lastIndex = 0;
		if (!rule.re.test(out)) { continue; }
		rule.re.lastIndex = 0;
		const id = nextId();
		entries.push({ id, path, line: lineNo, tier: 4, kind: "text-pattern", label: rule.label, restoreHint: rule.restoreHint });
		if (mode === "redact") {
			// "Key/token assignment" has 4 capture groups (keyword, sep, quote, value) - keep everything
			// but the value; every other rule replaces its whole match.
			if (rule.re.source.startsWith("(api")) {
				out = out.replace(rule.re, (_m, kw, sep, q) => `${kw}${sep}${q}${REDACTED_VALUE}${q}`);
			} else if (rule.re.source.startsWith("(https?:\\/\\/)")) {
				out = out.replace(rule.re, (_m, scheme) => `${scheme}${REDACTED_VALUE}@`);
			} else {
				out = out.replace(rule.re, REDACTED_VALUE);
			}
		}
	}
	return { line: out, entries };
}

/** Append the `[FL-REDACTED:...]` tag to a G-code line that already had ≥1 redaction applied. */
function appendTag(line: string, ids: Array<number>): string {
	const tag = `${REDACTED_TAG_PREFIX}${ids.join(",")}]`;
	const commentAt = findCommentStart(line);
	if (commentAt === -1) {
		return `${line}    ; ${tag} sanitised by Flexible Layouts backup`;
	}
	return `${line} ${tag}`;
}

// --- Public: one G-code line -----------------------------------------------------------------------

/**
 * Redact (or, in "scan" mode, merely detect) sensitive parameters on a single G-code line. Returns the
 * (possibly unchanged) line and any redaction entries found. `path`/`lineNo` are stamped onto entries;
 * `nextId` assigns each entry a globally-unique id (called once per redaction, even in scan mode, so
 * ids stay stable regardless of mode).
 */
export function redactGcodeLine(
	line: string, mode: SanitiseMode, path: string, lineNo: number, nextId: () => number,
): { line: string; redactions: Array<RedactionEntry> } {
	const commentAt = findCommentStart(line);
	const code = commentAt === -1 ? line : line.slice(0, commentAt);
	const comment = commentAt === -1 ? "" : line.slice(commentAt);

	let newCode = code;
	const entries: Array<RedactionEntry> = [];

	// Tier 3: `set global.X = ...` / `var X = ...` assignments with a sensitive-looking name.
	const assignment = ASSIGNMENT_RE.exec(code);
	if (assignment) {
		const [, prefix, varName, value, rest] = assignment;
		if (SENSITIVE_NAME_RE.test(varName)) {
			const id = nextId();
			const pseudoCode = IS_GLOBAL_RE.test(code) ? "GLOBAL" : "VAR";
			entries.push({
				id, path, line: lineNo, tier: 3, kind: "gcode-command", code: pseudoCode, params: [varName],
				label: `Variable "${varName}"`, restoreHint: "credential",
			});
			if (mode === "redact") {
				const replacement = isQuoted(value) ? `"${REDACTED_VALUE}"` : REDACTED_VALUE;
				newCode = `${prefix}${replacement}${rest}`;
			}
		}
	} else {
		// Tier 1/2: a recognised M/G-code with sensitive parameters.
		const codeMatch = LEADING_CODE_RE.exec(code);
		const cmd = codeMatch ? codeMatch[1].toUpperCase() : undefined;
		const rules = cmd ? GCODE_PARAM_RULES[cmd] : undefined;
		if (rules) {
			const redactedParams: Array<string> = [];
			let minTier: RedactionTier = 2;
			const argsStart = codeMatch![0].length;
			const args = code.slice(argsStart);
			let rebuiltArgs = args;
			PARAM_TOKEN_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			const replacements: Array<{ start: number; end: number; text: string }> = [];
			while ((m = PARAM_TOKEN_RE.exec(args)) !== null) {
				const letter = m[1].toUpperCase();
				const rule = rules[letter];
				if (!rule) { continue; }
				redactedParams.push(letter);
				if (rule.tier < minTier) { minTier = rule.tier; }
				if (mode === "redact") {
					const value = m[2];
					const replacement = isQuoted(value) ? `"${REDACTED_VALUE}"` : REDACTED_VALUE;
					replacements.push({ start: m.index + m[1].length, end: m.index + m[0].length, text: replacement });
				}
			}
			if (redactedParams.length > 0) {
				const id = nextId();
				const label = redactedParams.length === 1
					? rules[redactedParams[0]].label
					: `${cmd} parameters (${redactedParams.join(", ")})`;
				entries.push({
					id, path, line: lineNo, tier: minTier, kind: "gcode-command", code: cmd,
					params: redactedParams, label, restoreHint: rules[redactedParams[0]].restoreHint,
				});
				if (mode === "redact" && replacements.length > 0) {
					// Apply back-to-front so earlier indices stay valid.
					for (const r of replacements.slice().reverse()) {
						rebuiltArgs = rebuiltArgs.slice(0, r.start) + r.text + rebuiltArgs.slice(r.end);
					}
					newCode = code.slice(0, argsStart) + rebuiltArgs;
				}
			}
		}
	}

	// Tier 4, applied to whatever remains after tier 1-3 (so already-redacted spans can't re-match).
	const tier4 = applyTier4ToLine(mode === "redact" ? newCode + comment : code + comment, mode, path, lineNo, nextId);
	entries.push(...tier4.entries);

	let finalLine: string;
	if (mode !== "redact") {
		finalLine = line;
	} else if (entries.length === 0) {
		finalLine = newCode + comment;
	} else {
		finalLine = appendTag(tier4.line, entries.map((e) => e.id));
	}
	return { line: finalLine, redactions: entries };
}

// --- Public: whole G-code / plain-text file -----------------------------------------------------

/** PEM private-key blocks span multiple lines; handled as a single whole-file pass before line splitting. */
function stripPemBlocks(
	text: string, mode: SanitiseMode, path: string, nextId: () => number,
): { text: string; entries: Array<RedactionEntry> } {
	const entries: Array<RedactionEntry> = [];
	PEM_BLOCK_RE.lastIndex = 0;
	if (!PEM_BLOCK_RE.test(text)) { return { text, entries }; }
	PEM_BLOCK_RE.lastIndex = 0;
	let out = text;
	if (mode === "redact") {
		out = text.replace(PEM_BLOCK_RE, () => {
			const id = nextId();
			const lineNo = out.slice(0, out.indexOf("-----BEGIN")).split("\n").length;
			entries.push({ id, path, line: lineNo, tier: 4, kind: "text-pattern", label: "Private key block", restoreHint: "credential" });
			return REDACTED_VALUE;
		});
	} else {
		let match: RegExpExecArray | null;
		PEM_BLOCK_RE.lastIndex = 0;
		while ((match = PEM_BLOCK_RE.exec(text)) !== null) {
			const id = nextId();
			const lineNo = text.slice(0, match.index).split("\n").length;
			entries.push({ id, path, line: lineNo, tier: 4, kind: "text-pattern", label: "Private key block", restoreHint: "credential" });
		}
	}
	return { text: out, entries };
}

/** Redact a `.g`/`.gcode` file: PEM pre-pass, then per-line command + tier-4 scanning. */
export function redactGcodeFile(text: string, mode: SanitiseMode, path: string, nextId: () => number): SanitiseFileResult {
	const pem = stripPemBlocks(text, mode, path, nextId);
	const lines = (mode === "redact" ? pem.text : text).split("\n");
	const allEntries: Array<RedactionEntry> = [...pem.entries];
	const outLines: Array<string> = [];
	lines.forEach((line, idx) => {
		const { line: newLine, redactions } = redactGcodeLine(line, mode, path, idx + 1, nextId);
		outLines.push(newLine);
		allEntries.push(...redactions);
	});
	return { content: mode === "redact" ? outLines.join("\n") : text, redactions: allEntries };
}

/** Redact a generic text file (not G-code, not JSON): PEM pre-pass + per-line tier-4 only, no tags. */
export function redactText(text: string, mode: SanitiseMode, path: string, nextId: () => number): SanitiseFileResult {
	const pem = stripPemBlocks(text, mode, path, nextId);
	const lines = (mode === "redact" ? pem.text : text).split("\n");
	const allEntries: Array<RedactionEntry> = [...pem.entries];
	const outLines: Array<string> = [];
	lines.forEach((line, idx) => {
		const { line: newLine, entries } = applyTier4ToLine(line, mode, path, idx + 1, nextId);
		outLines.push(newLine);
		allEntries.push(...entries);
	});
	return { content: mode === "redact" ? outLines.join("\n") : text, redactions: allEntries };
}

// --- Public: JSON files ----------------------------------------------------------------------------

function jsonPointerAppend(base: string, key: string | number): string {
	const seg = String(key).replace(/~/g, "~0").replace(/\//g, "~1");
	return `${base}/${seg}`;
}

function redactJsonValue(
	value: unknown, keyIsSensitive: boolean, pointer: string, mode: SanitiseMode, path: string, nextId: () => number, out: Array<RedactionEntry>,
): unknown {
	if (typeof value === "string") {
		// JSON redaction is KEY-NAME-ONLY (§3.3), not content-pattern scanning: `0:/sys/` JSON is
		// overwhelmingly installed plugins' own persisted config (FL's included), and scanning every
		// string value against the Tier-4 content patterns (email/JWT/webhook-URL/etc.) redacted
		// plenty of ordinary, non-secret plugin data by coincidence - a notification email, a webcam
		// URL, anything that happens to look vaguely credential-shaped. A field whose KEY is actually
		// named like a credential (password/token/secret/apiKey/psk/...) is a much stronger signal of
		// genuine login information, and that check applies everywhere a plugin might put one -
		// including Flexible Layouts' own JSON - so this still catches what matters without touching
		// everything else. (Tier-4 content-pattern scanning is unchanged for G-code and plain-text
		// files, where "plugin config JSON" isn't the domain.)
		if (keyIsSensitive) {
			out.push({ id: nextId(), path, tier: 3, kind: "json-value", pointer, label: `JSON value at ${pointer}`, restoreHint: "credential" });
			return mode === "redact" ? REDACTED_VALUE : value;
		}
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((v, i) => redactJsonValue(v, keyIsSensitive, jsonPointerAppend(pointer, i), mode, path, nextId, out));
	}
	if (value && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const sensitive = SENSITIVE_NAME_RE.test(k);
			result[k] = redactJsonValue(v, sensitive, jsonPointerAppend(pointer, k), mode, path, nextId, out);
		}
		return result;
	}
	return value;
}

/** Redact a `.json` file's sensitive-KEY-named values only (§3.3 - not Tier 4 content scanning, see
 * redactJsonValue). Malformed JSON is left untouched. */
export function redactJson(text: string, mode: SanitiseMode, path: string, nextId: () => number): SanitiseFileResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { content: text, redactions: [] };
	}
	const entries: Array<RedactionEntry> = [];
	const result = redactJsonValue(parsed, false, "", mode, path, nextId, entries);
	if (mode !== "redact" || entries.length === 0) {
		return { content: text, redactions: entries };
	}
	return { content: JSON.stringify(result, null, 2), redactions: entries };
}

// --- Public: M122 diagnostic output (Tier 5, §3.5) --------------------------------------------------

const M122_ID_LINE_RE = /^(\s*(?:Board ID|Unique ID):\s*).*$/gim;
const M122_AP_LINE_RE = /(connected to access point\s+).+$/gim;
const M122_LABELLED_MAC_RE = /(MAC address\s+)[0-9a-fA-F:.-]{11,}/gi;
const M122_LABELLED_IP_RE = /(IP address\s+)\d{1,3}(?:\.\d{1,3}){3}/gi;
const BARE_IPV4_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const BARE_MAC_RE = /\b(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}\b/g;

/**
 * Redact an M122 diagnostics dump (mainboard or `M122 B<n>`). Machine name / hostname is NOT
 * touched (user decision - RRF's M122 output doesn't print it anyway). Order matters: labelled
 * rules run first so the generic bare-IPv4/MAC sweeps have less to do, and the bare IPv4 sweep
 * requires four dot-separated groups so version strings like "3.7.0" (three groups) survive.
 */
export function redactM122(text: string, mode: SanitiseMode, path: string, nextId: () => number): SanitiseFileResult {
	const entries: Array<RedactionEntry> = [];
	const lineOf = (idx: number) => text.slice(0, idx).split("\n").length;

	// Rules in application order: labelled lines first, then the generic bare-token sweeps.
	const rules: Array<{ re: RegExp; label: string; replacer: (...groups: Array<string>) => string }> = [
		{ re: M122_ID_LINE_RE, label: "Board/Unique ID", replacer: (_m, p1) => `${p1}${REDACTED_VALUE}` },
		{ re: M122_AP_LINE_RE, label: "WiFi access point SSID", replacer: (_m, p1) => `${p1}${REDACTED_VALUE}` },
		{ re: M122_LABELLED_MAC_RE, label: "MAC address", replacer: (_m, p1) => `${p1}${REDACTED_VALUE}` },
		{ re: M122_LABELLED_IP_RE, label: "IP address", replacer: (_m, p1) => `${p1}${REDACTED_VALUE}` },
		{ re: BARE_IPV4_RE, label: "IPv4 literal", replacer: () => REDACTED_VALUE },
		{ re: BARE_MAC_RE, label: "MAC literal", replacer: () => REDACTED_VALUE },
	];

	let current = text;
	for (const rule of rules) {
		// Scan mode always matches against the original text (nothing is mutated); redact mode matches
		// against the progressively-redacted text so labelled rules consume their tokens before the
		// generic bare-IPv4/MAC sweeps run over what's left.
		const haystack = mode === "redact" ? current : text;
		rule.re.lastIndex = 0;
		let match: RegExpExecArray | null;
		let any = false;
		while ((match = rule.re.exec(haystack)) !== null) {
			any = true;
			entries.push({ id: nextId(), path, line: lineOf(match.index), tier: 5, kind: "m122-line", label: rule.label, restoreHint: "network" });
			if (match[0].length === 0) { rule.re.lastIndex++; }
		}
		if (mode === "redact" && any) {
			rule.re.lastIndex = 0;
			current = current.replace(rule.re, rule.replacer as (...args: Array<string>) => string);
		}
	}

	return { content: mode === "redact" ? current : text, redactions: entries };
}

// --- Public: dispatch by extension ------------------------------------------------------------------

function extensionOf(path: string): string {
	const dot = path.lastIndexOf(".");
	return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

/** Redact (or scan) one archived file's content, dispatching on its extension. */
export function sanitiseFile(path: string, content: string, mode: SanitiseMode, nextId: () => number): SanitiseFileResult {
	const ext = extensionOf(path);
	if (ext === "json") {
		return redactJson(content, mode, path, nextId);
	}
	if (ext === "g" || ext === "gcode") {
		return redactGcodeFile(content, mode, path, nextId);
	}
	return redactText(content, mode, path, nextId);
}
