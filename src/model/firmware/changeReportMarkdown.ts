/**
 * The firmware-changes report as Markdown, for "Copy report" (a forum post, a GitHub issue, a note to whoever maintains the machine).
 * Pure: the caller passes the report and the wording, so it is tested without i18n.
 */
import type { EventOccurrences, ImpactReport } from "dwc-gcode-core";

export interface ReportLabels {
	title: (from: string, to: string) => string;
	coverage: (checked: number, from: string, to: string, more: number) => string;
	changedIn: (version: string) => string;
	effect: (event: EventOccurrences["event"]) => string;
	sources: string;
	ignored: string;
	cannotCheck: string;
	noFindings: string;
}

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();
/** A code span whose content may itself contain backticks. */
const code = (s: string): string => (s.includes("`") ? `\`\` ${s} \`\`` : `\`${s}\``);

export function reportToMarkdown(report: ImpactReport, labels: ReportLabels): string {
	const out: Array<string> = [];
	out.push(`# ${labels.title(report.from, report.to)}`, "");
	out.push(labels.coverage(report.totals.eventsCheckable, report.from, report.to, report.totals.eventsUndetectable), "");

	if (report.byEvent.length === 0) {
		out.push(labels.noFindings, "");
	}
	for (const group of report.byEvent) {
		const e = group.event;
		out.push(`## ${oneLine(e.description)}`, "");
		out.push(`${labels.effect(e)} - ${labels.changedIn(e.version)} (\`${e.kind}\`)`, "");
		if (e.sources.length > 0) out.push(`${labels.sources}: ${e.sources.map(oneLine).join("; ")}`, "");
		for (const o of group.occurrences) out.push(`- ${o.path}:${o.line + 1}  ${code(o.snippet)}`);
		out.push("");
	}

	if (report.acknowledged.length > 0) {
		out.push(`## ${labels.ignored}`, "");
		for (const g of report.acknowledged) out.push(`- ${oneLine(g.event.description)} (${g.occurrences.length})`);
		out.push("");
	}
	if (report.undetectable.length > 0) {
		out.push(`## ${labels.cannotCheck}`, "");
		for (const e of report.undetectable) out.push(`- ${oneLine(e.description)} (${labels.changedIn(e.version)})`);
		out.push("");
	}
	return out.join("\n");
}
