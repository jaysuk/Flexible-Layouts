/**
 * Service-interval reminders (Item H): a one-click toast per connect when an enabled rule is due or
 * overdue, mirroring certExpiryNudge.ts's exact install/uninstall lifecycle - never an automatic
 * action, wired into index.ts the same way. Unlike certExpiryNudge (a purely browser-local check),
 * this one needs the maintenance LOG too (to find each rule's baseline via Item D's
 * mostRecentEntryForCounter/baselineForCounter), so the connect-check itself is async.
 */
import { watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

import { MAINTENANCE_ROUTE_PATH } from "../maintenance/constants";
import { baselineForCounter, mostRecentEntryForCounter, OM_PATH_FOR_COUNTER, readMaintenanceLog, secondsSince } from "../maintenance/log";
import { resolveOmPath } from "../../util/omPath";
import { computeDueStatus } from "./dueStatus";
import { getIntervalRules } from "./storage";

let stopConnectWatch: (() => void) | null = null;
let checkedThisSession = false;

export function installMaintenanceReminderNudge(): void {
	const uiStore = useUiStore();
	const machineStore = useMachineStore();

	async function checkOnConnect(): Promise<void> {
		if (!machineStore.isConnected || checkedThisSession) { return; }
		checkedThisSession = true;
		const rules = getIntervalRules().filter((r) => r.enabled);
		if (!rules.length) { return; }
		const log = await readMaintenanceLog();
		for (const rule of rules) {
			const rawLive = resolveOmPath(machineStore.model, OM_PATH_FOR_COUNTER[rule.counter]);
			const live = typeof rawLive === "number" ? rawLive : null;
			const entry = mostRecentEntryForCounter(log, rule.counter);
			const baseline = entry ? baselineForCounter(entry, rule.counter) : null;
			const status = computeDueStatus(secondsSince(live, baseline), rule.intervalValue);
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
