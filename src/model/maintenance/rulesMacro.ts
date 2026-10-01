/**
 * Generates the machine-side half of the maintenance feature from the saved rules - pure string
 * building, no I/O (rulesSync.ts uploads the result), so it can be tested without a machine.
 *
 * Two files, both called from the static daemon/flush macros (macros.ts, v11) only while the generated
 * file exists:
 *
 *  - `maintenance-custom.g` - run by the daemon on every poll:
 *      1. once per boot, reloads the persisted values of everything below from a state file of its own;
 *      2. for each USER COUNTER, adds the poll interval (`global.flMaintDt`) while every one of its
 *         conditions is true;
 *      3. for each armed SERVICE RULE with an action, runs that one G/M/T-code line the first time the
 *         counter reaches the rule's due value - with no browser open.
 *  - `maintenance-custom-flush.g` - writes the user counters' values and the rules' "already fired"
 *      markers out so they survive a reboot. Every write is guarded by `exists`, because the flush can
 *      run before a counter added a moment ago has been seeded by the first file.
 *
 * WHY THE DUE VALUE IS A LITERAL. The browser knows each rule's baseline (the counter's value at the
 * last logged service, from the log) but the machine does not. So the baseline is folded in when the
 * file is generated: due = baseline + interval, written as a number. Logging a service, or editing a
 * rule, regenerates the file (rulesSync.ts). The "fired" marker stores the due value that last fired;
 * the rule fires when `fired != due`, so a new baseline (a new due value) re-arms it without any reset
 * step, and a reboot between firing and the next flush cannot make it fire twice (the marker is flushed
 * the moment it is set).
 *
 * A rule with no baseline (no service logged for that counter yet) is NOT armed: measuring "since
 * service" from nothing would fire an action on a machine that has simply been running for a while,
 * the moment the rule is created. The UI says so.
 */
import { counterExpression, customCounterGlobalName } from "./counters";
import { checkCondition, type CustomCounter } from "./customCounters";
import {
	MAINTENANCE_CUSTOM_STATE_PATH, MAINTENANCE_FLUSH_FILE, MAINTENANCE_MACRO_FOLDER, MAINTENANCE_MACRO_SET_VERSION,
} from "./macros";
import { checkRuleAction } from "../reminders/ruleAction";
import type { MaintenanceIntervalRule } from "../reminders/storage";

export interface RuleWithBaseline {
	rule: MaintenanceIntervalRule;
	/** The counter's value at the most recent service that covers it, or null if unknown. */
	baseline: number | null;
}

export interface RulesMacroInput {
	customCounters: ReadonlyArray<CustomCounter>;
	rules: ReadonlyArray<RuleWithBaseline>;
}

/** A rule the generated macro will act on: enabled, has a valid action, a readable counter, a baseline. */
export interface ArmedRule {
	rule: MaintenanceIntervalRule;
	action: string;
	expression: string;
	due: number;
	firedGlobal: string;
}

export function ruleFiredGlobalName(ruleId: string): string {
	return `flMaintR${ruleId.replace(/[^A-Za-z0-9]/g, "")}Fired`;
}

/** What the macro will act on, and what it will not and why - the UI reports the second list. */
export function planRules(input: RulesMacroInput): { armed: Array<ArmedRule>; unarmed: Array<{ rule: MaintenanceIntervalRule; reason: "noBaseline" | "badAction" | "badCounter" }> } {
	const armed: Array<ArmedRule> = [];
	const unarmed: Array<{ rule: MaintenanceIntervalRule; reason: "noBaseline" | "badAction" | "badCounter" }> = [];
	for (const { rule, baseline } of input.rules) {
		if (!rule.enabled || !rule.action) { continue; }
		const check = checkRuleAction(rule.action);
		if (!check.ok) { unarmed.push({ rule, reason: "badAction" }); continue; }
		const expression = counterExpression(rule.counter);
		if (!expression || !(rule.intervalValue > 0)) { unarmed.push({ rule, reason: "badCounter" }); continue; }
		if (baseline == null) { unarmed.push({ rule, reason: "noBaseline" }); continue; }
		// Whole numbers only: the fired marker is round-tripped through text, and a fractional literal
		// would not necessarily come back identical (which would fire a second time after a reboot).
		armed.push({ rule, action: check.action, expression, due: Math.ceil(baseline + rule.intervalValue), firedGlobal: ruleFiredGlobalName(rule.id) });
	}
	return { armed, unarmed };
}

