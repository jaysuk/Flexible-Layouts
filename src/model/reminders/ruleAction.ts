/**
 * Validation for a rule's machine-side action: one G/M/T-code line that the generated macro runs when
 * the rule comes due. Same contract as the Duet3D Maintenance Timers plugin's `action` field ("G/M/T-code
 * to perform when the threshold is reached"), checked here because the text is written verbatim into a
 * macro file that runs unattended on the controller.
 */

export type RuleActionProblem = "empty" | "multiline" | "tooLong" | "notGcode";

export type RuleActionCheck =
	| { ok: true; action: string }
	| { ok: false; problem: RuleActionProblem };

export const MAX_RULE_ACTION_LENGTH = 200;

/** `M291 P"Grease the ways" R"Service due" S1` is the intended shape: a message box that does not
 *  block. (S1 is RRF's default and is non-blocking; S2/S3 wait for a button press, which would stall the
 *  daemon macro until someone answers.) */
const GCODE_START_RE = /^[GMT]\d+(\.\d+)?(\s|$)/i;

export function checkRuleAction(text: string): RuleActionCheck {
	if (/[\r\n]/.test(text.trim())) { return { ok: false, problem: "multiline" }; }
	const action = text.trim();
	if (!action) { return { ok: false, problem: "empty" }; }
	if (action.length > MAX_RULE_ACTION_LENGTH) { return { ok: false, problem: "tooLong" }; }
	if (!GCODE_START_RE.test(action)) { return { ok: false, problem: "notGcode" }; }
	return { ok: true, action };
}
