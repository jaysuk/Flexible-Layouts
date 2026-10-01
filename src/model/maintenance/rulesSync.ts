/**
 * Brings the machine's generated macros (rulesMacro.ts) in line with the saved rules. Called whenever
 * something that feeds them changes: a rule or counter added/edited/removed, a service logged (a new
 * baseline moves every due value), or the macros redeployed.
 *
 * It never touches the static daemon/flush macros or the main state file. When nothing needs the
 * generated half any more it deletes those two files, and the daemon stops calling out on its own:
 * `flMaintCustomOn` is derived from the custom file existing.
 */
import type { MachineIO } from "dwc-config-backup-core";

import { resolveOmPath } from "../../util/omPath";
import type { MaintenanceRulesDoc } from "../reminders/rulesStore";
import { baselineForCounter, mostRecentEntryForCounter, type MaintenanceLog } from "./log";
import {
	MAINTENANCE_CUSTOM_FILE, MAINTENANCE_CUSTOM_FLUSH_FILE, MAINTENANCE_MACRO_FOLDER, maintenanceMacrosMissing,
	maintenanceMacrosOutdated,
} from "./macros";
import { generateCustomFlushMacro, generateCustomMacro, needsGeneratedMacros, planRules, type RulesMacroInput } from "./rulesMacro";

export type RulesSyncStatus =
	/** Generated files uploaded. */
	| "ok"
	/** Nothing needs them; any left over were removed. */
	| "notNeeded"
	/** Needed, but the maintenance macros are not deployed at all. */
	| "notSetUp"
	/** Needed, but the deployed daemon predates the hand-off (version < 11). */
	| "needsRedeploy"
	| "failed";

export interface RulesSyncResult {
	status: RulesSyncStatus;
	counters: number;
	/** Rules whose action the machine will run. */
	armed: number;
	/** Rules with an action the machine will NOT run yet, and why. */
	unarmed: Array<{ ruleId: string; reason: "noBaseline" | "badAction" | "badCounter" }>;
}

type SyncIO = Pick<MachineIO, "upload" | "downloadText" | "sendCode" | "deleteFile" | "getFileList">;

export function rulesMacroInput(doc: MaintenanceRulesDoc, log: MaintenanceLog): RulesMacroInput {
	return {
		customCounters: doc.customCounters,
		rules: doc.rules.map((rule) => {
			const entry = mostRecentEntryForCounter(log, rule.counter);
			return { rule, baseline: entry ? baselineForCounter(entry, rule.counter) : null };
		}),
	};
}

async function setCustomOn(io: Pick<MachineIO, "sendCode">, model: unknown, on: boolean): Promise<void> {
	// Only if the daemon has already declared it - `set` on an unknown global is an error. A daemon that
	// has not run yet declares it from the file's existence, which is what we just made true or false.
	if (resolveOmPath(model, "global.flMaintCustomOn") !== undefined) {
		await io.sendCode(`set global.flMaintCustomOn = ${on}`);
	}
}

export async function syncMaintenanceRules(args: { io: SyncIO; doc: MaintenanceRulesDoc; log: MaintenanceLog; model: unknown }): Promise<RulesSyncResult> {
	const { io, doc, log, model } = args;
	const input = rulesMacroInput(doc, log);
	const plan = planRules(input);
	const base = {
		counters: doc.customCounters.length,
		armed: plan.armed.length,
		unarmed: plan.unarmed.map((u) => ({ ruleId: u.rule.id, reason: u.reason })),
	};
	const customPath = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_CUSTOM_FILE}`;
	const flushPath = `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_CUSTOM_FLUSH_FILE}`;

	try {
		if (!needsGeneratedMacros(input)) {
			let present: Array<string> = [];
			try { present = (await io.getFileList(MAINTENANCE_MACRO_FOLDER)).map((f) => f.name); } catch { /* folder absent: nothing to remove */ }
			// The custom file first: that is the one the daemon keys off.
			for (const [name, path] of [[MAINTENANCE_CUSTOM_FILE, customPath], [MAINTENANCE_CUSTOM_FLUSH_FILE, flushPath]] as const) {
				if (present.includes(name)) { await io.deleteFile(path); }
			}
			await setCustomOn(io, model, false);
			return { status: "notNeeded", ...base };
		}

		if (await maintenanceMacrosMissing(io)) { return { status: "notSetUp", ...base }; }
		if (await maintenanceMacrosOutdated(io)) { return { status: "needsRedeploy", ...base }; }

		// Flush file first: the custom macro's rule block calls the main flush, which calls this one.
		await io.upload(flushPath, new Blob([generateCustomFlushMacro(input)], { type: "text/plain" }));
		await io.upload(customPath, new Blob([generateCustomMacro(input)], { type: "text/plain" }));
		await setCustomOn(io, model, true);
		return { status: "ok", ...base };
	} catch {
		return { status: "failed", ...base };
	}
}
