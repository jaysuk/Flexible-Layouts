/**
 * Host wiring for the automatic backup nudges: turns the core package's pure predicates into actual
 * DWC toasts. Installed once at plugin load, torn down on `dwcPluginUnloaded`.
 *
 * The decision logic (`isBackupOverdue`, `isUnseenMachine`, the cooldown constant) lives in
 * dwc-config-backup-core; only the DWC-specific plumbing is here - subscribing to DWC's own
 * `fileUploaded` event, watching connection state, and calling the UI store's log API with a route so
 * the toast is click-through.
 *
 * These are reminders, never silent uploads or downloads. Clicking one just opens the backup page,
 * same as clicking the button in Settings.
 *
 * Firmware-update-starting was investigated (machineStore.boardBeingUpdated flips the instant M997 is
 * issued) but deliberately left out - a plugin can only observe that reactively, not gate/block DWC's
 * update flow, so it would be a same-instant race rather than a real "back up before" guarantee.
 */
import { watch } from "vue";

import {
	CONFIG_SAVE_COOLDOWN_MS, buildMachineIdentity, computeMachineKey, getAutoBackupNudgeSettings,
	getBackedUpMachineKeys, getLastBackupAt, isBackupOverdue, isUnseenMachine,
} from "dwc-config-backup-core";

import Events from "@/utils/events";
import { LogLevel, useUiStore } from "@/stores/ui";
import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { CONFIG_BACKUP_ROUTE_PATH } from "./constants";

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
