/**
 * PURE redacted-value repair, run during restore between file selection and review (§6 Phase 4,
 * "Repairing redacted values on restore"). A redacted archive must not push a broken config onto a
 * machine - `M587 S"[REDACTED]"` would join a network that doesn't exist, `M552 P"[REDACTED]"` isn't
 * a valid IP, `M551 P"[REDACTED]"` would silently SET the machine password to the literal string
 * "[REDACTED]". Every site here must be resolved (or explicitly comment-out/omit-key'd) before
 * applyRestorePlan will upload the file - it re-scans for the sentinel immediately before upload as a
 * backstop regardless of what happens here.
 */
import { REDACTED_TAG_RE, REDACTED_VALUE } from "./constants";
import { parseAssignmentLine, parseGcodeLine } from "./sanitise";
import type { ParsedArchive, RedactionEntry, RedactionSite, RepairAction } from "./types";

// --- Locating sites in the CURRENT archive text ------------------------------------------------------

function pointerSegments(pointer: string): Array<string> {
	return pointer.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function getByPointer(obj: unknown, pointer: string): unknown {
	let cur: unknown = obj;
	for (const seg of pointerSegments(pointer)) {
		if (cur == null) { return undefined; }
		cur = Array.isArray(cur) ? cur[Number(seg)] : (cur as Record<string, unknown>)[seg];
	}
	return cur;
}

/**
 * Find every still-unresolved redaction among the selected files. The tag (or, for JSON, the pointer)
 * is the authority - this reconciles against `redactions.json` by id rather than trusting it blindly,
 * so a hand-edited archive or a missing/stale redactions.json still surfaces its sites correctly.
 * `diagnostics/**` / `object-model.json` entries never appear here: restore never touches those paths.
 */
export function findRedactions(archive: ParsedArchive, selection: ReadonlySet<string>): Array<RedactionSite> {
	const sites: Array<RedactionSite> = [];
	const byPath = new Map<string, Array<RedactionEntry>>();
	for (const e of archive.redactions.entries) {
		if (e.kind === "m122-line") { continue; } // diagnostics/** is excluded from restore entirely
		if (!selection.has(e.path)) { continue; }
		if (!byPath.has(e.path)) { byPath.set(e.path, []); }
		byPath.get(e.path)!.push(e);
	}

	for (const [path, entries] of byPath) {
		if (path.endsWith(".json")) {
			let parsed: unknown;
			try { parsed = JSON.parse(archive.textFiles.get(path) ?? "{}"); } catch { parsed = undefined; }
			for (const entry of entries) {
				const value = entry.pointer != null ? getByPointer(parsed, entry.pointer) : undefined;
				if (value === REDACTED_VALUE) {
					sites.push({ entry, locatable: true });
				} else if (value === undefined) {
					sites.push({ entry, locatable: false }); // pointer no longer resolves - can't auto-repair
				}
				// any other current value means the site is already resolved (e.g. hand-edited) - omit it
			}
			continue;
		}

		const text = archive.textFiles.get(path) ?? "";
		const lines = text.split("\n");
		const idToLine = new Map<number, number>();
		lines.forEach((line, idx) => {
			const m = REDACTED_TAG_RE.exec(line);
			REDACTED_TAG_RE.lastIndex = 0;
			if (m) {
				for (const idStr of m[1].split(",")) { idToLine.set(Number(idStr), idx); }
			}
		});
		for (const entry of entries) {
			const lineIndex = idToLine.get(entry.id);
			if (lineIndex != null) {
				sites.push({ entry, locatable: true, lineIndex, currentLine: lines[lineIndex] });
			} else if (text.includes(REDACTED_VALUE)) {
				// Tag missing (hand-edited file) but the sentinel is still present somewhere - flag as
				// unlocatable so the UI falls back to a manual "enter value" / whole-file review.
				sites.push({ entry, locatable: false });
			}
			// If neither the tag nor any "[REDACTED]" text remains, the user already resolved this
			// site by some other means - nothing to surface.
		}
	}
	return sites;
}

// --- Suggesting a value from the live machine's current file -----------------------------------------

export type SuggestResult =
	| { status: "found"; values: Record<string, string> }
	| { status: "none" }
	| { status: "ambiguous"; candidates: Array<Record<string, string>> };

function candidatesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function dedupe(candidates: Array<Record<string, string>>): Array<Record<string, string>> {
	const out: Array<Record<string, string>> = [];
	for (const c of candidates) {
		if (!out.some((o) => candidatesEqual(o, c))) { out.push(c); }
	}
	return out;
}

/**
 * Look for the same command+parameter(s) (or variable assignment) in the LIVE machine's current file
 * at the same path, so e.g. restoring config.g to a machine already on the WiFi recovers its real
 * SSID/PSK with no typing. Only resolves when exactly one distinct candidate exists; two differing
 * matches (e.g. two `M587` lines) come back "ambiguous" rather than guessing.
 */
export function suggestFromLive(entry: RedactionEntry, liveFileText: string): SuggestResult {
	const lines = liveFileText.split("\n");
	const candidates: Array<Record<string, string>> = [];

	if (entry.code === "GLOBAL" || entry.code === "VAR") {
		const varName = entry.params?.[0];
		if (!varName) { return { status: "none" }; }
		for (const line of lines) {
			const parsed = parseAssignmentLine(line);
			if (parsed && parsed.varName === varName && parsed.isGlobal === (entry.code === "GLOBAL")) {
				candidates.push({ [varName]: parsed.value });
			}
		}
	} else if (entry.code) {
		const wanted = entry.params ?? [];
		if (wanted.length === 0) { return { status: "none" }; }
		for (const line of lines) {
			const parsed = parseGcodeLine(line);
			if (parsed.code !== entry.code) { continue; }
			if (wanted.every((p) => p in parsed.params)) {
				const values: Record<string, string> = {};
				for (const p of wanted) { values[p] = parsed.params[p]; }
				candidates.push(values);
			}
		}
	} else {
		return { status: "none" }; // json-value / text-pattern: no live command structure to search for
	}

	const unique = dedupe(candidates);
	if (unique.length === 0) { return { status: "none" }; }
	if (unique.length === 1) { return { status: "found", values: unique[0] }; }
	return { status: "ambiguous", candidates: unique };
}

// --- Validation for manually-entered values -----------------------------------------------------------

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const MAC_RE = /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;

/** Returns an error message if `value` doesn't fit the shape expected for this entry, else null. */
export function validateEnteredValue(entry: RedactionEntry, param: string, value: string): string | null {
	if (value.trim().length === 0) { return "A value is required."; }
	if (value === REDACTED_VALUE) { return "Enter the real value, not the placeholder."; }
	if (entry.code === "M540") { return MAC_RE.test(value) ? null : "Expected a MAC address, e.g. aa:bb:cc:dd:ee:ff."; }
	if ((entry.code === "M552" || entry.code === "M553" || entry.code === "M554") && param === "P") {
		return IPV4_RE.test(value) ? null : "Expected an IPv4 address, e.g. 192.168.1.50.";
	}
	if (entry.code === "M587" && (param === "I" || param === "J" || param === "K" || param === "L")) {
		return IPV4_RE.test(value) ? null : "Expected an IPv4 address.";
	}
	return null;
}

// --- Applying decisions (pure text transforms) ---------------------------------------------------

const TAG_AND_BOILERPLATE_RE = /\s*\[FL-REDACTED:[\d,]+\]( sanitised by Flexible Layouts backup)?/;

function stripTag(line: string): string {
	const withoutTag = line.replace(TAG_AND_BOILERPLATE_RE, "");
	// A trailing bare "; " left over once the synthetic tag comment is gone is noise - drop it. A
	// genuine pre-existing user comment (anything after the tag) is left exactly as it was.
	return withoutTag.replace(/\s+;\s*$/, "");
}

function applyLineRepair(line: string, entry: RedactionEntry, action: RepairAction): string {
	const stripped = stripTag(line);
	if (action.type === "comment-out") {
		return `; ${stripped}  ; value not available at restore - re-enter with ${entry.code ?? "the original command"}`;
	}
	if (action.type === "omit-key") {
		return stripped; // not a valid action for gcode lines; treated as a no-op safety fallback
	}
	let result = stripped;
	if (entry.code === "GLOBAL" || entry.code === "VAR") {
		const varName = entry.params?.[0];
		const value = varName ? action.values[varName] : undefined;
		if (value != null) {
			result = result.replace(/=(\s*)("(?:[^"]|"")*"|\S+)/, (_m, sp: string, captured: string) => {
				const wasQuoted = captured.length >= 2 && captured[0] === "\"" && captured[captured.length - 1] === "\"";
				return `=${sp}${wasQuoted ? `"${value.replace(/"/g, "\"\"")}"` : value}`;
			});
		}
	} else {
		for (const p of entry.params ?? []) {
			const value = action.values[p];
			if (value == null) { continue; }
			const re = new RegExp(`\\b${p}("(?:[^"]|"")*"|\\S+)`, "i");
			result = result.replace(re, (_m, captured: string) => {
				const wasQuoted = captured.length >= 2 && captured[0] === "\"" && captured[captured.length - 1] === "\"";
				return `${p}${wasQuoted ? `"${value.replace(/"/g, "\"\"")}"` : value}`;
			});
		}
	}
	return result;
}