/** Counters whose conditions all pass the syntax check; one with none valid is seeded but never counts
 *  (counting with no condition would mean counting always). */
function activeCounters(input: RulesMacroInput): Array<{ counter: CustomCounter; conditions: Array<string> }> {
	return input.customCounters.map((counter) => ({
		counter,
		conditions: counter.conditions.map(checkCondition).flatMap((c) => (c.ok ? [c.condition] : [])),
	}));
}

/** Whether the generated files are needed at all - when not, rulesSync.ts removes them and the daemon
 *  stops calling out (flMaintCustomOn is derived from the file existing). */
export function needsGeneratedMacros(input: RulesMacroInput): boolean {
	return input.customCounters.length > 0 || planRules(input).armed.length > 0;
}

function comment(text: string): string {
	return text.replace(/[\r\n\t]+/g, " ").slice(0, 80);
}

function header(title: string): string {
	return `; ${title}
; FL-MAINTENANCE-MACRO-VERSION: ${MAINTENANCE_MACRO_SET_VERSION}
; GENERATED by Flexible Layouts from the Maintenance page - changes made here are overwritten the next
; time a rule, a counter or a service entry changes. Edit them on the Maintenance page instead.

`;
}

export function generateCustomMacro(input: RulesMacroInput): string {
	const counters = activeCounters(input);
	const { armed } = planRules(input);
	const flush = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_FLUSH_FILE}`;

	const lines: Array<string> = [header("maintenance-custom.g - user counters and service-rule actions")];

	lines.push(`; Reload what was last flushed - once per boot (the globals themselves live only in RAM).
if !exists(global.flMaintCustomLoaded)
	global flMaintCustomLoaded = true
	if fileexists("${MAINTENANCE_CUSTOM_STATE_PATH}")
		M98 P"${MAINTENANCE_CUSTOM_STATE_PATH}"
`);

	for (const { counter, conditions } of counters) {
		const name = customCounterGlobalName(counter.id);
		lines.push(`; Counter ${counter.id}: ${comment(counter.title)}
if !exists(global.${name})
	global ${name} = 0
`);
		if (conditions.length > 0) {
			// Each condition is parenthesised so an `||` inside one cannot change how the others combine.
			lines.push(`if ${conditions.map((c) => `(${c})`).join(" && ")}
	set global.${name} = global.${name} + global.flMaintDt
`);
		}
	}

	for (const a of armed) {
		const idle = a.rule.actionWhenIdle === false ? "" : ` && state.status == "idle"`;
		lines.push(`; Rule: ${comment(a.rule.label)} - runs once when ${a.expression} reaches ${a.due}${idle ? ", and only while idle" : ""}.
; The marker is set (and flushed) BEFORE the action so an action that fails cannot repeat every poll.
if !exists(global.${a.firedGlobal})
	global ${a.firedGlobal} = -1
if ${a.expression} >= ${a.due} && global.${a.firedGlobal} != ${a.due}${idle}
	set global.${a.firedGlobal} = ${a.due}
	M98 P"${flush}"
	${a.action}
`);
	}

	return lines.join("\n");
}

export function generateCustomFlushMacro(input: RulesMacroInput): string {
	const counters = activeCounters(input);
	const { armed } = planRules(input);
	const state = MAINTENANCE_CUSTOM_STATE_PATH;
	const names = [...counters.map(({ counter }) => customCounterGlobalName(counter.id)), ...armed.map((a) => a.firedGlobal)];

	const lines: Array<string> = [header("maintenance-custom-flush.g - persists the user counters and rule markers")];
	lines.push(`echo >"${state}" "; Auto-generated by Flexible Layouts - do not edit by hand"\n`);
	for (const name of names) {
		lines.push(`if exists(global.${name})
	echo >>"${state}" "if !exists(global.${name})"
	echo >>"${state}" "  global ${name} = " ^ global.${name}
	echo >>"${state}" "else"
	echo >>"${state}" "  set global.${name} = " ^ global.${name}
`);
	}
	return lines.join("\n");
}
