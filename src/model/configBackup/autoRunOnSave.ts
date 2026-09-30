/**
 * The `autoRunOnConfigSave` flag (MISSING-FEATURES-PLAN §A2): back up automatically a little after `config.g` is saved.
 *
 * It belongs on `AutoBackupNudgeSettings` in `dwc-config-backup-core`, next to `autoRun`, and is added there
 * (optional, default false, so a stored blob that predates it needs no migration). Until a core release carrying the
 * typed field is the one FL depends on, FL reads and writes it through these two helpers: the core's settings blob is
 * merged over its defaults on read and written verbatim on save, so the flag round-trips today and simply becomes a
 * typed field later - no data to move.
 */
import type { AutoBackupNudgeSettings } from "dwc-config-backup-core";
import { getAutoBackupNudgeSettings } from "dwc-config-backup-core";

/** Is "back up shortly after config.g is saved" switched on? */
export function getAutoRunOnConfigSave(settings: AutoBackupNudgeSettings = getAutoBackupNudgeSettings()): boolean {
	return (settings as AutoBackupNudgeSettings & { autoRunOnConfigSave?: boolean }).autoRunOnConfigSave === true;
}

/** A copy of `settings` with the flag set, ready for `setAutoBackupNudgeSettings` (which stores the whole object). */
export function withAutoRunOnConfigSave(settings: AutoBackupNudgeSettings, on: boolean): AutoBackupNudgeSettings {
	return { ...settings, autoRunOnConfigSave: on } as AutoBackupNudgeSettings;
}