/** Repair every gcode-command site in one G-code family file's text. */
export function applyGcodeRepairs(fileText: string, sites: ReadonlyArray<RedactionSite>, decisions: ReadonlyMap<number, RepairAction>): string {
	const lines = fileText.split("\n");
	for (const site of sites) {
		if (!site.locatable || site.lineIndex == null || site.entry.kind !== "gcode-command") { continue; }
		const action = decisions.get(site.entry.id);
		if (!action) { continue; }
		lines[site.lineIndex] = applyLineRepair(lines[site.lineIndex], site.entry, action);
	}
	return lines.join("\n");
}

function setByPointer(obj: Record<string, unknown>, pointer: string, value: unknown): void {
	const segs = pointerSegments(pointer);
	let cur: any = obj; // eslint-disable-line @typescript-eslint/no-explicit-any
	for (let i = 0; i < segs.length - 1; i++) { cur = Array.isArray(cur) ? cur[Number(segs[i])] : cur[segs[i]]; }
	const last = segs[segs.length - 1];
	if (Array.isArray(cur)) { cur[Number(last)] = value; } else { cur[last] = value; }
}

function deleteByPointer(obj: Record<string, unknown>, pointer: string): void {
	const segs = pointerSegments(pointer);
	let cur: any = obj; // eslint-disable-line @typescript-eslint/no-explicit-any
	for (let i = 0; i < segs.length - 1; i++) { cur = Array.isArray(cur) ? cur[Number(segs[i])] : cur[segs[i]]; }
	const last = segs[segs.length - 1];
	if (Array.isArray(cur)) { cur.splice(Number(last), 1); } else { delete cur[last]; }
}

