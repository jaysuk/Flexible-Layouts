/**
 * Host-specific constants for the config backup feature.
 *
 * Everything that is part of the archive format or the destination protocols now lives in
 * `dwc-config-backup-core` (shared with the DWC 3.6 plugin so archives round-trip between hosts).
 * Only values that are genuinely specific to Flexible Layouts remain here.
 */

/** Route path for the dedicated Config Backup page (registerRoute + FlexSettingsTab navigation). */
export const CONFIG_BACKUP_ROUTE_PATH = "/Plugins/FlexibleLayouts/ConfigBackup";

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
