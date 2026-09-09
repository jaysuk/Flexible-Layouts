<template>
	<v-card flat>
		<v-card-text>
			<div class="text-caption text-medium-emphasis mb-3">{{ lastBackupText }}</div>
			<v-alert v-if="lastAttemptFailedText" type="error" variant="tonal" density="compact" class="mb-3">
				{{ lastAttemptFailedText }}
			</v-alert>

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

			<div class="d-flex align-center ga-2 mb-1">
				<v-switch v-model="encrypt" density="compact" hide-details color="warning" />
				<span class="text-body-2">{{ $t("plugins.flexibleLayouts.configBackup.create.encryptSwitch") }}</span>
				<HelpTip :text="$t('plugins.flexibleLayouts.configBackup.create.encryptHelp')" />
			</div>
			<v-alert type="info" variant="tonal" density="compact" class="mb-3">
				{{ $t("plugins.flexibleLayouts.configBackup.create.encryptHelp") }}
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

			<v-progress-linear v-if="busy" :indeterminate="waitingForDriveSignIn" :model-value="progressPct" class="mt-3" />
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

		<v-dialog v-model="passwordDialog.open" max-width="480" persistent>
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.configBackup.create.encryptPasswordTitle") }}</v-card-title>
				<v-card-text>
					<p class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.configBackup.create.encryptPasswordBody") }}</p>
					<v-text-field v-model="passwordDialog.password" type="password"
								  :label="$t('plugins.flexibleLayouts.configBackup.create.encryptPasswordLabel')"
								  density="compact" variant="outlined" hide-details class="mb-3" autofocus />
					<v-text-field v-model="passwordDialog.confirm" type="password"
								  :label="$t('plugins.flexibleLayouts.configBackup.create.encryptPasswordConfirmLabel')"
								  density="compact" variant="outlined" hide-details class="mb-2"
								  @keyup.enter="confirmPasswordDialog" />
					<div v-if="passwordDialog.password && passwordDialog.confirm && passwordDialog.password !== passwordDialog.confirm"
						 class="text-caption text-error mb-2">
						{{ $t("plugins.flexibleLayouts.configBackup.create.encryptPasswordMismatch") }}
					</div>
					<v-checkbox v-model="passwordDialog.remember" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.configBackup.create.encryptPasswordRemember')" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="cancelPasswordDialog">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
					<v-btn variant="text" color="primary" :disabled="!passwordDialogValid" @click="confirmPasswordDialog">
						{{ $t("plugins.flexibleLayouts.configBackup.create.encryptPasswordConfirmButton") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<v-snackbar v-model="toast.open" :timeout="4000">{{ toast.text }}</v-snackbar>

		<GoogleDriveSignInDialog />
	</v-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import { HelpTip } from "dwc-plugin-runtime";

import i18n from "@/i18n";

import type { BackupProgressStage, RedactionEntry } from "dwc-config-backup-core";
import type { BackupDestinationId } from "dwc-config-backup-core";
import {
	addRedactionExclusion, getDropboxSettings, getDuetCloudSession, getEncryptPreference, getGithubSettings,
	getGoogleDriveSettings, getLastBackupAt, getLastBackupAttempt, getRedactionExclusions, getRedactPreference,
	getWebDavSettings, removeRedactionExclusion, setAcknowledgedUnredacted, setEncryptPreference, setRedactPreference,
} from "dwc-config-backup-core";
import { collectForBackup, runBackup } from "../model/configBackup/runBackup";
import type { BuiltArchive, RunBackupConfig } from "../model/configBackup/runBackup";
import { DESTINATION_IDS, DESTINATION_LABEL_KEYS } from "../model/configBackup/constants";
import { useDriveSignInPromptState } from "../composables/useDriveSignInPrompt";
import RedactionSummary from "./RedactionSummary.vue";
import GoogleDriveSignInDialog from "./GoogleDriveSignInDialog.vue";

const scope = reactive({ system: true, macros: true, filaments: true, objectModel: true, diagnostics: true });
const scopeValid = computed(() => Object.values(scope).some(Boolean));

const destination = ref<BackupDestinationId>("local");
const redact = ref(getRedactPreference(destination.value));
watch(destination, (d) => { redact.value = getRedactPreference(d); });
watch(redact, (v) => setRedactPreference(destination.value, v));

const encrypt = ref(getEncryptPreference(destination.value));
watch(destination, (d) => { encrypt.value = getEncryptPreference(d); });
watch(encrypt, (v) => setEncryptPreference(destination.value, v));

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
		case "drive": return getGoogleDriveSettings() != null;
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

// SCHEDULED-BACKUPS-PLAN.md §4.4 item 2: a persistent "last attempt failed" state, not just a
// transient toast - so a failure is still discoverable after the fact, not only visible to someone
// watching the screen at the moment it happened. Only shown when the LAST attempt was a failure; a
// successful last attempt is already covered by `lastBackupText` above, and repeating it here would
// just be noise.
const lastAttemptFailedText = computed(() => {
	void refreshTick.value;
	const attempt = getLastBackupAttempt();
	if (!attempt || attempt.ok) { return null; }
	const destinationText = i18n.global.t(DESTINATION_LABEL_KEYS[attempt.destination]);
	const days = Math.floor((Date.now() - new Date(attempt.at).getTime()) / (24 * 60 * 60 * 1000));
	return days <= 0
		? i18n.global.t("plugins.flexibleLayouts.configBackup.create.lastAttemptFailedToday", { destination: destinationText, message: attempt.message ?? "" })
		: i18n.global.t("plugins.flexibleLayouts.configBackup.create.lastAttemptFailedDaysAgo", { count: days, destination: destinationText, message: attempt.message ?? "" });
});

const busy = ref(false);
const stage = ref<BackupProgressStage | null>(null);
const stageDone = ref(0);
const stageTotal = ref(1);
const error = ref<string | null>(null);
const result = ref<BuiltArchive | null>(null);

const progressPct = computed(() => (stageTotal.value > 0 ? (stageDone.value / stageTotal.value) * 100 : 0));
const STAGE_KEYS: Record<BackupProgressStage, string> = {
	listing: "plugins.flexibleLayouts.configBackup.create.stageListing",
	reading: "plugins.flexibleLayouts.configBackup.create.stageReading",
	"object-model": "plugins.flexibleLayouts.configBackup.create.stageObjectModel",
	diagnostics: "plugins.flexibleLayouts.configBackup.create.stageDiagnostics",
	packaging: "plugins.flexibleLayouts.configBackup.create.stagePackaging",
};
// Real reported bug: `stage`/`stageDone`/`stageTotal` only ever get updated by collectForBackup's OWN
// progress callback, which stops firing once collection finishes - so a Drive backup waiting on the
// user to complete sign-in (which can take a while, or never happen at all) left this stuck showing
// whatever the LAST collection stage was ("Packaging archive…") indefinitely, with no indication
// anything was actually waiting on the user. Overrides the stale label/bar with a live one while the
// sign-in prompt is open, reusing useDriveSignInPromptState() (already the source of truth for whether
// a sign-in is in progress) rather than adding a second, parallel "waiting" flag to keep in sync.
const waitingForDriveSignIn = computed(() => useDriveSignInPromptState().open);
const stageLabel = computed(() => {
	if (waitingForDriveSignIn.value) { return i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInWaitingStage"); }
	return stage.value ? i18n.global.t(STAGE_KEYS[stage.value]) : "";
});

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

// --- Backup encryption password (ENCRYPTED-BACKUPS-PLAN.md §5.2) ---------------------------------
//
// Typed fresh per backup by default - a backup is a historical artifact (one taken today must still
// open in 6 months even if the "current" password has since changed), so this deliberately does NOT
// reuse the credential-store's persistent session-unlock model. `rememberedPassword` is the one
// narrow exception: in-memory only, never localStorage, cleared on reload - purely a convenience for
// taking several backups in one sitting.

const rememberedPassword = ref<string | null>(null);

interface PasswordDialogState { open: boolean; password: string; confirm: string; remember: boolean; resolve: ((password: string | null) => void) | null }
const passwordDialog = reactive<PasswordDialogState>({ open: false, password: "", confirm: "", remember: false, resolve: null });
const passwordDialogValid = computed(() => passwordDialog.password.length > 0 && passwordDialog.password === passwordDialog.confirm);

function askEncryptPassword(): Promise<string | null> {
	return new Promise((resolve) => {
		passwordDialog.password = "";
		passwordDialog.confirm = "";
		passwordDialog.remember = false;
		passwordDialog.open = true;
		passwordDialog.resolve = (password) => { passwordDialog.open = false; passwordDialog.resolve = null; resolve(password); };
	});
}
function confirmPasswordDialog(): void {
	if (!passwordDialogValid.value) { return; }
	if (passwordDialog.remember) { rememberedPassword.value = passwordDialog.password; }
	passwordDialog.resolve?.(passwordDialog.password);
}
function cancelPasswordDialog(): void {
	passwordDialog.resolve?.(null);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) { return `${bytes} B`; }
	if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// --- Redaction exclusions (REDACTION-EXCLUSIONS-PLAN.md §6.2) -------------------------------------
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

/**
 * Orchestrates the headless `collectForBackup()`/`runBackup()` pair (SCHEDULED-BACKUPS-PLAN.md §4.1)
 * exactly the way the pre-refactor inline `onCreate()` did: ask for the encryption password up front
 * (before the slow collection work), collect once, then resolve whichever dialog `runBackup` says it
 * needs - re-calling it with the answer folded in - until it either succeeds or fails for real. Each
 * dialog resolution re-uses the SAME `collected` data from the one `collectForBackup()` call, so no
 * dialog firing ever causes a second, slower walk of the printer's filesystem.
 */
async function onCreate(): Promise<void> {
	error.value = null;
	result.value = null;
	busy.value = true;
	try {
		// Ask for the encryption password FIRST, before the (potentially slow) collection/build work -
		// better to interrupt the user upfront than after they've waited through the whole process.
		let encryptPassword: string | undefined;
		if (encrypt.value) {
			encryptPassword = rememberedPassword.value ?? (await askEncryptPassword()) ?? undefined;
			if (encryptPassword == null) { return; } // cancelled
		}

		const prepared = await collectForBackup(scope, (s, done, total) => {
			stage.value = s; stageDone.value = done; stageTotal.value = Math.max(total, 1);
		});

		let config: RunBackupConfig = {
			destination: destination.value, scope, redact: redact.value, encrypt: encrypt.value, encryptPassword,
		};

		let res = await runBackup(prepared, config);
		while (!res.ok && res.reason === "needsInput") {
			if (res.needsInputKind === "encryptPassword") {
				// Shouldn't happen on this path (the password is already resolved above), but handle it
				// rather than looping forever if it ever does.
				const password = await askEncryptPassword();
				if (password == null) { return; } // cancelled
				config = { ...config, encryptPassword: password };
			} else if (res.needsInputKind === "unredacted") {
				const choice = await askUnredacted(res.unredactedEntries ?? []);
				if (choice === "cancel") { return; }
				if (choice === "redact") { config = { ...config, redact: true }; }
				if (choice === "send") { setAcknowledgedUnredacted(destination.value); }
			} else if (res.needsInputKind === "publicRepo") {
				const ok = await askPublicRepoConfirm();
				if (!ok) { return; }
				config = { ...config, publicRepoConfirmed: true };
			}
			res = await runBackup(prepared, config);
		}

		if (!res.ok) {
			error.value = res.message;
			return;
		}
		result.value = res.built;
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
	} finally {
		busy.value = false;
		stage.value = null;
	}
}
</script>
