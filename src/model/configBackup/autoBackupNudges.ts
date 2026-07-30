/**
 * Automatic backup nudges: reminders (never silent uploads/downloads - see credentials.ts's
 * AutoBackupNudgeSettings doc comment) shown when one of three real, verified DWC signals fires:
 * config.g being saved (DWC's own `fileUploaded` event), the last backup being overdue, or the
 * connected machine never having been backed up before. There is no true background/scheduled
 * trigger available to a browser-only plugin - every one of these only fires while DWC is open in a
 * tab, same constraint as the rest of this feature.
 *
 * Firmware-update-starting was investigated (machineStore.boardBeingUpdated flips the instant M997 is
 * issued) but deliberately left out - a plugin can only observe that reactively, not gate/block DWC's
 * update flow, so it would be a same-instant race rather than a real "back up before" guarantee. Not
 * chosen by the user for this round.
 */
import { watch } from "vue";

import Events from "@/utils/events";
import { LogLevel, useUiStore } from "@/stores/ui";
import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { computeMachineKey } from "./archive";
import { CONFIG_BACKUP_ROUTE_PATH } from "./constants";
import { getAutoBackupNudgeSettings, getBackedUpMachineKeys, getLastBackupAt } from "./credentials";
import { buildMachineIdentity } from "./machineIdentity";

const CONFIG_SAVE_COOLDOWN_MS = 5 * 60 * 1000; // avoid re-nudging on every keystroke-save while actively editing

// --- Pure trigger logic (unit-testable) ---------------------------------------------------------------

export function isBackupOverdue(lastBackupAt: string | null, thresholdDays: number, now: number = Date.now()): boolean {
	if (!lastBackupAt) { return true; }
	const ageMs = now - new Date(lastBackupAt).getTime();
	return ageMs >= thresholdDays * 24 * 60 * 60 * 1000;
}

/** Only "unseen" once at least one backup has been taken for *some* machine - a completely fresh
 * install (no backup history at all) is covered by the overdue nudge instead, so the two don't both
 * fire on first connect. */
export function isUnseenMachine(machineKey: string, knownMachineKeys: ReadonlySet<string>): boolean {
	return knownMachineKeys.size > 0 && !knownMachineKeys.has(machineKey);
}

// --- Wiring (impure) - install once at plugin load, uninstall on dwcPluginUnloaded --------------------

type FileUploadedHandler = (e: { filename: string }) => void;

let fileUploadedHandler: FileUploadedHandler | null = null;
let stopConnectWatch: (() => void) | null = null;
let lastConfigSaveNudgeAt = 0;
let checkedThisSession = false;

export function installAutoBackupNudges(): void {
	const uiStore = useUiStore();
	const machineStore = useMachineStore();

	fileUploadedHandler = (e) => {
		const settings = getAutoBackupNudgeSettings();
		if (!settings.configSaved) { return; }
		if (!e.filename.toLowerCase().endsWith("/config.g")) { return; }
		const now = Date.now();
		if (now - lastConfigSaveNudgeAt < CONFIG_SAVE_COOLDOWN_MS) { return; }
		lastConfigSaveNudgeAt = now;
		uiStore.log(
			LogLevel.info,
			i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.configSavedTitle"),
			i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.configSavedBody"),
			CONFIG_BACKUP_ROUTE_PATH,
		);
	};
	// Cast: DWC's Events emitter is strictly typed against its own ~30 known event shapes; this
	// plugin only ever subscribes to one of them, never invents a new event type.
	Events.on("fileUploaded", fileUploadedHandler as never);

	function checkOnConnect(): void {
		if (!machineStore.isConnected || checkedThisSession) { return; }
		checkedThisSession = true;
		const settings = getAutoBackupNudgeSettings();
		const identity = buildMachineIdentity(machineStore.model as unknown);
		const machineKey = computeMachineKey(identity);
		const knownKeys = new Set(getBackedUpMachineKeys());

		if (settings.newMachine && isUnseenMachine(machineKey, knownKeys)) {
			uiStore.log(
				LogLevel.info,
				i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.newMachineTitle"),
				i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.newMachineBody"),
				CONFIG_BACKUP_ROUTE_PATH,
			);
			return; // one nudge per connect is enough - don't also fire "overdue" straight after
		}
		if (settings.overdue && isBackupOverdue(getLastBackupAt(), settings.overdueDays)) {
			uiStore.log(
				LogLevel.info,
				i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.overdueTitle"),
				i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.overdueBody", { days: settings.overdueDays }),
				CONFIG_BACKUP_ROUTE_PATH,
			);
		}
	}
	stopConnectWatch = watch(() => machineStore.isConnected, (connected) => { if (connected) { checkOnConnect(); } }, { immediate: true });
}

export function uninstallAutoBackupNudges(): void {
	if (fileUploadedHandler) { Events.off("fileUploaded", fileUploadedHandler as never); fileUploadedHandler = null; }
	if (stopConnectWatch) { stopConnectWatch(); stopConnectWatch = null; }
	checkedThisSession = false;
	lastConfigSaveNudgeAt = 0;
}
