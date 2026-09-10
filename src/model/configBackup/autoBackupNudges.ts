/**
 * Host wiring for the automatic backup nudges: turns the core package's pure predicates into actual
 * DWC toasts. Installed once at plugin load, torn down on `dwcPluginUnloaded`.
 *
 * The decision logic (`isBackupOverdue`, `isUnseenMachine`, `isMachineIdle`, `shouldEscalateBackupFailureAlert`,
 * the cooldown constant) lives in dwc-config-backup-core; only the DWC-specific plumbing is here -
 * subscribing to DWC's own `fileUploaded` event, watching connection state, and calling the UI store's
 * log API with a route so the toast is click-through.
 *
 * Nudges are reminders - never a silent upload or download. The one exception is the opt-in
 * **opportunistic auto-run** (SCHEDULED-BACKUPS-PLAN.md §4.3): when the user has explicitly enabled it
 * AND the machine is idle AND a backup is overdue AND the chosen destination can complete with zero
 * prompts (§4.2), `checkOnConnect` runs a real backup via the headless `runBackup()` pipeline. It's
 * still opportunistic, not scheduled: it can only ever happen at the moment DWC connects, while a tab
 * is open. `autoRun` defaults to false, so nothing about the plain-nudge behaviour changes for anyone
 * who doesn't turn it on.
 *
 * Firmware-update-starting was investigated (machineStore.boardBeingUpdated flips the instant M997 is
 * issued) but deliberately left out - a plugin can only observe that reactively, not gate/block DWC's
 * update flow, so it would be a same-instant race rather than a real "back up before" guarantee.
 */
import { watch } from "vue";

import {
	CONFIG_SAVE_COOLDOWN_MS, buildMachineIdentity, computeMachineKey, getAutoBackupNudgeSettings,
	getBackedUpMachineKeys, getBackupFailureStreak, getEncryptPreference, getLastBackupAt, getRedactPreference,
	isBackupOverdue, isMachineIdle, isUnseenMachine, setLastBackupAttempt, shouldEscalateBackupFailureAlert,
} from "dwc-config-backup-core";
import type { BackupDestinationId, BackupScope } from "dwc-config-backup-core";

import Events from "@/utils/events";
import { LogLevel, useUiStore } from "@/stores/ui";
import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { collectForBackup, runBackup } from "./runBackup";
import { CONFIG_BACKUP_ROUTE_PATH, DESTINATION_LABEL_KEYS } from "./constants";

type FileUploadedHandler = (e: { filename: string }) => void;

/** Destinations an unattended run can complete without ever needing a human (SCHEDULED-BACKUPS-PLAN.md
 * §4.2). `local` (a browser download) and `drive` (interactive OAuth every time) are excluded by
 * design; an encrypted destination is excluded dynamically below (the password is never persisted). */
const AUTO_RUN_ELIGIBLE_DESTINATIONS: ReadonlySet<BackupDestinationId> = new Set(["duet", "github", "dropbox", "webdav"]);

/** The full scope an automatic backup takes - everything, matching the Create tab's defaults. */
const AUTO_RUN_SCOPE: BackupScope = { system: true, macros: true, filaments: true, objectModel: true, diagnostics: true };

let fileUploadedHandler: FileUploadedHandler | null = null;
let stopConnectWatch: (() => void) | null = null;
let lastConfigSaveNudgeAt = 0;
let checkedThisSession = false;
/** Guards against a second overlapping auto-run if `checkOnConnect` somehow re-entered before the
 * first (async) run resolved - belt-and-braces on top of `checkedThisSession`. */
let autoRunInFlight = false;

