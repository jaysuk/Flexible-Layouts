/**
 * Finds and rewrites every gcode reference to a CAN-connected expansion board's address, so changing
 * a board's address (M952) doesn't leave config.g/macros pointing at the old one.
 *
 * Verified against RRF's own Gcode Dictionary (Duet3D wiki-content), not guessed - a CAN address can
 * appear in gcode in exactly three syntactic shapes, and each is scoped to an explicit whitelist of
 * (command, parameter letter) pairs rather than matched wherever it looks similar. That scoping is not
 * defensive boilerplate - every one of these shapes has a real, confirmed collision with something
 * that means someting completely different on an unlisted command:
 *
 *  1. **Driver/device addressing**: `<letter><boardAddr>.<driverOrDeviceNumber>`, e.g. `M569 P121.0`,
 *     `M584 E3:4:121.0:121.1`. Scoped to DRIVER_ADDRESS_PARAMS below. `M569`'s own `B` parameter means
 *     "chopper blanking time", completely unrelated to CAN address - a command-blind replace of "Bn"
 *     anywhere would corrupt it (e.g. `M569 P121.0 B2` with old address 2 would rewrite the blanking
 *     time, not a CAN address).
 *  2. **Quoted port names**: `<letter>"<boardAddr>.<portname>"`, optionally `!`/`^`-prefixed inside the
 *     quotes, e.g. `M950 H1 C"121.out0"`, `M308 P"121.temp0"`. Scoped to PORT_NAME_PARAMS below -
 *     critically, a bare quoted string starting with digits and a dot is genuinely ambiguous with a
 *     FILENAME (`M32 "121.gcode"` is a completely ordinary, real command whose filename could
 *     coincidentally look identical to a port-name prefix), so this is NOT matched on every quoted
 *     string everywhere, only on the specific parameter letters confirmed to take a port name. Only
 *     the address at the very start of the quoted content is rewritten - a compound port string like
 *     `"1.out3+out3.tach"` carries the prefix once, applying to every `+`-joined segment (confirmed in
 *     the dictionary's own M950 fan/heater notes), not once per segment.
 *  3. **Explicit B parameter meaning "CAN address of a board"**: `M115 B121`, `M122 B121`,
 *     `M997 B121`, `M999 B121`, `M957 B121`. Scoped to exactly these five commands - confirmed by
 *     reading every "CAN address" mention in the dictionary; B means something else entirely on most
 *     other commands that happen to have one (M558's B0/B1 turns heaters off while probing, M569's B
 *     is blanking time, M140's B is a bed-heater index).
 *
 * A line whose command isn't in one of these whitelists is left completely alone for that shape -
 * under-matching a rare, unlisted command is a far safer failure mode than over-matching and silently
 * corrupting an unrelated parameter.
 */
import { splitComment } from "../../util/gcodeFilePatch";

/** Commands whose listed parameter letters carry `<boardAddr>.<driverOrDevice>` values. */
const DRIVER_ADDRESS_PARAMS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	["M569", new Set(["P"])],
	["M569.1", new Set(["P"])],
	["M569.2", new Set(["P"])],
	["M569.3", new Set(["P"])],
	["M569.4", new Set(["P"])],
	["M569.5", new Set(["P"])],
	["M569.6", new Set(["P"])],
	["M569.7", new Set(["P"])],
	["M584", new Set(["X", "Y", "Z", "U", "V", "W", "A", "B", "C", "D", "E"])],
	["M955", new Set(["P"])],
	["M956", new Set(["P"])],
]);

/** Commands whose listed parameter letters carry a quoted `<boardAddr>.<portname>` value. */
const PORT_NAME_PARAMS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	["M950", new Set(["C"])],
	["M308", new Set(["P"])],
	["M574", new Set(["P"])],
	["M558", new Set(["C"])],
	["M569.7", new Set(["C"])],
]);

/** Commands whose B parameter means "CAN address of a board" - everywhere else B means something
 *  else (M569's own B is chopper blanking time, M558's is "turn off heaters while probing"). */
const CAN_ADDRESS_B_COMMANDS: ReadonlySet<string> = new Set(["M115", "M122", "M997", "M999", "M957"]);

