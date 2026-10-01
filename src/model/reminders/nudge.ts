/**
 * Service-interval reminders (Item H): a one-click toast per connect when an enabled rule is due or
 * overdue, mirroring certExpiryNudge.ts's exact install/uninstall lifecycle - never an automatic
 * action, wired into index.ts the same way. Unlike certExpiryNudge (a purely browser-local check),
 * this one needs the maintenance LOG too (to find each rule's baseline via Item D's
 * mostRecentEntryForCounter/baselineForCounter), so the connect-check itself is async.
 *
 * The rules come from the machine (rulesStore.ts), so a rule set up in one browser is also the one
 * another browser nudges about. A rule's optional ACTION is not run from here: that is the machine's
 * job (rulesMacro.ts), and it happens with no browser open - this toast is only the browser's side.
 * The same toast also covers the Duet3D Maintenance Timers plugin's timers when it is installed.
 */
import { watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

import { MAINTENANCE_ROUTE_PATH } from "../maintenance/constants";
import { readMaintenanceLog } from "../maintenance/log";
import { pluginTimerReached, readPluginTimers } from "../maintenance/pluginTimers";
import { evaluateRules } from "./dueRules";
import { loadMaintenanceRules } from "./rulesStore";

let stopConnectWatch: (() => void) | null = null;
let checkedThisSession = false;

export function installMaintenanceReminderNudge(): void {
	const uiStore = useUiStore();
	const machineStore = useMachineStore();

	async function checkOnConnect(): Promise<void> {
		if (!machineStore.isConnected || checkedThisSession) { return; }
		checkedThisSession = true;

		const rules = (await loadMaintenanceRules()).doc.rules.filter((r) => r.enabled);
		const log = rules.length ? await readMaintenanceLog() : null;

		// Read AFTER the awaits above: DWC loads the plugin list a moment after it connects, and the
		// plugin's timers are part of it.
		for (const timer of (readPluginTimers(machineStore.model) ?? []).filter(pluginTimerReached)) {
			uiStore.log(
				LogLevel.warning,
				i18n.global.t("plugins.flexibleLayouts.maintenance.reminders.title"),
				i18n.global.t("plugins.flexibleLayouts.maintenance.reminders.pluginTimerBody", { label: timer.title }),
				MAINTENANCE_ROUTE_PATH,
			);
		}

		if (!log) { return; }
		for (const { rule, status } of evaluateRules(rules, log, machineStore.model)) {
			if (status !== "overdue" && status !== "dueSoon") { continue; }
			uiStore.log(
				status === "overdue" ? LogLevel.warning : LogLevel.info,
				i18n.global.t("plugins.flexibleLayouts.maintenance.reminders.title"),
				i18n.global.t(
					status === "overdue" ? "plugins.flexibleLayouts.maintenance.reminders.overdueBody" : "plugins.flexibleLayouts.maintenance.reminders.dueSoonBody",
					{ label: rule.label },
				),
				MAINTENANCE_ROUTE_PATH,
			);
		}
	}

	stopConnectWatch = watch(() => machineStore.isConnected, (connected) => { if (connected) { void checkOnConnect(); } }, { immediate: true });
}

export function uninstallMaintenanceReminderNudge(): void {
	if (stopConnectWatch) { stopConnectWatch(); stopConnectWatch = null; }
	checkedThisSession = false;
}
