/**
 * Host-specific constants for the config backup feature.
 *
 * Everything that is part of the archive format or the destination protocols now lives in
 * `dwc-config-backup-core` (shared with the DWC 3.6 plugin so archives round-trip between hosts).
 * Only values that are genuinely specific to Flexible Layouts remain here.
 */
import type { BackupDestinationId } from "dwc-config-backup-core";

/** Route path for the dedicated Config Backup page (registerRoute + FlexSettingsTab navigation). */
export const CONFIG_BACKUP_ROUTE_PATH = "/Plugins/FlexibleLayouts/ConfigBackup";

/** Every destination the Create tab offers, in display order. */
export const DESTINATION_IDS: Array<BackupDestinationId> = ["local", "duet", "github", "drive", "dropbox", "webdav"];

/** i18n keys for each destination's display label - shared between `BackupCreatePanel.vue` (the
 * destination picker) and `runBackup.ts` (error messages like "GitHub isn't configured yet"), so both
 * agree on the exact same wording. */
export const DESTINATION_LABEL_KEYS: Record<BackupDestinationId, string> = {
	local: "plugins.flexibleLayouts.configBackup.create.destinationLocal",
	duet: "plugins.flexibleLayouts.configBackup.create.destinationDuet",
	github: "plugins.flexibleLayouts.configBackup.create.destinationGithub",
	drive: "plugins.flexibleLayouts.configBackup.create.destinationDrive",
	dropbox: "plugins.flexibleLayouts.configBackup.create.destinationDropbox",
	webdav: "plugins.flexibleLayouts.configBackup.create.destinationWebdav",
};

/**
 * This plugin's own SD-card state files, which a Mirror-mode restore must never delete. Passed to the
 * core package via `configureHost()` in index.ts - the core adds them to its own `ALWAYS_PROTECTED`
 * set rather than replacing it.
 */
export const FL_PROTECTED_SD_FILES: ReadonlySet<string> = new Set([
	"flexible-layouts.backup.json",
	"flexible-layouts.backup.bak.json",
	"flexible-layouts.credentials.json",
	"flexible-layouts.maintenance-log.json",
	"flexible-layouts.maintenance-state.g",
]);