function extractCommandWord(code: string): string | null {
	const m = /^\s*([MG]\d+(?:\.\d+)?)\b/i.exec(code);
	return m ? m[1].toUpperCase() : null;
}

/** Within `code`, finds `<letter><value>` where `<value>` is a bare number or a colon-list of
 *  `board.driver` pairs (e.g. `X121.0:121.1`), and rewrites only the `oldAddr.` occurrences inside
 *  that value - never touching anything outside this exact parameter's own value span. */
function rewriteDriverParam(code: string, letter: string, oldAddr: number, newAddr: number): string {
	const re = new RegExp(`\\b(${letter})([0-9:.]+)`, "gi");
	return code.replace(re, (_full, letterMatch: string, value: string) => {
		const rewritten = value.replace(new RegExp(`\\b${oldAddr}\\.(\\d+)\\b`, "g"), `${newAddr}.$1`);
		return letterMatch + rewritten;
	});
}

/** Within `code`, finds `<letter>"<boardAddr>.<rest>"` (optionally `!`/`^`-prefixed inside the quotes)
 *  for the given parameter letter only, and rewrites the address if it matches `oldAddr`. Requires the
 *  literal dot right after the digits, so a quoted filename that happens to be all-digits is never
 *  touched even on a whitelisted letter. */
function rewritePortNameParam(code: string, letter: string, oldAddr: number, newAddr: number): string {
	const re = new RegExp(`(${letter})"([!^]?)(\\d+)\\.([^"]*)"`, "gi");
	return code.replace(re, (full: string, letterMatch: string, mod: string, addr: string, rest: string) => {
		if (parseInt(addr, 10) !== oldAddr) { return full; }
		return `${letterMatch}"${mod}${newAddr}.${rest}"`;
	});
}

/** Rewrites a bare `B<oldAddr>` parameter to `B<newAddr>` - only called for commands in
 *  CAN_ADDRESS_B_COMMANDS, where B is confirmed to mean "CAN address of a board". */
function rewriteBParam(code: string, oldAddr: number, newAddr: number): string {
	return code.replace(new RegExp(`\\b(B)${oldAddr}\\b`, "gi"), (_full, letterMatch: string) => `${letterMatch}${newAddr}`);
}

export interface CanAddressLineChange {
	line: number;
	before: string;
	after: string;
}

export interface CanAddressRewriteResult {
	text: string;
	changed: boolean;
	changedLines: Array<CanAddressLineChange>;
}

/** Scans one file's full text and rewrites every recognised reference to `oldAddr` as a CAN board
 *  address, leaving everything else - including any OTHER number that happens to equal `oldAddr` in
 *  an unrelated context, or on a command this module doesn't recognise - completely untouched. Pure
 *  and synchronous, safe to call for a preview. */
export function rewriteCanAddressReferences(text: string, oldAddr: number, newAddr: number): CanAddressRewriteResult {
	const lines = text.split(/\r?\n/);
	const changedLines: Array<CanAddressLineChange> = [];
	const newLines = lines.map((rawLine, idx) => {
		const { code, comment } = splitComment(rawLine);
		let newCode = code;
		const cmd = extractCommandWord(code);
		if (cmd) {
			const driverParams = DRIVER_ADDRESS_PARAMS.get(cmd);
			if (driverParams) {
				for (const letter of driverParams) { newCode = rewriteDriverParam(newCode, letter, oldAddr, newAddr); }
			}
			const portParams = PORT_NAME_PARAMS.get(cmd);
			if (portParams) {
				for (const letter of portParams) { newCode = rewritePortNameParam(newCode, letter, oldAddr, newAddr); }
			}
			if (CAN_ADDRESS_B_COMMANDS.has(cmd)) { newCode = rewriteBParam(newCode, oldAddr, newAddr); }
		}
		const newLine = newCode + comment;
		if (newLine !== rawLine) { changedLines.push({ line: idx + 1, before: rawLine, after: newLine }); }
		return newLine;
	});
	return { text: newLines.join("\n"), changed: changedLines.length > 0, changedLines };
}