/** Repair every json-value site in one JSON file's text. "comment-out" is invalid JSON syntax and is
 * never offered by the UI for JSON sites; if somehow chosen here it's treated as a no-op. */
export function applyJsonRepairs(jsonText: string, sites: ReadonlyArray<RedactionSite>, decisions: ReadonlyMap<number, RepairAction>): string {
	let parsed: unknown;
	try { parsed = JSON.parse(jsonText); } catch { return jsonText; }
	for (const site of sites) {
		if (site.entry.kind !== "json-value" || !site.entry.pointer) { continue; }
		const action = decisions.get(site.entry.id);
		if (!action) { continue; }
		if (action.type === "omit-key") { deleteByPointer(parsed as Record<string, unknown>, site.entry.pointer); continue; }
		if (action.type === "comment-out") { continue; }
		const value = action.values.value;
		if (value != null) { setByPointer(parsed as Record<string, unknown>, site.entry.pointer, value); }
	}
	return JSON.stringify(parsed, null, 2);
}

/** Repair every text-pattern site (untagged, Tier-4-only files) by replacing "[REDACTED]" occurrences
 * left-to-right, in the same order sites were recorded (matching the order they were redacted in). */
export function applyTextPatternRepairs(text: string, sites: ReadonlyArray<RedactionSite>, decisions: ReadonlyMap<number, RepairAction>): string {
	let result = text;
	for (const site of sites) {
		if (site.entry.kind !== "text-pattern" || site.entry.pointer) { continue; } // pointer -> JSON, handled above
		const action = decisions.get(site.entry.id);
		if (!action || (action.type !== "enter-value" && action.type !== "keep-live")) { continue; }
		const value = action.values.value;
		if (value == null) { continue; }
		result = result.replace(REDACTED_VALUE, value);
	}
	return result;
}

/** Dispatch to the right repair function for one file, by extension and the sites' own kinds. */
export function applyRepairsToFile(path: string, originalText: string, sites: ReadonlyArray<RedactionSite>, decisions: ReadonlyMap<number, RepairAction>): string {
	if (path.endsWith(".json")) {
		return applyJsonRepairs(originalText, sites, decisions);
	}
	let result = applyGcodeRepairs(originalText, sites, decisions);
	result = applyTextPatternRepairs(result, sites, decisions);
	return result;
}
