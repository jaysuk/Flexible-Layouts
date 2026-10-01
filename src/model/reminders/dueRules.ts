/**
 * Evaluates every rule against the live model and the maintenance log: "since last service" is the
 * counter's live value minus its baseline in the most recent entry that services it (the subtraction
 * model in log.ts), compared with the rule's interval. Shared by the connect nudge, the widget badge and
 * the Maintenance page so they can never disagree about what is due.
 */
import { liveCounterValue } from "../maintenance/counters";
import { baselineForCounter, mostRecentEntryForCounter, secondsSince, type MaintenanceLog } from "../maintenance/log";
import { computeDueStatus, type DueStatus } from "./dueStatus";
import type { MaintenanceIntervalRule } from "./storage";

export interface RuleEvaluation {
	rule: MaintenanceIntervalRule;
	live: number | null;
	/** Live value minus the baseline, in the counter's own unit; null when either is unknown. */
	delta: number | null;
	status: DueStatus;
}

export function evaluateRules(rules: ReadonlyArray<MaintenanceIntervalRule>, log: MaintenanceLog, model: unknown): Array<RuleEvaluation> {
	return rules.map((rule) => {
		const live = liveCounterValue(model, rule.counter);
		const entry = mostRecentEntryForCounter(log, rule.counter);
		const baseline = entry ? baselineForCounter(entry, rule.counter) : null;
		const delta = secondsSince(live, baseline);
		return { rule, live, delta, status: computeDueStatus(delta, rule.intervalValue) };
	});
}

export function isDue(status: DueStatus): boolean {
	return status === "dueSoon" || status === "overdue";
}
