/**
 * config.g/daemon.g patching for the maintenance feature - reuses util/gcodeFilePatch's generic
 * line-based helpers (the same ones tlsSetup/configGPatch.ts already established), never guessing
 * blindly at file structure.
 *
 * Two separate, deliberately non-destructive patches:
 *  - config.g gets an M98 call restoring the persisted spindle-hours counter (RRF's global.* vars are
 *    RAM-only - without this the counter silently resets to 0 on every reboot). Appended at the end
 *    of the file rather than guessing at "early" placement: daemon.g's own first run only happens
 *    AFTER config.g finishes processing entirely (confirmed against RRF source), so anywhere in
 *    config.g is equally safe.
 *  - daemon.g gets an M98 call to Flexible Layouts' own maintenance-daemon.g macro. daemon.g is a
 *    SINGLE file with no multi-contribution mechanism in RRF - this NEVER overwrites existing
 *    daemon.g content, only appends the one line it's missing, or creates a minimal one-line file if
 *    none exists yet (nothing to clobber in that case).
 */
import { appendLine, findLine, type GcodeFilePatchResult } from "../../util/gcodeFilePatch";
import { MAINTENANCE_MACRO_FOLDER, MAINTENANCE_DAEMON_FILE, MAINTENANCE_STATE_PATH } from "./macros";

const RESTORE_LINE = `M98 P"${MAINTENANCE_STATE_PATH}"`;
const DAEMON_HOOK_LINE = `M98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}"`;

/** True if config.g already restores the persisted maintenance state on boot. */
export function configGHasMaintenanceRestore(configText: string): boolean {
	return findLine(configText, (code) => code.includes(MAINTENANCE_STATE_PATH)) !== null;
}

/** Appends the restore call if it's missing. No-ops (changed: false) if already present. */
export function patchConfigGForMaintenance(configText: string): GcodeFilePatchResult {
	if (configGHasMaintenanceRestore(configText)) {
		return { text: configText, changed: false, changes: ["config.g already restores the maintenance state - nothing to change."] };
	}
	return {
		text: appendLine(configText, RESTORE_LINE),
		changed: true,
		changes: [`Added new line: "${RESTORE_LINE}"`],
	};
}

/** True if the given daemon.g content already calls Flexible Layouts' own maintenance-daemon.g. */
export function daemonGHasMaintenanceHook(daemonText: string): boolean {
	return findLine(daemonText, (code) => code.includes(`${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`)) !== null;
}

/**
 * Adds the one line daemon.g needs, or creates a minimal one-line daemon.g if none exists yet.
 * `existingText` is `null` when daemon.g doesn't exist on the card at all (distinct from an empty
 * string, which is a real, existing, empty file) - in that one case there's nothing to clobber, so a
 * fresh minimal file is created outright rather than "appending" to nothing.
 */
export function patchDaemonGForMaintenance(existingText: string | null): GcodeFilePatchResult {
	if (existingText === null) {
		return { text: `${DAEMON_HOOK_LINE}\n`, changed: true, changes: ["No daemon.g on the card yet - creating one with just this line."] };
	}
	if (daemonGHasMaintenanceHook(existingText)) {
		return { text: existingText, changed: false, changes: ["daemon.g already calls the maintenance macro - nothing to change."] };
	}
	return {
		text: appendLine(existingText, DAEMON_HOOK_LINE),
		changed: true,
		changes: [`Added new line: "${DAEMON_HOOK_LINE}"`],
	};
}

/**
 * Best-effort only: whether config.g contains an M929 line enabling event logging (S1/S2/S3). This
 * CANNOT reliably detect logging enabled interactively, disabled by a later M929 elsewhere, or (in
 * standalone mode, the common CNC case) confirm logging is presently active via the object model - RRF
 * only populates `state.logFile`/`state.logLevel` for DSF/SBC connections. The setup wizard must say
 * so explicitly rather than showing a false-confidence checkmark.
 */
export function configGHasEventLogging(configText: string): boolean {
	const match = findLine(configText, (code) => /^\s*M929\b/i.test(code));
	if (!match) { return false; }
	const sMatch = /(?:^|\s)S(\d+)/i.exec(match.line.split(";")[0]);
	return sMatch ? Number(sMatch[1]) >= 1 : false;
}

export const DEFAULT_EVENT_LOG_FILE = "eventlog.txt";

/** Appends an M929 line enabling WARN-level logging (covers job start/finish/cancel, per RRF's own
 *  docs) if none already enables it. No-ops if config.g already has one at S>=1. */
export function patchConfigGForEventLogging(configText: string): GcodeFilePatchResult {
	if (configGHasEventLogging(configText)) {
		return { text: configText, changed: false, changes: ["config.g already enables event logging - nothing to change."] };
	}
	const newLine = `M929 P"${DEFAULT_EVENT_LOG_FILE}" S1 ; Flexible Layouts: job history for maintenance tracking`;
	return { text: appendLine(configText, newLine), changed: true, changes: [`Added new line: "${newLine}"`] };
}
