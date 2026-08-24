<template>
	<v-card flat>
		<v-card-text>
			<div class="text-caption text-medium-emphasis mb-3">{{ lastBackupText }}</div>

			<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.create.scopeHeading") }}</div>
			<div class="d-flex flex-wrap ga-3 mb-3">
				<v-checkbox v-model="scope.system" :label="$t('plugins.flexibleLayouts.configBackup.create.scopeSystem')" density="compact" hide-details />
				<v-checkbox v-model="scope.macros" :label="$t('plugins.flexibleLayouts.configBackup.create.scopeMacros')" density="compact" hide-details />
				<v-checkbox v-model="scope.filaments" :label="$t('plugins.flexibleLayouts.configBackup.create.scopeFilaments')" density="compact" hide-details />
				<v-checkbox v-model="scope.objectModel" :label="$t('plugins.flexibleLayouts.configBackup.create.scopeObjectModel')" density="compact" hide-details />
				<v-checkbox v-model="scope.diagnostics" :label="$t('plugins.flexibleLayouts.configBackup.create.scopeDiagnostics')" density="compact" hide-details />
			</div>
			<div class="text-caption text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.configBackup.create.objectModelHelp") }}</div>

			<v-divider class="mb-3" />

			<div class="d-flex align-center ga-2 mb-1">
				<v-switch v-model="redact" density="compact" hide-details color="warning" />
				<span class="text-body-2">{{ $t("plugins.flexibleLayouts.configBackup.create.redactSwitch") }}</span>
				<HelpTip :text="redact
					? $t('plugins.flexibleLayouts.configBackup.create.redactHelpOn')
					: $t('plugins.flexibleLayouts.configBackup.create.redactHelpOff')" />
			</div>
			<v-alert :type="redact ? 'info' : 'warning'" variant="tonal" density="compact" class="mb-3">
				{{ redact
					? $t("plugins.flexibleLayouts.configBackup.create.redactHelpOn")
					: $t("plugins.flexibleLayouts.configBackup.create.redactHelpOff") }}
			</v-alert>

			<v-divider class="mb-3" />

			<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.create.destinationHeading") }}</div>
			<v-radio-group v-model="destination" density="compact" hide-details class="mb-1">
				<v-radio v-for="opt in destinationOptions" :key="opt.id" :value="opt.id">
					<template #label>
						<span class="d-flex align-center ga-2">
							{{ opt.label }}
							<v-chip v-if="opt.id !== 'local'" size="x-small" :color="opt.configured ? 'success' : undefined" variant="tonal">
								{{ opt.configured
									? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote")
									: $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
							</v-chip>
						</span>
					</template>
				</v-radio>
			</v-radio-group>

			<v-alert v-if="!destinationConfigured" type="warning" variant="tonal" density="compact" class="mb-3">
				{{ $t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel }) }}
			</v-alert>

			<v-btn color="primary" :loading="busy" :disabled="!scopeValid || !destinationConfigured" @click="onCreate">
				{{ $t("plugins.flexibleLayouts.configBackup.create.createButton") }}
			</v-btn>
			<div v-if="!scopeValid" class="text-caption text-error mt-1">{{ $t("plugins.flexibleLayouts.configBackup.create.noScopeSelected") }}</div>

			<v-progress-linear v-if="busy" :model-value="progressPct" class="mt-3" />
			<div v-if="busy" class="text-caption text-medium-emphasis mt-1">{{ stageLabel }}</div>

			<v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</v-alert>

			<template v-if="result">
				<v-divider class="my-3" />
				<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.create.resultHeading") }}</div>
				<div class="text-body-2 mb-1">
					{{ $t("plugins.flexibleLayouts.configBackup.create.resultFiles", { count: result.manifest.counts.files }) }}
					· {{ formatSize(result.manifest.counts.bytes) }}
					<span v-if="result.manifest.counts.skipped > 0">
						· {{ $t("plugins.flexibleLayouts.configBackup.create.resultSkipped", { count: result.manifest.counts.skipped }) }}
					</span>
				</div>
				<RedactionSummary :entries="result.redactions.entries" :redacted="result.manifest.redacted" allow-exclude @exclude="onExclude" />
			</template>

			<v-divider class="my-3" />
			<v-expansion-panels variant="accordion">
				<v-expansion-panel>
					<v-expansion-panel-title class="text-body-2">
						{{ $t("plugins.flexibleLayouts.configBackup.create.exclusionsHeading", { count: exclusions.length }) }}
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.create.exclusionsHelp") }}</div>
						<div v-if="exclusions.length === 0" class="text-caption text-medium-emphasis">
							{{ $t("plugins.flexibleLayouts.configBackup.create.exclusionsEmpty") }}
						</div>
						<template v-else>
							<v-chip v-for="name in exclusions" :key="name" size="small" class="me-2 mb-2" closable
									:aria-label="$t('plugins.flexibleLayouts.configBackup.create.exclusionsRemove', { name })"
									@click:close="onRemoveExclusion(name)">
								{{ name }}
							</v-chip>
						</template>
					</v-expansion-panel-text>
				</v-expansion-panel>
			</v-expansion-panels>
		</v-card-text>

		<v-dialog v-model="unredactedDialog.open" max-width="520">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.configBackup.create.unredactedWarningTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">
						{{ $t("plugins.flexibleLayouts.configBackup.create.unredactedWarningBody", { count: unredactedDialog.count, destination }) }}
					</div>
					<RedactionSummary :entries="unredactedDialog.entries" :redacted="false" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" color="card-actions" @click="unredactedDialog.resolve?.('redact')">
						{{ $t("plugins.flexibleLayouts.configBackup.create.unredactedWarningRedactInstead") }}
					</v-btn>
					<v-btn variant="text" color="error" @click="unredactedDialog.resolve?.('send')">
						{{ $t("plugins.flexibleLayouts.configBackup.create.unredactedWarningSendAnyway") }}
					</v-btn>
					<v-btn variant="text" @click="unredactedDialog.resolve?.('cancel')">
						{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-dialog v-model="publicRepoDialog.open" max-width="520">
			<v-card>
				<v-card-title class="text-error">{{ $t("plugins.flexibleLayouts.configBackup.create.publicRepoBlockedTitle") }}</v-card-title>
				<v-card-text>
					<p class="mb-3">{{ $t("plugins.flexibleLayouts.configBackup.create.publicRepoBlockedBody") }}</p>
					<v-text-field v-model="publicRepoDialog.typed" :label="$t('plugins.flexibleLayouts.configBackup.create.publicRepoBlockedConfirmLabel')"
								  density="compact" variant="outlined" hide-details />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="publicRepoDialog.resolve?.(false)">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
					<v-btn variant="text" color="error" :disabled="publicRepoDialog.typed !== 'CONFIRM'" @click="publicRepoDialog.resolve?.(true)">
						{{ $t("plugins.flexibleLayouts.configBackup.create.publicRepoBlockedConfirmWord") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-snackbar v-model="toast.open" :timeout="4000">{{ toast.text }}</v-snackbar>
	</v-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import { HelpTip } from "dwc-plugin-runtime";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { buildArchive, readArchive } from "dwc-config-backup-core";
import { collectAll } from "dwc-config-backup-core";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { DEFAULT_MAX_FILE_BYTES } from "dwc-config-backup-core";
import { PLUGIN_MANIFEST_ID } from "../model/constants";
import type { BackupProgressStage, RedactionEntry } from "dwc-config-backup-core";
import type { BackupDestinationId } from "dwc-config-backup-core";
import {
	addBackedUpMachineKey, addRedactionExclusion, getDropboxSettings, getDuetCloudApiUrl, getDuetCloudFifoLimit,
	getDuetCloudSession, getGithubSettings, getGoogleDriveClientId, getLastBackupAt, getRedactionExclusions,
	getRedactPreference, getWebDavSettings, hasAcknowledgedUnredacted, removeRedactionExclusion,
	setAcknowledgedUnredacted, setLastBackupAt, setRedactPreference,
} from "dwc-config-backup-core";
import { buildLiveDirectories, buildMachineIdentity, defaultMachineFolder } from "dwc-config-backup-core";
import { downloadArchive, backupFilename } from "dwc-config-backup-core/destinations/localZip";
import { isRepoPrivate, pushBackup } from "dwc-config-backup-core/destinations/github";
import { isOriginSupported, signIn, uploadBackup as driveUploadBackup } from "dwc-config-backup-core/destinations/googleDrive";
import { preflightSize, pruneToLimit, uploadBackup as duetUploadBackup } from "dwc-config-backup-core/destinations/duetCloud";
import { uploadBackup as dropboxUploadBackup } from "dwc-config-backup-core/destinations/dropbox";
import { uploadBackup as webdavUploadBackup } from "dwc-config-backup-core/destinations/webdav";
import RedactionSummary from "./RedactionSummary.vue";

const machineStore = useMachineStore();

/** The INSTALLED plugin version (authoritative), same source as the diagnostics report elsewhere in
 * this plugin - falls back to "unknown" outside a real DWC (e.g. under vitest). */
function installedVersion(): string {
	const plugins = (machineStore.model as { plugins?: Map<string, { version?: string; dwcVersion?: string }> }).plugins;
	const record = plugins?.get(PLUGIN_MANIFEST_ID);
	return record?.version ?? "unknown";
}
function runningDwcVersion(): string {
	try { return (globalThis as { DWC?: { version?: string } }).DWC?.version ?? "unknown"; } catch { return "unknown"; }
}

const scope = reactive({ system: true, macros: true, filaments: true, objectModel: true, diagnostics: true });
const scopeValid = computed(() => Object.values(scope).some(Boolean));

const destination = ref<BackupDestinationId>("local");
const redact = ref(getRedactPreference(destination.value));
watch(destination, (d) => { redact.value = getRedactPreference(d); });
watch(redact, (v) => setRedactPreference(destination.value, v));

const DESTINATION_IDS: Array<BackupDestinationId> = ["local", "duet", "github", "drive", "dropbox", "webdav"];
const DESTINATION_LABEL_KEYS: Record<BackupDestinationId, string> = {
	local: "plugins.flexibleLayouts.configBackup.create.destinationLocal",
	duet: "plugins.flexibleLayouts.configBackup.create.destinationDuet",
	github: "plugins.flexibleLayouts.configBackup.create.destinationGithub",
	drive: "plugins.flexibleLayouts.configBackup.create.destinationDrive",
	dropbox: "plugins.flexibleLayouts.configBackup.create.destinationDropbox",
	webdav: "plugins.flexibleLayouts.configBackup.create.destinationWebdav",
};
const destinationLabel = computed(() => i18n.global.t(DESTINATION_LABEL_KEYS[destination.value]));

/** Whether a destination has its credentials saved (configured in the "Cloud backup configuration"
 * tab). Local never needs configuration. */
function isDestinationConfigured(id: BackupDestinationId): boolean {
	switch (id) {
		case "local": return true;
		// getDuetCloudApiUrl() always has a value now (falls back to the shared default) - signing in
		// (a session) is what actually reflects the user having done anything here.
		case "duet": return getDuetCloudSession() != null;
		case "github": return getGithubSettings() != null;
		case "drive": return isOriginSupported() && getGoogleDriveClientId() != null;
		case "dropbox": return getDropboxSettings() != null;
		case "webdav": return getWebDavSettings() != null;
		default: return false;
	}
}

// Configuration is saved on a different tab (Vuetify's v-window keeps every tab's component mounted
// rather than remounting on switch), so a plain computed here would go stale the moment the user
// configures a destination and comes back. `active` (passed by ConfigBackupPage, true while this is
// the visible tab) bumps `refreshTick` to force these to re-read localStorage on every return visit.
const props = defineProps<{ active?: boolean }>();
const refreshTick = ref(0);
watch(() => props.active, (active) => { if (active) { refreshTick.value++; } });

const destinationOptions = computed(() => {
	void refreshTick.value;
	return DESTINATION_IDS.map((id) => ({ id, label: i18n.global.t(DESTINATION_LABEL_KEYS[id]), configured: isDestinationConfigured(id) }));
});
const destinationConfigured = computed(() => {
	void refreshTick.value;
	return isDestinationConfigured(destination.value);
});

const lastBackupText = computed(() => {
	void refreshTick.value;
	const iso = getLastBackupAt();
	if (!iso) { return i18n.global.t("plugins.flexibleLayouts.configBackup.create.lastBackupNever"); }
	const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
	return days <= 0
		? i18n.global.t("plugins.flexibleLayouts.configBackup.create.lastBackupToday")
		: i18n.global.t("plugins.flexibleLayouts.configBackup.create.lastBackupDaysAgo", { count: days });
});

const busy = ref(false);
const stage = ref<BackupProgressStage | null>(null);
const stageDone = ref(0);
const stageTotal = ref(1);
const error = ref<string | null>(null);
const result = ref<Awaited<ReturnType<typeof buildArchive>> | null>(null);

const progressPct = computed(() => (stageTotal.value > 0 ? (stageDone.value / stageTotal.value) * 100 : 0));
const STAGE_KEYS: Record<BackupProgressStage, string> = {
	listing: "plugins.flexibleLayouts.configBackup.create.stageListing",
	reading: "plugins.flexibleLayouts.configBackup.create.stageReading",
	"object-model": "plugins.flexibleLayouts.configBackup.create.stageObjectModel",
	diagnostics: "plugins.flexibleLayouts.configBackup.create.stageDiagnostics",
	packaging: "plugins.flexibleLayouts.configBackup.create.stagePackaging",
};
const stageLabel = computed(() => (stage.value ? i18n.global.t(STAGE_KEYS[stage.value]) : ""));

interface UnredactedDialogState { open: boolean; count: number; entries: Array<RedactionEntry>; resolve: ((choice: "redact" | "send" | "cancel") => void) | null }
const unredactedDialog = reactive<UnredactedDialogState>({ open: false, count: 0, entries: [], resolve: null });

function askUnredacted(entries: Array<RedactionEntry>): Promise<"redact" | "send" | "cancel"> {
	return new Promise((resolve) => {
		unredactedDialog.count = entries.length;
		unredactedDialog.entries = entries;
		unredactedDialog.open = true;
		unredactedDialog.resolve = (choice) => { unredactedDialog.open = false; unredactedDialog.resolve = null; resolve(choice); };
	});
}

interface PublicRepoDialogState { open: boolean; typed: string; resolve: ((ok: boolean) => void) | null }
const publicRepoDialog = reactive<PublicRepoDialogState>({ open: false, typed: "", resolve: null });
function askPublicRepoConfirm(): Promise<boolean> {
	return new Promise((resolve) => {
		publicRepoDialog.typed = "";
		publicRepoDialog.open = true;
		publicRepoDialog.resolve = (ok) => { publicRepoDialog.open = false; publicRepoDialog.resolve = null; resolve(ok); };
	});
}

function formatSize(bytes: number): string {
	if (bytes < 1024) { return `${bytes} B`; }
	if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// --- Redaction exclusions (dwc-config-backup-core's REDACTION-EXCLUSIONS-PLAN.md §6.2) -----------
//
// No in-place re-scan (plan §6.2 option (b), recommended): `collected` is a local inside onCreate()
// and is gone by the time this list is on screen, and a redacted `result` has no recoverable
// originals to re-scan anyway. Exclude -> persist -> toast; the change applies on the NEXT backup.

const exclusions = ref<Array<string>>(getRedactionExclusions());
const toast = reactive<{ open: boolean; text: string }>({ open: false, text: "" });

function onExclude(name: string): void {
	addRedactionExclusion(name);
	exclusions.value = getRedactionExclusions();
	toast.text = i18n.global.t("plugins.flexibleLayouts.configBackup.redaction.excludeToast", { name });
	toast.open = true;
}
function onRemoveExclusion(name: string): void {
	removeRedactionExclusion(name);
	exclusions.value = getRedactionExclusions();
}

async function onCreate(): Promise<void> {
	error.value = null;
	result.value = null;
	busy.value = true;
	try {
		const io = defaultMachineIO();
		const model = machineStore.model as unknown;
		const identity = buildMachineIdentity(model);
		const directories = buildLiveDirectories(model);

		const collected = await collectAll(io, {
			scope, maxFileBytes: DEFAULT_MAX_FILE_BYTES, directories, model, boards: identity.boards,
			onProgress: (s, done, total) => { stage.value = s; stageDone.value = done; stageTotal.value = Math.max(total, 1); },
		});

		const pluginVersion = installedVersion();
		const dwcVersion = runningDwcVersion();

		// Same source for both calls below (REDACTION-EXCLUSIONS-PLAN.md §6.2 step 3, in
		// dwc-config-backup-core) - the dry-run preview and the real archive must agree on what's
		// excluded, or the preview could promise a redaction the real backup then skips (or vice versa).
		const excludedNames = new Set(getRedactionExclusions());

		let useRedact = redact.value;
		if (!useRedact && destination.value !== "local" && !hasAcknowledgedUnredacted(destination.value)) {
			// Dry-run scan so the warning can name exactly what's in the backup, regardless of the switch.
			const dryRun = await buildArchive(collected, { redact: false, scope, machine: identity, directories, pluginVersion, dwcVersion, excludedNames });
			if (dryRun.redactions.entries.length > 0) {
				const choice = await askUnredacted(dryRun.redactions.entries);
				if (choice === "cancel") { busy.value = false; return; }
				if (choice === "redact") { useRedact = true; }
				if (choice === "send") { setAcknowledgedUnredacted(destination.value); }
			}
		}

		const built = await buildArchive(collected, { redact: useRedact, scope, machine: identity, directories, pluginVersion, dwcVersion, excludedNames });
		result.value = built;

		if (destination.value === "local") {
			downloadArchive(built.blob, identity.hostname);
		} else if (destination.value === "duet") {
			await sendToDuetCloud(built, identity);
		} else if (destination.value === "github") {
			await sendToGithub(built, identity, useRedact);
		} else if (destination.value === "drive") {
			await sendToDrive(built, identity);
		} else if (destination.value === "dropbox") {
			await sendToDropbox(built, identity);
		} else if (destination.value === "webdav") {
			await sendToWebdav(built, identity);
		}
		setLastBackupAt(new Date().toISOString());
		addBackedUpMachineKey(built.manifest.machine.machineKey);
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
	} finally {
		busy.value = false;
		stage.value = null;
	}
}

async function sendToDuetCloud(built: Awaited<ReturnType<typeof buildArchive>>, identity: ReturnType<typeof buildMachineIdentity>): Promise<void> {
	const apiUrl = getDuetCloudApiUrl();
	const preflight = preflightSize(built.blob);
	if (!preflight.ok) {
		throw new Error(`This backup is ${(preflight.size / (1024 * 1024)).toFixed(2)} MB, over the 2 MB limit for the cloud service. Try dropping the object model dump or M122 diagnostics, or download it locally instead.`);
	}
	const machineKey = built.manifest.machine.machineKey;
	await duetUploadBackup(apiUrl, built.blob, { machine: built.manifest.machine.firmware.electronics, hostname: identity.hostname, guid: machineKey });
	await pruneToLimit(apiUrl, machineKey, getDuetCloudFifoLimit());
}

async function sendToGithub(built: Awaited<ReturnType<typeof buildArchive>>, identity: ReturnType<typeof buildMachineIdentity>, isRedacted: boolean): Promise<void> {
	const settings = getGithubSettings();
	if (!settings) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel.value })); }
	if (!isRedacted) {
		const priv = await isRepoPrivate(settings.token, settings.repo);
		if (priv === false) {
			const ok = await askPublicRepoConfirm();
			if (!ok) { return; }
		}
	}
	const files = built.manifest.files.map((f) => ({
		path: f.path.replace(/^files\//, ""),
		content: f.binary ? "" : "", // filled from archive text below
		binary: f.binary,
	}));
	// Pull the actual text back out of the freshly-built zip via a re-read - buildArchive doesn't
	// keep a Map of contents by design (it streams straight into JSZip), so re-parse the blob once.
	const parsed = await readArchive(built.blob);
	for (const f of files) {
		const full = `files/${f.path}`;
		f.content = parsed.textFiles.get(full) ?? "";
	}
	// GitHub keys backups by a human-readable folder path, not the hardware GUID Duet Cloud uses - so
	// two machines that happen to share a hostname would collide in the same folder without a
	// disambiguator. An explicit "Machine name" override is used verbatim (the user picked it on
	// purpose); otherwise default to hostname + a short hash of the real machine key.
	const machineFolder = settings.machineName || defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await pushBackup({
		token: settings.token, repo: settings.repo, branch: settings.branch || "main",
		machineFolder, files,
		// Stable filename (not timestamped): each push OVERWRITES this one blob rather than
		// accumulating a new zip per backup. Git still keeps every past version reachable via commit
		// history - the Configuration tab's GitHub "backup history" browser lists exactly this, via
		// `GET /repos/{repo}/commits?path=machines/<name>/backup.zip` (destinations/github.ts's
		// listBackupHistory), one entry per past backup, and restores any of them.
		zip: { path: "backup.zip", blob: built.blob },
		message: `Config backup ${settings.machineName || identity.hostname} ${built.manifest.createdAt}`,
	});
}

async function sendToDrive(built: Awaited<ReturnType<typeof buildArchive>>, identity: ReturnType<typeof buildMachineIdentity>): Promise<void> {
	const clientId = getGoogleDriveClientId();
	if (!isOriginSupported() || !clientId) {
		throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel.value }));
	}
	const token = await signIn(clientId);
	// Drive folders are found-or-created by this exact name, same hostname-only collision risk as
	// Dropbox/WebDAV - see the comment on GitHub's machineFolder above.
	const machineFolder = defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await driveUploadBackup(token, machineFolder, backupFilename(identity.hostname), built.blob);
}

async function sendToDropbox(built: Awaited<ReturnType<typeof buildArchive>>, identity: ReturnType<typeof buildMachineIdentity>): Promise<void> {
	const settings = getDropboxSettings();
	if (!settings) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel.value })); }
	// Dropbox has no manual-override field (unlike GitHub), so it always gets the disambiguated
	// default - see the comment on GitHub's machineFolder above.
	const machineFolder = defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await dropboxUploadBackup(settings.token, machineFolder, backupFilename(identity.hostname), built.blob);
}

async function sendToWebdav(built: Awaited<ReturnType<typeof buildArchive>>, identity: ReturnType<typeof buildMachineIdentity>): Promise<void> {
	const settings = getWebDavSettings();
	if (!settings) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: destinationLabel.value })); }
	const machineFolder = defaultMachineFolder(identity.hostname, built.manifest.machine.machineKey);
	await webdavUploadBackup(settings.url, settings.username, settings.password, machineFolder, backupFilename(identity.hostname), built.blob);
}
</script>
