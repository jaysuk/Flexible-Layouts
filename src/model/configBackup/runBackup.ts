/**
 * Headless backup pipeline (SCHEDULED-BACKUPS-PLAN.md §4.1), extracted out of
 * `BackupCreatePanel.vue`'s old `onCreate()` so a future automatic trigger (Phase 3, not built yet)
 * can run a backup without a Vue component to hang off, and without ever blocking on a dialog.
 *
 * Split into two functions rather than one "collect through send" function:
 *
 *   - `collectForBackup()` does the networked part - walks the machine's directories, reads every
 *     file, captures the object model / M122 diagnostics. This is the slow, HTTP-heavy step.
 *   - `runBackup()` takes that already-collected data and does everything from there: the
 *     unredacted-content dry-run check, building the final archive, and sending it to the chosen
 *     destination. Pure/in-memory except for the final network send.
 *
 * Why the split matters: today's "send this unredacted?" warning is decided by scanning the REAL
 * collected files (a dry-run `buildArchive`), and if the user answers "redact instead" or "send
 * anyway", the interactive Create tab has to re-run with that answer WITHOUT re-walking the printer's
 * filesystem a second time. Keeping `collected` outside `runBackup` means retrying after a resolved
 * prompt only re-does the cheap, in-memory build step - exactly matching the pre-refactor behaviour,
 * where `collectAll()` ran exactly once per click of "Create backup" no matter how many dialogs fired.
 * A single monolithic `runBackup(config)` would have to re-collect from scratch on every retry.
 *
 * `runBackup()` NEVER shows a dialog and NEVER hangs waiting on a human - if it reaches a point that
 * would need one and the caller hasn't already resolved it (via `config.encryptPassword`,
 * `config.publicRepoConfirmed`, or the persisted `hasAcknowledgedUnredacted()` flag), it returns
 * `{ ok: false, reason: "needsInput", needsInputKind, ... }` instead. The interactive Create tab
 * resolves each prompt itself (showing its existing dialogs) and calls `runBackup` again with the
 * answer folded in, re-using the same `collected` from `collectForBackup`; a future scheduler
 * (Phase 3) instead treats a destination that would need input as ineligible for an unattended run
 * (SCHEDULED-BACKUPS-PLAN.md §4.2) and falls back to the existing nudge, without ever getting here.
 *
 * Google Drive is the one destination whose "prompt" (interactive OAuth sign-in) is NOT modelled as
 * `needsInput` - it stays inline (`sendToDrive` below), unchanged from before the refactor, because a
 * manual click is itself a user gesture that's fine to pop a sign-in window from. §4.2 excludes Drive
 * from unattended eligibility entirely at the scheduler level (a static, per-destination table lookup,
 * not a runtime signal from this module) - Phase 3's scheduler simply never calls `runBackup` with
 * `destination: "drive"`, so this module doesn't need its own gate for it.
 *
 * `setLastBackupAt()`/`addBackedUpMachineKey()` (success) and `setLastBackupAttempt()` (every real
 * attempt, success or failure - SCHEDULED-BACKUPS-PLAN.md §4.4) are recorded IN HERE, not by the
 * caller, so a manual backup today and a future automatic one record both identically.
 */
import {
	buildArchive, buildLiveDirectories, buildMachineIdentity, collectAll, DEFAULT_MAX_FILE_BYTES,
	defaultMachineFolder, getDropboxSettings, getDuetCloudApiUrl, getDuetCloudFifoLimit, getGithubSettings,
	getRedactionExclusions, getWebDavSettings, hasAcknowledgedUnredacted, readArchive,
	setLastBackupAt, setLastBackupAttempt, addBackedUpMachineKey,
} from "dwc-config-backup-core";
import type { BackupDestinationId, BackupProgressCallback, BackupScope, RedactionEntry } from "dwc-config-backup-core";
import { downloadArchive, backupFilename } from "dwc-config-backup-core/destinations/localZip";
import { isRepoPrivate, pushBackup } from "dwc-config-backup-core/destinations/github";
import { uploadBackup as driveUploadBackup } from "dwc-config-backup-core/destinations/googleDrive";
import { preflightSize, pruneToLimit, uploadBackup as duetUploadBackup } from "dwc-config-backup-core/destinations/duetCloud";
import { uploadBackup as dropboxUploadBackup } from "dwc-config-backup-core/destinations/dropbox";
import { uploadBackup as webdavUploadBackup } from "dwc-config-backup-core/destinations/webdav";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { PLUGIN_MANIFEST_ID } from "../constants";
import { defaultMachineIO } from "./machineIO";
import { DESTINATION_LABEL_KEYS } from "./constants";
import { getGoogleDriveAccessToken } from "./googleDriveAuth";

