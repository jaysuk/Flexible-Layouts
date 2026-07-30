/**
 * Constants for the whole-machine config backup/restore feature. See
 * `CONFIG-BACKUP-PLAN.md` for the design this implements.
 */

/** Route path for the dedicated Config Backup page (registerRoute + FlexSettingsTab navigation). */
export const CONFIG_BACKUP_ROUTE_PATH = "/Plugins/FlexibleLayouts/ConfigBackup";

export const ARCHIVE_KIND = "flexible-layouts-config-backup";
export const ARCHIVE_SCHEMA_VERSION = 1;

export const REDACTIONS_KIND = "flexible-layouts-redactions";
export const REDACTIONS_SCHEMA_VERSION = 1;

/** Sentinel written in place of a redacted value. Also the marker `repair.ts` scans for. */
export const REDACTED_VALUE = "[REDACTED]";
/** Trailing tag appended to a redacted G-code line; `<n>` is the redactions.json entry id. */
export const REDACTED_TAG_PREFIX = "[FL-REDACTED:";
/** Captures a comma-separated id list, e.g. "[FL-REDACTED:3,4]" for a line with 2+ redactions. */
export const REDACTED_TAG_RE = /\[FL-REDACTED:([\d,]+)\]/;

/** Directory kinds collected into a backup, keyed the same as `model.directories`. */
export type BackupDirKind = "system" | "macros" | "filaments";
export const BACKUP_DIR_KINDS: ReadonlyArray<BackupDirKind> = ["system", "macros", "filaments"];

/** Archive-relative folder name for each directory kind (`files/<folder>/…`). */
export const DIR_FOLDER: Record<BackupDirKind, string> = {
	system: "sys",
	macros: "macros",
	filaments: "filaments",
};

/** Fallback machine-relative path for a directory kind if `model.directories` is unset. */
export const DEFAULT_DIR_PATH: Record<BackupDirKind, string> = {
	system: "0:/sys/",
	macros: "0:/macros/",
	filaments: "0:/filaments/",
};

/** Recursion depth cap for directory walking - a runaway symlink-like structure can't loop forever. */
export const MAX_WALK_DEPTH = 8;

/** Default per-file size cap in bytes (D6). Configurable per backup. */
export const DEFAULT_MAX_FILE_BYTES = 1 * 1024 * 1024;
/** Default total-archive size cap in bytes (D6, informational - not enforced hard). */
export const DEFAULT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** File extensions never collected (D7): firmware images and logs. Case-insensitive, no dot. */
export const EXCLUDED_EXTENSIONS: ReadonlySet<string> = new Set(["bin", "uf2", "hex", "zip", "log", "gz"]);

/** Extensions read as binary (base64 in the archive) rather than text. */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "bmp", "ico", "dat"]);

/** Files that must never be deleted by Mirror mode, regardless of backup contents (§6 Phase 4, D3). */
export const MIRROR_DENY_LIST: ReadonlySet<string> = new Set([
	"flexible-layouts.backup.json",
	"flexible-layouts.backup.bak.json",
	"flexible-layouts.credentials.json",
]);

/** FIFO limit bounds for the Duet cloud backup service (§6 Phase 6). */
export const DUET_FIFO_DEFAULT_LIMIT = 5;
export const DUET_FIFO_MIN_LIMIT = 1;
export const DUET_FIFO_MAX_LIMIT = 20;

/**
 * Base URL of the Duet backup service (2026-07-26: supplied by the backend's maintainers as the
 * production instance - plain HTTP, no domain yet, just this host:port). Used only as the *default*
 * shown in the Cloud panel's settings field - never hardcoded as the only option, since a plain-HTTP
 * URL is unreachable from any DWC page loaded over HTTPS (browser mixed-content blocking - see
 * `isMixedContentBlocked` in destinations/duetCloud.ts) and a bare IP is one VPS migration away from
 * changing. Still fully overridable per-install.
 */
export const DUET_BACKUP_API_DEFAULT = "http://144.126.235.21:3377";

/** Upload/download endpoint pair actually used (§2.3 Q2: the zip endpoint, hard 2 MB cap). */
export const DUET_UPLOAD_PATH = "/api/upload-backup-zip";
export const DUET_DOWNLOAD_PATH = "/api/download-backup-zip-by-id";
// The expanded-files alternative, kept adjacent per the plan: no size cap, but pairs with
// /api/download-backup-by-id instead - switching endpoints means switching both paths together.
// export const DUET_UPLOAD_PATH = "/api/upload-backup";
// export const DUET_DOWNLOAD_PATH = "/api/download-backup-by-id";

/** Hard cap enforced by the shared backend's multer config for the zip upload endpoint. */
export const DUET_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export const ARCHIVE_README = `This ZIP is a Flexible Layouts configuration backup for a Duet 3D printer controller.

Contents:
  manifest.json       - machine identity, firmware, file list and hashes
  redactions.json      - record of sensitive values found (and, if redaction was enabled, replaced)
  object-model.json   - a snapshot of the machine's object model (network identity always redacted -
                        this is a shared privacy scrubber used by every plugin's diagnostics reports,
                        so it applies even when the rest of this backup is verbatim)
  diagnostics/         - M122 output for the mainboard and each connected CAN-FD board
  files/sys/…          - contents of 0:/sys/
  files/macros/…       - contents of 0:/macros/
  files/filaments/…    - contents of 0:/filaments/

Restore this backup from the Flexible Layouts plugin's "Backup & restore config" page in DuetWebControl.
`;
