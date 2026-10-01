/**
 * User-defined counters: "count the seconds while THESE conditions are all true" - the idea behind the
 * Duet3D Maintenance Timers plugin's `conditions` list, built the way the rest of this feature is: the
 * accumulation runs in an RRF macro on the controller (see rulesMacro.ts), so it works on a standalone
 * Duet with no SBC and keeps counting with no browser open.
 *
 * A counter is a title plus a list of conditions, each an RRF expression that evaluates to true/false
 * (`state.status == "processing"`, `heat.heaters[0].current > 60`, `state.currentTool == 2`). Every poll
 * the macro adds the elapsed time to the counter while all conditions hold. A counter is a counter like
 * any other: a rule can measure it, a log entry can service it, and it has a baseline.
 *
 * Conditions are written into a macro that runs unattended, and an expression RRF rejects aborts that
 * macro every poll - so a condition is checked twice before it is saved: its syntax with the same
 * expression parser the G-code editor uses ({@link checkCondition}), and its value on the live machine
 * ({@link testConditionOnMachine}).
 */
import { parseExpression } from "dwc-gcode-core";
import type { MachineIO } from "dwc-config-backup-core";

import { CUSTOM_ID_RE } from "./counters";

export interface CustomCounter {
	/** Stable, never reused (`c1`, `c2`, ...): it names the RRF global that holds the value. */
	id: string;
	title: string;
	/** Every one must be true for time to accrue. */
	conditions: Array<string>;
}

export const MAX_CUSTOM_COUNTERS = 16;
export const MAX_CONDITIONS_PER_COUNTER = 6;
export const MAX_CONDITION_LENGTH = 200;

export type ConditionProblem =
	| "empty" | "multiline" | "tooLong" | "comment" | "syntax" | "unknownFunction"
	| "disallowedFunction" | "localVariable";

export type ConditionCheck = { ok: true; condition: string } | { ok: false; problem: ConditionProblem; detail?: string };

/** Functions that touch the SD card. A condition is evaluated every poll, so reading a file there is a
 *  cost nobody asked for - rejected, not merely discouraged. */
const DISALLOWED_FUNCTIONS = new Set(["fileread", "fileexists"]);

/** Syntax-checks one condition. Does not need a machine. */
export function checkCondition(text: string): ConditionCheck {
	const condition = text.trim();
	if (!condition) { return { ok: false, problem: "empty" }; }
	if (/[\r\n]/.test(condition)) { return { ok: false, problem: "multiline" }; }
	if (condition.length > MAX_CONDITION_LENGTH) { return { ok: false, problem: "tooLong" }; }
	// A ';' starts a comment in meta-gcode: it would swallow the rest of the generated line.
	if (condition.includes(";")) { return { ok: false, problem: "comment" }; }
	const parsed = parseExpression(condition);
	// Functions first: the parser also reports an unknown one as a generic error, and "unknown function
	// 'frobnicate'" is the more useful thing to tell someone than "unexpected token".
	for (const fn of parsed.functions) {
		if (DISALLOWED_FUNCTIONS.has(fn.name)) { return { ok: false, problem: "disallowedFunction", detail: fn.name }; }
		if (!fn.known) { return { ok: false, problem: "unknownFunction", detail: fn.name }; }
	}
	if (parsed.errors.length > 0) {
		return { ok: false, problem: "syntax", detail: parsed.errors[0].message };
	}
	// The generated macro has no `var.`/`param.` of its own for the user to refer to.
	if (parsed.variables.some((v) => v.scope !== "global")) { return { ok: false, problem: "localVariable" }; }
	return { ok: true, condition };
}

export type ConditionTestResult =
	| { ok: true; value: boolean }
	| { ok: false; message: string };

/** Evaluates the condition on the machine right now by echoing it - the only way to know it will not
 *  abort the macro (a missing object-model path, a tool that does not exist). Anything that is not a
 *  plain `true`/`false` is refused: a bare number would be a condition RRF cannot `if` on. */
export async function testConditionOnMachine(io: Pick<MachineIO, "sendCode">, condition: string): Promise<ConditionTestResult> {
	let reply: string;
	try {
		reply = String(await io.sendCode(`echo ${condition}`)).trim();
	} catch (e) {
		return { ok: false, message: e instanceof Error ? e.message : String(e) };
	}
	if (/^true$/i.test(reply)) { return { ok: true, value: true }; }
	if (/^false$/i.test(reply)) { return { ok: true, value: false }; }
	return { ok: false, message: reply || "no reply" };
}

/** Next unused id given the document's never-reused counter. */
export function customCounterIdFor(nextCustomId: number): string {
	return `c${nextCustomId}`;
}

export function isCustomCounter(v: unknown): v is CustomCounter {
	if (!v || typeof v !== "object") { return false; }
	const c = v as Partial<CustomCounter>;
	return typeof c.id === "string" && CUSTOM_ID_RE.test(c.id) && typeof c.title === "string"
		&& Array.isArray(c.conditions) && c.conditions.every((x) => typeof x === "string");
}