export type BuiltArchive = Awaited<ReturnType<typeof buildArchive>>;
type MachineIdentity = ReturnType<typeof buildMachineIdentity>;

/** The INSTALLED plugin version (authoritative), same source as the diagnostics report elsewhere in
 * this plugin - falls back to "unknown" outside a real DWC (e.g. under vitest). */
function installedVersion(machineStore: ReturnType<typeof useMachineStore>): string {
	const plugins = (machineStore.model as { plugins?: Map<string, { version?: string; dwcVersion?: string }> }).plugins;
	const record = plugins?.get(PLUGIN_MANIFEST_ID);
	return record?.version ?? "unknown";
}
function runningDwcVersion(): string {
	try { return (globalThis as { DWC?: { version?: string } }).DWC?.version ?? "unknown"; } catch { return "unknown"; }
}

function destinationLabel(destination: BackupDestinationId): string {
	return i18n.global.t(DESTINATION_LABEL_KEYS[destination]);
}

// --- Step 1: collect (networked, run once) --------------------------------------------------------

export interface CollectedForBackup {
	collected: Awaited<ReturnType<typeof collectAll>>;
	identity: MachineIdentity;
	/** The machine's LIVE directory paths at collection time (`buildLiveDirectories`) - carried through
	 * to `buildArchive` so the manifest records where files actually came from, rather than silently
	 * falling back to RRF's defaults for a machine with custom sys/macros/filaments paths. */
	directories: ReturnType<typeof buildLiveDirectories>;
	pluginVersion: string;
	dwcVersion: string;
}

/** Walks the machine and reads everything the given scope asks for. The slow, HTTP-heavy step -
 * separated from `runBackup` so a retry after a resolved prompt never repeats it (see module doc). */
export async function collectForBackup(scope: BackupScope, onProgress?: BackupProgressCallback): Promise<CollectedForBackup> {
	const machineStore = useMachineStore();
	const io = defaultMachineIO();
	const model = machineStore.model as unknown;
	const identity = buildMachineIdentity(model);
	const directories = buildLiveDirectories(model);

	const collected = await collectAll(io, {
		scope, maxFileBytes: DEFAULT_MAX_FILE_BYTES, directories, model, boards: identity.boards, onProgress,
	});

	return { collected, identity, directories, pluginVersion: installedVersion(machineStore), dwcVersion: runningDwcVersion() };
}

// --- Step 2: build + send (in-memory except the final network send) ------------------------------

export interface RunBackupConfig {
	destination: BackupDestinationId;
	scope: BackupScope;
	redact: boolean;
	encrypt: boolean;
	/** Resolved by the caller BEFORE calling `runBackup` when `encrypt` is true - this function never
	 * shows the password dialog itself. If `encrypt` is true and this is missing, `runBackup` returns
	 * `needsInputKind: "encryptPassword"` rather than proceeding without one. */
	encryptPassword?: string;
	/** The caller's answer to the "push unredacted content to a public GitHub repo?" confirm, if
	 * already resolved for this run. Deliberately NOT persisted anywhere (unlike
	 * `hasAcknowledgedUnredacted`) - matches the pre-refactor behaviour of re-asking every time. */
	publicRepoConfirmed?: boolean;
}

export type RunBackupResult =
	| { ok: true; built: BuiltArchive; redacted: boolean }
	| {
			ok: false;
			reason: "needsInput";
			/** Which prompt is blocking progress - so an interactive caller knows which dialog to show,
			 * and a future scheduler can tell "needs a password" apart from "needs a repo confirm" when
			 * deciding a destination isn't eligible for an unattended run (SCHEDULED-BACKUPS-PLAN.md §4.2). */
			needsInputKind: "encryptPassword" | "unredacted" | "publicRepo";
			message: string;
			/** Only set for `needsInputKind: "unredacted"` - what would be sent in the clear, so the
			 * caller's dialog can show specifics without re-scanning the collected files itself. */
			unredactedEntries?: Array<RedactionEntry>;
	  }
	| { ok: false; reason: "failed"; message: string };