function t(key: string, params?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.configBackup.${key}`, params ?? {});
}
function destinationLabel(destination: BackupDestinationId): string {
	return i18n.global.t(DESTINATION_LABEL_KEYS[destination]);
}

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

	function machineStatus(): string | undefined {
		return (machineStore.model as { state?: { status?: string } }).state?.status;
	}

	/** True only when auto-run is enabled, its destination is one that can complete unattended, and
	 * that destination doesn't have per-destination encryption turned on (the password is never
	 * persisted, so an encrypted auto-run could only ever hang - §4.2). */
	function autoRunDestinationEligible(destination: BackupDestinationId | null): destination is BackupDestinationId {
		if (!destination || !AUTO_RUN_ELIGIBLE_DESTINATIONS.has(destination)) { return false; }
		// Encryption and unattended runs are mutually exclusive (§4.2) - the backup password is never
		// persisted, so an encrypted auto-run would only ever return needsInput. The UI won't let the
		// user pick such a destination, but guard at runtime too in case encryption was turned on after.
		if (getEncryptPreference(destination)) { return false; }
		return true;
	}

	async function runAutomaticBackup(destination: BackupDestinationId): Promise<void> {
		if (autoRunInFlight) { return; }
		autoRunInFlight = true;
		uiStore.log(
			LogLevel.info,
			t("autoRun.startedTitle"),
			t("autoRun.startedBody", { destination: destinationLabel(destination) }),
			CONFIG_BACKUP_ROUTE_PATH,
		);
		try {
			const prepared = await collectForBackup(AUTO_RUN_SCOPE);
			const result = await runBackup(prepared, {
				destination, scope: AUTO_RUN_SCOPE, redact: getRedactPreference(destination), encrypt: false,
			});
			if (result.ok) {
				uiStore.log(
					LogLevel.success,
					t("autoRun.okTitle"),
					t("autoRun.okBody", { destination: destinationLabel(destination) }),
					CONFIG_BACKUP_ROUTE_PATH,
				);
			} else if (result.reason === "needsInput") {
				// The destination would need a prompt we can't answer unattended (unredacted content not
				// yet acknowledged for it, most likely). Fall back to today's plain overdue nudge.
				const settings = getAutoBackupNudgeSettings();
				uiStore.log(
					LogLevel.info,
					i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.overdueTitle"),
					i18n.global.t("plugins.flexibleLayouts.configBackup.nudge.overdueBody", { days: settings.overdueDays }),
					CONFIG_BACKUP_ROUTE_PATH,
				);
			} else {
				reportAutoRunFailure(destination, result.message);
			}
		} catch (e) {
			// collectForBackup() itself failed (it's the networked half) - runBackup was never reached,
			// so it recorded no attempt. Record one here so the failure is visible and the streak advances.
			const message = e instanceof Error ? e.message : String(e);
			setLastBackupAttempt({ at: new Date().toISOString(), ok: false, destination, message });
			reportAutoRunFailure(destination, message);
		} finally {
			autoRunInFlight = false;
		}
	}

	function reportAutoRunFailure(destination: BackupDestinationId, message: string): void {
		const streak = getBackupFailureStreak();
		const escalate = shouldEscalateBackupFailureAlert(streak);
		uiStore.log(
			LogLevel.error,
			escalate ? t("autoRun.failedRepeatedlyTitle") : t("autoRun.failedTitle"),
			escalate
				? t("autoRun.failedRepeatedlyBody", { destination: destinationLabel(destination), count: streak, message })
				: t("autoRun.failedBody", { destination: destinationLabel(destination), message }),
			CONFIG_BACKUP_ROUTE_PATH,
		);
	}

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

		const overdue = isBackupOverdue(getLastBackupAt(), settings.overdueDays);

		// Opportunistic auto-run (§4.3): only when the user opted in, the destination can run unattended,
		// a backup is actually overdue, AND the machine is strictly idle (§4.3 step 3 - never start
		// walking the filesystem mid-print). If the machine is busy we fall through to the plain nudge.
		if (settings.autoRun && overdue && autoRunDestinationEligible(settings.autoRunDestination) && isMachineIdle(machineStatus())) {
			void runAutomaticBackup(settings.autoRunDestination);
			return;
		}

		if (settings.overdue && overdue) {
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
	autoRunInFlight = false;
}
