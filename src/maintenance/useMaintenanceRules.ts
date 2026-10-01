/**
 * The Maintenance page's view of the saved rules and user counters: loads them from the machine, applies
 * a change (access check -> read-modify-write of the rules file -> regenerate the machine-side macros),
 * and remembers how the last sync went so the page can say whether the machine will act on its own.
 *
 * One instance per page, handed to the panels as a prop, so the rules list, the counters list and the
 * "log a service" form all work from the same document and the same log.
 */
import { reactive, ref } from "vue";

import { useMachineStore } from "@/stores/machine";

import { can, requestAdmin } from "../model/access";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import type { MaintenanceLog } from "../model/maintenance/log";
import { syncMaintenanceRules, type RulesSyncResult } from "../model/maintenance/rulesSync";
import {
	emptyRulesDoc, loadMaintenanceRules, updateMaintenanceRules, type MaintenanceRulesDoc, type RulesIntegrity, type RulesSource,
} from "../model/reminders/rulesStore";

export type RulesChangeResult = "written" | "failed" | "blocked" | "denied";

/** Plain-typed view (the composable returns a `reactive`, so a template reads `state.doc`, not
 *  `state.doc.value`, even when the state is handed down as a prop). */
export interface MaintenanceRulesState {
	doc: MaintenanceRulesDoc;
	/** "cache" = the machine's rules file could not be read; changes are refused until it can be. */
	source: RulesSource;
	integrity: RulesIntegrity;
	/** Outcome of the most recent sync of the generated macros; null until one has run. */
	sync: RulesSyncResult | null;
	busy: boolean;
	reload(): Promise<void>;
	/** Applies `change` to the machine's current rules, saves, and resyncs the macros. */
	change(change: (doc: MaintenanceRulesDoc) => MaintenanceRulesDoc): Promise<RulesChangeResult>;
	/** Regenerates the machine-side macros from the current rules and log - call after anything that
	 *  moves a baseline (a logged service). */
	resync(): Promise<void>;
}

export function useMaintenanceRules(getLog: () => MaintenanceLog): MaintenanceRulesState {
	const machineStore = useMachineStore();
	const doc = ref<MaintenanceRulesDoc>(emptyRulesDoc());
	const source = ref<RulesSource>("machine");
	const integrity = ref<RulesIntegrity>("none");
	const sync = ref<RulesSyncResult | null>(null);
	const busy = ref(false);

	/** The load in progress, if any. A resync has to wait for it: syncing against the not-yet-loaded
	 *  (empty) document would conclude "nothing needs the generated macros" and DELETE them. */
	let loading: Promise<void> | null = null;

	function reload(): Promise<void> {
		loading = (async () => {
			const loaded = await loadMaintenanceRules();
			doc.value = loaded.doc;
			source.value = loaded.source;
			integrity.value = loaded.integrity;
		})();
		return loading;
	}

	async function resync(): Promise<void> {
		// Never synced from a document that was not read: no load started means nothing to go on either.
		if (!loading) { return; }
		try { await loading; } catch { return; }
		if (!machineStore.isConnected || source.value === "cache") { return; }
		sync.value = await syncMaintenanceRules({ io: defaultMachineIO(), doc: doc.value, log: getLog(), model: machineStore.model });
	}

	async function change(fn: (d: MaintenanceRulesDoc) => MaintenanceRulesDoc): Promise<RulesChangeResult> {
		if (!can("editConfig") && !(await requestAdmin())) { return "denied"; }
		busy.value = true;
		try {
			const { result, doc: next } = await updateMaintenanceRules(fn);
			if (result !== "written" || !next) {
				if (result === "blocked") { integrity.value = "mismatch"; }
				return result;
			}
			doc.value = next;
			source.value = "machine";
			integrity.value = "ok";
			await resync();
			return "written";
		} finally {
			busy.value = false;
		}
	}

	return reactive({ doc, source, integrity, sync, busy, reload, change, resync }) as MaintenanceRulesState;
}