/**
 * Builds the archive from already-`collectForBackup()`-ed data and sends it to `config.destination`.
 * Records `setLastBackupAttempt()` on every real attempt (success or failure) and, on success,
 * `setLastBackupAt()` + `addBackedUpMachineKey()` too - see the module doc for why those two are kept
 * separate. Returns `needsInput` (recording nothing) rather than attempting anything when a prompt
 * would be required and the caller hasn't already resolved it - a run that never started isn't an
 * "attempt".
 */
export async function runBackup(prepared: CollectedForBackup, config: RunBackupConfig): Promise<RunBackupResult> {
	const { collected, identity, directories, pluginVersion, dwcVersion } = prepared;

	if (config.encrypt && !config.encryptPassword) {
		return { ok: false, reason: "needsInput", needsInputKind: "encryptPassword", message: "A backup password is required." };
	}

	// Same source for both calls below (REDACTION-EXCLUSIONS-PLAN.md §6.2 step 3) - the dry-run preview
	// and the real archive must agree on what's excluded, or the preview could promise a redaction the
	// real backup then skips (or vice versa).
	const excludedNames = new Set(getRedactionExclusions());

	// An encrypted backup already satisfies "nothing leaves in the clear" (ENCRYPTED-BACKUPS-PLAN.md
	// §3) - skip the unredacted-content warning entirely when encryption is on, same as it's already
	// skipped for "redact" being on.
	if (!config.redact && !config.encrypt && config.destination !== "local" && !hasAcknowledgedUnredacted(config.destination)) {
		// Dry-run scan so the warning can name exactly what's in the backup, regardless of the switch.
		// Never encrypted - this blob is thrown away, only its redaction list is used.
		const dryRun = await buildArchive(collected, {
			redact: false, scope: config.scope, machine: identity, directories, pluginVersion, dwcVersion, excludedNames,
		});
		if (dryRun.redactions.entries.length > 0) {
			return {
				ok: false, reason: "needsInput", needsInputKind: "unredacted",
				message: `${dryRun.redactions.entries.length} sensitive value(s) would be sent unredacted.`,
				unredactedEntries: dryRun.redactions.entries,
			};
		}
	}

	const built = await buildArchive(collected, {
		redact: config.redact, scope: config.scope, machine: identity, directories, pluginVersion, dwcVersion, excludedNames,
		encrypt: config.encryptPassword ? { password: config.encryptPassword } : undefined,
	});

	try {
		if (config.destination === "local") {
			downloadArchive(built.blob, identity.hostname);
		} else if (config.destination === "duet") {
			await sendToDuetCloud(built, identity);
		} else if (config.destination === "github") {
			const publicRepoResult = await sendToGithub(built, identity, config.redact, built.encrypted, config.publicRepoConfirmed ?? false);
			if (publicRepoResult != null) { return publicRepoResult; } // needsInput: publicRepo - not recorded as an attempt
		} else if (config.destination === "drive") {
			await sendToDrive(built, identity);
		} else if (config.destination === "dropbox") {
			await sendToDropbox(built, identity);
		} else if (config.destination === "webdav") {
			await sendToWebdav(built, identity);
		}
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		setLastBackupAttempt({ at: new Date().toISOString(), ok: false, destination: config.destination, message });
		return { ok: false, reason: "failed", message };
	}

	setLastBackupAt(new Date().toISOString());
	addBackedUpMachineKey(built.manifest.machine.machineKey);
	setLastBackupAttempt({ at: new Date().toISOString(), ok: true, destination: config.destination });
	return { ok: true, built, redacted: config.redact };
}

async function sendToDuetCloud(built: BuiltArchive, identity: MachineIdentity): Promise<void> {
	const apiUrl = getDuetCloudApiUrl();
	const preflight = preflightSize(built.blob);
	if (!preflight.ok) {
		throw new Error(`This backup is ${(preflight.size / (1024 * 1024)).toFixed(2)} MB, over the 2 MB limit for the cloud service. Try dropping the object model dump or M122 diagnostics, or download it locally instead.`);
	}
	const machineKey = built.manifest.machine.machineKey;
	await duetUploadBackup(apiUrl, built.blob, { machine: built.manifest.machine.firmware.electronics, hostname: identity.hostname, guid: machineKey });
	await pruneToLimit(apiUrl, machineKey, getDuetCloudFifoLimit());
}

/** Returns a `needsInput` result if the repo turns out to be public and the caller hasn't already
 * confirmed proceeding (`config.publicRepoConfirmed`); otherwise `null` once the push has completed. */
async function sendToGithub(
	built: BuiltArchive, identity: MachineIdentity, isRedacted: boolean, isEncrypted: boolean, publicRepoConfirmed: boolean,
): Promise<RunBackupResult | null> {
	const settings = getGithubSettings();
	if (!settings) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel("github") })); }
	if (!isRedacted && !isEncrypted) {
		const priv = await isRepoPrivate(settings.token, settings.repo);
		if (priv === false && !publicRepoConfirmed) {
			return {
				ok: false, reason: "needsInput", needsInputKind: "publicRepo",
				message: "This backup would be pushed to a public GitHub repository unredacted.",
			};
		}
	}
	// ENCRYPTED-BACKUPS-PLAN.md §3/§5.7: the expanded per-file push exists so config.g diffs across
	// backups in GitHub's own UI - reading it back requires `built.blob` to be the plain archive. When
	// encrypted, `built.blob` is the password-protected outer zip (not readable without the password,
	// and not meant to be - see the plan for why encrypting the expanded files too would defeat their
	// entire purpose), so GitHub gets treated like every other destination: only the zip.
	const files = isEncrypted ? [] : built.manifest.files.map((f) => ({
		path: f.path.replace(/^files\//, ""),
		content: f.binary ? "" : "", // filled from archive text below
		binary: f.binary,
	}));
	// Pull the actual text back out of the freshly-built zip via a re-read - buildArchive doesn't keep a
	// Map of contents by design (it streams straight into JSZip), so re-parse the blob once.
	if (!isEncrypted) {
		const parsed = await readArchive(built.blob);
		for (const f of files) {
			const full = `files/${f.path}`;
			f.content = parsed.textFiles.get(full) ?? "";
		}
	}
	// GitHub keys backups by a human-readable folder path, not the hardware GUID Duet Cloud uses - so
	// two machines that happen to share a hostname would collide in the same folder without a
	// disambiguator. An explicit "Machine name" override is used verbatim (the user picked it on
	// purpose); otherwise default to hostname + a short hash of the real machine key.
	const machineFolder = settings.machineName || defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await pushBackup({
		token: settings.token, repo: settings.repo, branch: settings.branch || "main",
		machineFolder, files,
		// Stable filename (not timestamped): each push OVERWRITES this one blob rather than accumulating
		// a new zip per backup. Git still keeps every past version reachable via commit history - the
		// Configuration tab's GitHub "backup history" browser lists exactly this, via
		// `GET /repos/{repo}/commits?path=machines/<name>/backup.zip` (destinations/github.ts's
		// listBackupHistory), one entry per past backup, and restores any of them.
		zip: { path: "backup.zip", blob: built.blob },
		message: `Config backup ${settings.machineName || identity.hostname} ${built.manifest.createdAt}`,
	});
	return null;
}

/** `getGoogleDriveAccessToken()` (googleDriveAuth.ts) handles the cached-token / refresh-token / full
 * device-flow ladder - by the time this returns, sign-in (if it was even needed at all) is already
 * done. Kept as its own inline, blocking async function (not modelled as `runBackup`'s `needsInput`)
 * for the same reason the old GIS `signIn()` was: a manual click is itself a user gesture, and the
 * future scheduler (SCHEDULED-BACKUPS-PLAN.md §4.2) excludes "drive" from unattended eligibility
 * entirely at the call-site level, so it never reaches this function in the first place. */
async function sendToDrive(built: BuiltArchive, identity: MachineIdentity): Promise<void> {
	const token = await getGoogleDriveAccessToken();
	// Drive folders are found-or-created by this exact name, same hostname-only collision risk as
	// Dropbox/WebDAV - see the comment on GitHub's machineFolder above.
	const machineFolder = defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await driveUploadBackup(token, machineFolder, backupFilename(identity.hostname), built.blob);
}

async function sendToDropbox(built: BuiltArchive, identity: MachineIdentity): Promise<void> {
	const settings = getDropboxSettings();
	if (!settings) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel("dropbox") })); }
	// Dropbox has no manual-override field (unlike GitHub), so it always gets the disambiguated
	// default - see the comment on GitHub's machineFolder above.
	const machineFolder = defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await dropboxUploadBackup(settings.token, machineFolder, backupFilename(identity.hostname), built.blob);
}

async function sendToWebdav(built: BuiltArchive, identity: MachineIdentity): Promise<void> {
	const settings = getWebDavSettings();
	if (!settings) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel("webdav") })); }
	const machineFolder = defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await webdavUploadBackup(settings.url, settings.username, settings.password, machineFolder, backupFilename(identity.hostname), built.blob);
}
