<template>
	<v-card flat>
		<v-card-text>
			<div class="text-caption text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.configBackup.cloud.configIntro") }}</div>

			<!-- Import from the standalone plugin, same browser, no HTTPS needed -->
			<v-card v-if="standalonePluginLoaded" variant="outlined" class="mb-4">
				<v-card-text>
					<div class="d-flex align-center ga-2 mb-2">
						<v-icon size="18">mdi-database-import-outline</v-icon>
						<span class="text-body-2 font-weight-medium">{{ $t("plugins.flexibleLayouts.configBackup.migrate.heading") }}</span>
					</div>

					<v-alert v-if="standaloneEncrypted" type="info" variant="tonal" density="compact">
						{{ $t("plugins.flexibleLayouts.configBackup.migrate.sourceEncrypted") }}
					</v-alert>
					<div v-else-if="!migratableCreds" class="text-caption text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.configBackup.migrate.nothingFound") }}
					</div>
					<template v-else>
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.migrate.intro") }}</div>
						<v-alert v-if="encryptionEnabled && !sessionUnlocked" type="warning" variant="tonal" density="compact" class="mb-2">
							{{ $t("plugins.flexibleLayouts.configBackup.migrate.unlockFirst") }}
						</v-alert>
						<v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-database-import-outline"
							   :disabled="encryptionEnabled && !sessionUnlocked" :loading="migrateBusy" @click="onMigrateImport">
							{{ $t("plugins.flexibleLayouts.configBackup.migrate.importButton") }}
						</v-btn>
					</template>
					<v-alert v-if="migrateStatus" :type="migrateStatus.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-2">
						{{ migrateStatus.message }}
					</v-alert>
				</v-card-text>
			</v-card>

			<!-- Credential storage & encryption -->
			<v-card variant="outlined" class="mb-4">
				<v-card-text>
					<div class="d-flex align-center ga-2 mb-2">
						<v-icon size="18">mdi-shield-key-outline</v-icon>
						<span class="text-body-2 font-weight-medium">{{ $t("plugins.flexibleLayouts.configBackup.encryption.heading") }}</span>
					</div>

					<v-alert v-if="!encryptionAvailable" type="warning" variant="tonal" density="compact" class="mb-2">
						{{ $t("plugins.flexibleLayouts.configBackup.encryption.unavailable") }}
					</v-alert>

					<template v-else-if="!encryptionEnabled">
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.encryption.introOff") }}</div>
						<v-btn size="small" variant="tonal" prepend-icon="mdi-lock-plus-outline" @click="setDialogOpen = true">
							{{ $t("plugins.flexibleLayouts.configBackup.encryption.enableButton") }}
						</v-btn>
					</template>

					<template v-else>
						<div class="d-flex align-center ga-2 mb-2">
							<v-chip size="x-small" :color="sessionUnlocked ? 'success' : 'warning'" variant="tonal">
								{{ sessionUnlocked
									? $t("plugins.flexibleLayouts.configBackup.encryption.unlockedNote")
									: $t("plugins.flexibleLayouts.configBackup.encryption.lockedNote") }}
							</v-chip>
						</div>
						<div class="d-flex flex-wrap ga-2 mb-2">
							<v-btn v-if="!sessionUnlocked" size="small" variant="tonal" prepend-icon="mdi-lock-open-outline" @click="unlockDialogOpen = true">
								{{ $t("plugins.flexibleLayouts.configBackup.encryption.unlockButton") }}
							</v-btn>
							<v-btn v-else size="small" variant="text" prepend-icon="mdi-lock-outline" @click="onLockNow">
								{{ $t("plugins.flexibleLayouts.configBackup.encryption.lockButton") }}
							</v-btn>
							<v-btn v-if="sessionUnlocked" size="small" variant="text" color="error" @click="onDisableEncryption">
								{{ $t("plugins.flexibleLayouts.configBackup.encryption.disableButton") }}
							</v-btn>
						</div>
					</template>

					<v-divider class="my-3" />

					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.encryption.sdIntro") }}</div>
					<div class="d-flex flex-wrap ga-2">
						<v-btn size="small" variant="tonal" prepend-icon="mdi-content-save-outline" :disabled="!encryptionEnabled" :loading="sdSaving"
							   @click="onSaveToSd">
							{{ $t("plugins.flexibleLayouts.configBackup.encryption.saveToSdButton") }}
						</v-btn>
						<v-btn size="small" variant="tonal" prepend-icon="mdi-tray-arrow-down" :loading="sdLoading" @click="onLoadFromSd">
							{{ $t("plugins.flexibleLayouts.configBackup.encryption.loadFromSdButton") }}
						</v-btn>
					</div>
					<v-alert v-if="sdStatus" :type="sdStatus.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-2">
						{{ sdStatus.message }}
					</v-alert>

					<v-divider class="my-3" />

					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.encryption.fileIntro") }}</div>
					<div class="d-flex flex-wrap ga-2">
						<v-btn size="small" variant="tonal" prepend-icon="mdi-file-download-outline" :disabled="!encryptionEnabled" @click="onExportFile">
							{{ $t("plugins.flexibleLayouts.configBackup.encryption.exportFileButton") }}
						</v-btn>
						<v-btn size="small" variant="tonal" prepend-icon="mdi-file-upload-outline" @click="pickImportFile">
							{{ $t("plugins.flexibleLayouts.configBackup.encryption.importFileButton") }}
						</v-btn>
					</div>
					<input ref="importFileInput" type="file" accept=".json" class="d-none" @change="onImportFileSelected" />
					<v-alert v-if="fileStatus" :type="fileStatus.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-2">
						{{ fileStatus.message }}
					</v-alert>
				</v-card-text>
			</v-card>

			<!-- Automatic backup reminders -->
			<v-card variant="outlined" class="mb-4">
				<v-card-text>
					<div class="d-flex align-center ga-2 mb-2">
						<v-icon size="18">mdi-bell-outline</v-icon>
						<span class="text-body-2 font-weight-medium">{{ $t("plugins.flexibleLayouts.configBackup.nudge.settingsHeading") }}</span>
					</div>
					<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.nudge.settingsIntro") }}</div>
					<v-checkbox v-model="nudgeConfigSaved" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.configBackup.nudge.triggerConfigSaved')" @update:model-value="saveNudgeSettings" />
					<v-checkbox v-model="nudgeNewMachine" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.configBackup.nudge.triggerNewMachine')" @update:model-value="saveNudgeSettings" />
					<v-checkbox v-model="nudgeOverdue" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.configBackup.nudge.triggerOverdue')" @update:model-value="saveNudgeSettings" />
					<v-text-field v-if="nudgeOverdue" v-model.number="nudgeOverdueDays" type="number" min="1" max="90" density="compact"
								  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.configBackup.nudge.triggerOverdueDays')"
								  style="max-width: 260px;" class="mt-2 ms-8" @update:model-value="saveNudgeSettings" />
				</v-card-text>
			</v-card>

			<v-alert v-if="encryptionEnabled && !sessionUnlocked" type="info" variant="tonal" density="compact" class="mb-4">
				{{ $t("plugins.flexibleLayouts.configBackup.encryption.destinationsLockedNote") }}
			</v-alert>

			<!-- Destination panels are hidden (not just disabled) while locked - saved credentials are
				 encrypted, so their fields would just be blank, and any edits would silently not
				 persist (setJson() no-ops while locked - see credentials.ts) rather than fail loudly. -->
			<v-expansion-panels v-if="!encryptionEnabled || sessionUnlocked" variant="accordion">
				<!-- Duet backup service -->
				<v-expansion-panel>
					<v-expansion-panel-title>
						<v-icon size="18" class="me-2">mdi-cloud-outline</v-icon>
						{{ $t("plugins.flexibleLayouts.configBackup.cloud.duetHeading") }}
						<v-chip size="x-small" class="ms-2" :color="duetSession ? 'success' : undefined" variant="tonal">
							{{ duetSession ? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote") : $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
						</v-chip>
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<div class="mb-3">
							<v-btn size="small" variant="tonal" prepend-icon="mdi-book-open-variant" @click="emit('help', 'duet')">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.setupInstructions") }}
							</v-btn>
						</div>
						<template v-if="!duetSession">
							<v-text-field v-model="duetEmail" :label="$t('plugins.flexibleLayouts.configBackup.cloud.email')"
										  density="compact" variant="outlined" hide-details class="mb-2" />
							<v-text-field v-model="duetPassword" :label="$t('plugins.flexibleLayouts.configBackup.cloud.password')" type="password"
										  density="compact" variant="outlined" hide-details class="mb-2" />
							<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.cloud.loginHelp") }}</div>
							<v-btn color="primary" :loading="duetLoggingIn" @click="onDuetLogin">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.loginButton") }}
							</v-btn>
						</template>
						<template v-else>
							<div class="d-flex align-center ga-2 mb-3">
								<span class="text-body-2">{{ $t("plugins.flexibleLayouts.configBackup.cloud.signedInAs", { username: duetSession.username }) }}</span>
								<v-spacer />
								<v-btn size="small" variant="text" @click="onDuetLogout">{{ $t("plugins.flexibleLayouts.configBackup.cloud.logoutButton") }}</v-btn>
							</div>
							<v-text-field v-model.number="duetFifoLimit" type="number" min="1" max="20" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.configBackup.cloud.fifoLimitLabel')" style="max-width: 260px;" class="mb-3"
										  @update:model-value="setDuetCloudFifoLimit(duetFifoLimit)" />
							<v-btn size="small" variant="tonal" prepend-icon="mdi-open-in-new" :href="DUET_BACKUP_WEB_URL" target="_blank" rel="noopener" class="mb-2">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.viewOnlineButton") }}
							</v-btn>
							<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.configBackup.cloud.browseInRestoreTab") }}</div>
						</template>
						<v-alert v-if="duetError" type="error" variant="tonal" density="compact" class="mt-3">{{ duetError }}</v-alert>
					</v-expansion-panel-text>
				</v-expansion-panel>

				<!-- GitHub -->
				<v-expansion-panel>
					<v-expansion-panel-title>
						<v-icon size="18" class="me-2">mdi-github</v-icon>
						{{ $t("plugins.flexibleLayouts.configBackup.github.heading") }}
						<v-chip size="x-small" class="ms-2" :color="githubConfigured ? 'success' : undefined" variant="tonal">
							{{ githubConfigured ? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote") : $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
						</v-chip>
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<div class="mb-3">
							<v-btn size="small" variant="tonal" prepend-icon="mdi-book-open-variant" @click="emit('help', 'github')">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.setupInstructions") }}
							</v-btn>
						</div>
						<v-text-field v-model="githubRepo" :label="$t('plugins.flexibleLayouts.configBackup.github.repoLabel')"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<v-text-field v-model="githubBranch" :label="$t('plugins.flexibleLayouts.configBackup.github.branchLabel')"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<v-text-field v-model="githubToken" :label="$t('plugins.flexibleLayouts.configBackup.github.tokenLabel')" type="password"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.github.tokenHelp") }}</div>
						<v-text-field v-model="githubMachineName" :label="$t('plugins.flexibleLayouts.configBackup.github.machineNameLabel')"
									  :placeholder="thisHostname" density="compact" variant="outlined" hide-details class="mb-2" />
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.github.machineNameHelp") }}</div>
						<v-btn color="primary" :loading="githubVerifying" @click="onSaveGithub">{{ $t("plugins.flexibleLayouts.configBackup.cloud.saveButton") }}</v-btn>
						<v-alert v-if="githubStatus" :type="githubStatus.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-3">
							{{ githubStatus.message }}
						</v-alert>
						<div class="text-caption text-medium-emphasis mt-3">{{ $t("plugins.flexibleLayouts.configBackup.github.restoreNote") }}</div>
					</v-expansion-panel-text>
				</v-expansion-panel>

				<!-- Google Drive -->
				<v-expansion-panel>
					<v-expansion-panel-title>
						<v-icon size="18" class="me-2">mdi-google-drive</v-icon>
						{{ $t("plugins.flexibleLayouts.configBackup.drive.heading") }}
						<v-chip size="x-small" class="ms-2" :color="driveConfigured ? 'success' : undefined" variant="tonal">
							{{ driveConfigured ? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote") : $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
						</v-chip>
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<div class="mb-3">
							<v-btn size="small" variant="tonal" prepend-icon="mdi-book-open-variant" @click="emit('help', 'drive')">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.setupInstructions") }}
							</v-btn>
						</div>
						<v-alert v-if="!driveOriginOk" type="warning" variant="tonal" density="compact" class="mb-3">
							{{ $t("plugins.flexibleLayouts.configBackup.drive.unavailableBody") }}
						</v-alert>
						<template v-else>
							<v-text-field v-model="driveClientId" :label="$t('plugins.flexibleLayouts.configBackup.drive.clientIdLabel')"
										  density="compact" variant="outlined" hide-details class="mb-2" />
							<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.drive.clientIdHelp") }}</div>
							<v-btn color="primary" @click="onSaveDrive">{{ $t("plugins.flexibleLayouts.configBackup.cloud.saveButton") }}</v-btn>
							<v-alert v-if="driveSaved" type="success" variant="tonal" density="compact" class="mt-3">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.saved") }}
							</v-alert>
						</template>
					</v-expansion-panel-text>
				</v-expansion-panel>

				<!-- Dropbox -->
				<v-expansion-panel>
					<v-expansion-panel-title>
						<v-icon size="18" class="me-2">mdi-dropbox</v-icon>
						{{ $t("plugins.flexibleLayouts.configBackup.cloud.dropboxHeading") }}
						<v-chip size="x-small" class="ms-2" :color="dropboxConfigured ? 'success' : undefined" variant="tonal">
							{{ dropboxConfigured ? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote") : $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
						</v-chip>
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<div class="mb-3">
							<v-btn size="small" variant="tonal" prepend-icon="mdi-book-open-variant" @click="emit('help', 'dropbox')">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.setupInstructions") }}
							</v-btn>
						</div>
						<v-text-field v-model="dropboxToken" :label="$t('plugins.flexibleLayouts.configBackup.dropbox.tokenLabel')" type="password"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.dropbox.tokenHelp") }}</div>
						<v-btn color="primary" :loading="dropboxVerifying" @click="onSaveDropbox">{{ $t("plugins.flexibleLayouts.configBackup.cloud.saveButton") }}</v-btn>
						<v-alert v-if="dropboxStatus" :type="dropboxStatus.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-3">
							{{ dropboxStatus.message }}
						</v-alert>
						<div v-if="dropboxConfigured" class="text-caption text-medium-emphasis mt-3">
							{{ $t("plugins.flexibleLayouts.configBackup.cloud.browseInRestoreTab") }}
						</div>
					</v-expansion-panel-text>
				</v-expansion-panel>

				<!-- WebDAV -->
				<v-expansion-panel>
					<v-expansion-panel-title>
						<v-icon size="18" class="me-2">mdi-nas</v-icon>
						{{ $t("plugins.flexibleLayouts.configBackup.cloud.webdavHeading") }}
						<v-chip size="x-small" class="ms-2" :color="webdavConfigured ? 'success' : undefined" variant="tonal">
							{{ webdavConfigured ? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote") : $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
						</v-chip>
					</v-expansion-panel-title>
					<v-expansion-panel-text>
						<div class="mb-3">
							<v-btn size="small" variant="tonal" prepend-icon="mdi-book-open-variant" @click="emit('help', 'webdav')">
								{{ $t("plugins.flexibleLayouts.configBackup.cloud.setupInstructions") }}
							</v-btn>
						</div>
						<v-text-field v-model="webdavUrl" :label="$t('plugins.flexibleLayouts.configBackup.webdav.urlLabel')"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<div class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.configBackup.webdav.urlHelp") }}</div>
						<v-text-field v-model="webdavUsername" :label="$t('plugins.flexibleLayouts.configBackup.webdav.usernameLabel')"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<v-text-field v-model="webdavPassword" :label="$t('plugins.flexibleLayouts.configBackup.webdav.passwordLabel')" type="password"
									  density="compact" variant="outlined" hide-details class="mb-2" />
						<v-alert type="info" variant="tonal" density="compact" class="mb-2">
							{{ $t("plugins.flexibleLayouts.configBackup.webdav.corsNote") }}
						</v-alert>
						<v-btn color="primary" :loading="webdavVerifying" @click="onSaveWebdav">{{ $t("plugins.flexibleLayouts.configBackup.cloud.saveButton") }}</v-btn>
						<v-alert v-if="webdavStatus" :type="webdavStatus.ok ? 'success' : 'error'" variant="tonal" density="compact" class="mt-3">
							{{ webdavStatus.message }}
						</v-alert>
						<div v-if="webdavConfigured" class="text-caption text-medium-emphasis mt-3">
							{{ $t("plugins.flexibleLayouts.configBackup.cloud.browseInRestoreTab") }}
						</div>
					</v-expansion-panel-text>
				</v-expansion-panel>
			</v-expansion-panels>
		</v-card-text>

		<PassphraseDialog v-model="setDialogOpen" mode="set" :loading="setBusy" :error="setError" @submit="onSetPassphrase" />
		<PassphraseDialog v-model="unlockDialogOpen" mode="unlock" :loading="unlockBusy" :error="unlockError" @submit="onUnlockSubmit" />
	</v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

/** Each destination's own "Setup instructions" link. The full walkthrough lives in the page's help
 *  dialog, which the page owns - previously its only entry point was one "?" icon in the page header,
 *  a long way from the section you are actually filling in, and nothing said the instructions existed
 *  at all. The section id is passed up so the dialog opens scrolled to that destination. */
const emit = defineEmits<{ help: [section: string] }>();

import { downloadBlob } from "dwc-plugin-runtime";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";
import { showConfirmDialog } from "@/composables/useConfirmDialog";
import { isPluginLoaded } from "@/plugins";

import { login as duetLoginCall, logout as duetLogoutCall } from "dwc-config-backup-core/destinations/duetCloud";
import { isRepoPrivate } from "dwc-config-backup-core/destinations/github";
import { isOriginSupported } from "dwc-config-backup-core/destinations/googleDrive";
import { verifyToken as dropboxVerify } from "dwc-config-backup-core/destinations/dropbox";
import { verifyConnection as webdavVerify } from "dwc-config-backup-core/destinations/webdav";
import {
	disableEncryption, DUET_BACKUP_WEB_URL, enableEncryption, exportEncryptedBundle, getAutoBackupNudgeSettings, getDropboxSettings,
	getDuetCloudApiUrl, getDuetCloudFifoLimit, getDuetCloudSession, getGithubSettings, getGoogleDriveClientId,
	getWebDavSettings, importEncryptedBundle, importPlaintextCredentials, isEncryptionAvailable, isEncryptionEnabled,
	isNamespaceEncrypted, isSessionUnlocked, lockSession, readPlaintextCredentials, setAutoBackupNudgeSettings,
	setDropboxSettings, setDuetCloudFifoLimit, setGithubSettings, setGoogleDriveClientId, setWebDavSettings, unlockSession,
} from "dwc-config-backup-core";
import type { DuetCloudSession } from "dwc-config-backup-core";
import { loadCredentialsFromSd, parseCredentialBundle, writeCredentialsToSd } from "dwc-config-backup-core";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { buildMachineIdentity } from "dwc-config-backup-core";
import PassphraseDialog from "./PassphraseDialog.vue";

const machineStore = useMachineStore();
const identity = buildMachineIdentity(machineStore.model as unknown);
const thisHostname = identity.hostname;

// --- Credential encryption + SD-card cross-device storage -------------------------------------------
//
// Encryption is opt-in (default off) and, when on, gates every destination panel below: getters
// return null until the session is unlocked, so there's nothing to accidentally show/leak. `crypto.
// subtle` (what this needs) requires a secure context in every real browser - unavailable on most
// plain-HTTP Duets, same restriction as Google Drive elsewhere in this plugin - `encryptionAvailable`
// surfaces that honestly instead of offering a toggle that would just fail.

const encryptionAvailable = isEncryptionAvailable();
// refreshTick forces these two to re-read module state after an async operation completes, since
// they're plain function calls (not reactive refs) wrapping credentials.ts's own module-level state.
const refreshTick = ref(0);
const encryptionEnabled = computed(() => { void refreshTick.value; return isEncryptionEnabled(); });
const sessionUnlocked = computed(() => { void refreshTick.value; return isSessionUnlocked(); });

const setDialogOpen = ref(false);
const setBusy = ref(false);
const setError = ref<string | null>(null);
async function onSetPassphrase(passphrase: string): Promise<void> {
	setBusy.value = true;
	setError.value = null;
	try {
		await enableEncryption(passphrase);
		setDialogOpen.value = false;
		refreshTick.value++;
	} catch (e) {
		setError.value = e instanceof Error ? e.message : String(e);
	} finally {
		setBusy.value = false;
	}
}

const unlockDialogOpen = ref(false);
const unlockBusy = ref(false);
const unlockError = ref<string | null>(null);
async function onUnlockSubmit(passphrase: string): Promise<void> {
	unlockBusy.value = true;
	unlockError.value = null;
	try {
		const ok = await unlockSession(passphrase);
		if (ok) {
			unlockDialogOpen.value = false;
			refreshTick.value++;
		} else {
			unlockError.value = i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.wrongPassphrase");
		}
	} finally {
		unlockBusy.value = false;
	}
}

function onLockNow(): void {
	lockSession();
	refreshTick.value++;
}
async function onDisableEncryption(): Promise<void> {
	const ok = await showConfirmDialog(
		i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.disableConfirmTitle"),
		i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.disableConfirmBody"),
		"mdi-lock-open-alert-outline",
	);
	if (!ok) { return; }
	await disableEncryption();
	refreshTick.value++;
}

// --- Import from standalone plugin (same-browser, no HTTPS needed) ----------------------------------
//
// The standalone plugin and this built-in copy each bundle their OWN copy of dwc-config-backup-core
// (FL builds as a single IIFE, no code splitting), so there's no live JS object to import from - the
// only thing genuinely shared between the two plugins in this browser is window.localStorage itself,
// read here by an explicit namespace string via credentialsMigrate.ts. This is the path that still
// works on plain-HTTP Duets, where crypto.subtle (what the SD-card/file export needs) is unavailable.
const STANDALONE_PLUGIN_ID = "DuetConfigBackup"; // duet-config-backup-plugin's plugin.json id
const STANDALONE_NAMESPACE = "duetConfigBackup"; // that plugin's own configureHost({ storageNamespace })

const standalonePluginLoaded = isPluginLoaded(STANDALONE_PLUGIN_ID);
const standaloneEncrypted = computed(() => {
	void refreshTick.value;
	return standalonePluginLoaded && isNamespaceEncrypted(STANDALONE_NAMESPACE);
});
const migratableCreds = computed(() => {
	void refreshTick.value;
	return standalonePluginLoaded ? readPlaintextCredentials(STANDALONE_NAMESPACE) : null;
});

const migrateBusy = ref(false);
const migrateStatus = ref<{ ok: boolean; message: string } | null>(null);

async function onMigrateImport(): Promise<void> {
	const creds = migratableCreds.value;
	if (!creds) { return; }
	const found = [
		creds.duetSession && i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.duetHeading"),
		creds.github && i18n.global.t("plugins.flexibleLayouts.configBackup.github.heading"),
		creds.dropbox && i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.dropboxHeading"),
		creds.webdav && i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.webdavHeading"),
		creds.googleDriveClientId && i18n.global.t("plugins.flexibleLayouts.configBackup.drive.heading"),
	].filter((v): v is string => !!v);
	const ok = await showConfirmDialog(
		i18n.global.t("plugins.flexibleLayouts.configBackup.migrate.confirmTitle"),
		i18n.global.t("plugins.flexibleLayouts.configBackup.migrate.confirmBody", { destinations: found.join(", ") }),
		"mdi-database-import-outline",
	);
	if (!ok) { return; }
	migrateBusy.value = true;
	migrateStatus.value = null;
	try {
		importPlaintextCredentials(creds);
		reseedDestinationFields();
		refreshTick.value++;
		migrateStatus.value = { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.migrate.imported") };
	} finally {
		migrateBusy.value = false;
	}
}

const sdSaving = ref(false);
const sdLoading = ref(false);
const sdStatus = ref<{ ok: boolean; message: string } | null>(null);

async function onSaveToSd(): Promise<void> {
	sdStatus.value = null;
	if (!machineStore.isConnected) {
		sdStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.offline") };
		return;
	}
	sdSaving.value = true;
	try {
		const result = await writeCredentialsToSd(defaultMachineIO());
		sdStatus.value = result === "written"
			? { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.savedToSd") }
			: { ok: false, message: i18n.global.t(`plugins.flexibleLayouts.configBackup.encryption.sd.${result}`) };
	} finally {
		sdSaving.value = false;
	}
}
async function onLoadFromSd(): Promise<void> {
	sdStatus.value = null;
	if (!machineStore.isConnected) {
		sdStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.offline") };
		return;
	}
	sdLoading.value = true;
	try {
		const loaded = await loadCredentialsFromSd(defaultMachineIO());
		if (loaded) {
			refreshTick.value++;
			sdStatus.value = { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.loadedFromSd") };
			unlockDialogOpen.value = true; // still locked - prompt straight away so it's actually usable
		} else {
			sdStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.nothingOnSd") };
		}
	} finally {
		sdLoading.value = false;
	}
}

const importFileInput = ref<HTMLInputElement | null>(null);
const fileStatus = ref<{ ok: boolean; message: string } | null>(null);

function onExportFile(): void {
	fileStatus.value = null;
	const bundle = exportEncryptedBundle();
	if (!bundle) {
		fileStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.exportNotEncrypted") };
		return;
	}
	downloadBlob(
		"flexible-layouts-credentials.json",
		new Blob([JSON.stringify(bundle)], { type: "application/json" }),
		"application/json",
	);
	fileStatus.value = { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.exportedFile") };
}
function pickImportFile(): void { importFileInput.value?.click(); }
async function onImportFileSelected(ev: Event): Promise<void> {
	fileStatus.value = null;
	const file = (ev.target as HTMLInputElement).files?.[0];
	(ev.target as HTMLInputElement).value = ""; // allow re-selecting the same file next time
	if (!file) { return; }
	const bundle = parseCredentialBundle(await file.text());
	if (!bundle) {
		fileStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.importFileInvalid") };
		return;
	}
	importEncryptedBundle(bundle);
	refreshTick.value++;
	fileStatus.value = { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.encryption.importedFile") };
	unlockDialogOpen.value = true; // still locked - prompt straight away so it's actually usable
}

// --- Automatic backup reminders ---------------------------------------------------------------------

const nudgeSaved = getAutoBackupNudgeSettings();
const nudgeConfigSaved = ref(nudgeSaved.configSaved);
const nudgeNewMachine = ref(nudgeSaved.newMachine);
const nudgeOverdue = ref(nudgeSaved.overdue);
const nudgeOverdueDays = ref(nudgeSaved.overdueDays);

function saveNudgeSettings(): void {
	setAutoBackupNudgeSettings({
		configSaved: nudgeConfigSaved.value, newMachine: nudgeNewMachine.value,
		overdue: nudgeOverdue.value, overdueDays: nudgeOverdueDays.value || 1,
	});
}

// --- Duet backup service -----------------------------------------------------------------------------
//
// The service URL is hardcoded (getDuetCloudApiUrl() - see credentials.ts) and deliberately never
// shown or editable here, unlike every other destination's settings - the user explicitly asked for
// this one not to be user-configurable at all.

const duetEmail = ref("");
const duetPassword = ref("");
const duetLoggingIn = ref(false);
const duetError = ref<string | null>(null);
const duetSession = ref<DuetCloudSession | null>(getDuetCloudSession());
const duetFifoLimit = ref(getDuetCloudFifoLimit());

async function onDuetLogin(): Promise<void> {
	duetError.value = null;
	duetLoggingIn.value = true;
	try {
		duetSession.value = await duetLoginCall(getDuetCloudApiUrl(), duetEmail.value, duetPassword.value);
	} catch (e) {
		duetError.value = e instanceof Error ? e.message : String(e);
	} finally {
		duetLoggingIn.value = false;
	}
}
function onDuetLogout(): void {
	duetLogoutCall();
	duetSession.value = null;
}

// --- GitHub -----------------------------------------------------------------------------------------

const githubSaved = getGithubSettings();
const githubRepo = ref(githubSaved?.repo ?? "");
const githubBranch = ref(githubSaved?.branch ?? "main");
const githubToken = ref(githubSaved?.token ?? "");
const githubMachineName = ref(githubSaved?.machineName ?? "");
const githubConfigured = computed(() => getGithubSettings() != null);
const githubVerifying = ref(false);
const githubStatus = ref<{ ok: boolean; message: string } | null>(null);

async function onSaveGithub(): Promise<void> {
	githubVerifying.value = true;
	githubStatus.value = null;
	try {
		const priv = await isRepoPrivate(githubToken.value, githubRepo.value);
		setGithubSettings({
			token: githubToken.value, repo: githubRepo.value, branch: githubBranch.value || "main",
			machineName: githubMachineName.value.trim() || undefined,
		});
		githubStatus.value = priv == null
			? { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.github.repoNotFound") }
			: { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.saved") };
	} finally {
		githubVerifying.value = false;
	}
}

// --- Google Drive ------------------------------------------------------------------------------------

const driveClientId = ref(getGoogleDriveClientId() ?? "");
const driveConfigured = computed(() => getGoogleDriveClientId() != null);
const driveOriginOk = isOriginSupported();
const driveSaved = ref(false);
function onSaveDrive(): void {
	setGoogleDriveClientId(driveClientId.value);
	driveSaved.value = true;
}

// --- Dropbox -------------------------------------------------------------------------------------------

const dropboxSaved = getDropboxSettings();
const dropboxToken = ref(dropboxSaved?.token ?? "");
const dropboxConfigured = computed(() => getDropboxSettings() != null);
const dropboxVerifying = ref(false);
const dropboxStatus = ref<{ ok: boolean; message: string } | null>(null);

async function onSaveDropbox(): Promise<void> {
	dropboxVerifying.value = true;
	dropboxStatus.value = null;
	try {
		const who = await dropboxVerify(dropboxToken.value);
		setDropboxSettings({ token: dropboxToken.value });
		dropboxStatus.value = { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.verified", { who }) };
	} catch (e) {
		dropboxStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.verifyFailed", { error: e instanceof Error ? e.message : String(e) }) };
	} finally {
		dropboxVerifying.value = false;
	}
}

// --- WebDAV --------------------------------------------------------------------------------------------

const webdavSaved = getWebDavSettings();
const webdavUrl = ref(webdavSaved?.url ?? "");
const webdavUsername = ref(webdavSaved?.username ?? "");
const webdavPassword = ref(webdavSaved?.password ?? "");
const webdavConfigured = computed(() => getWebDavSettings() != null);
const webdavVerifying = ref(false);
const webdavStatus = ref<{ ok: boolean; message: string } | null>(null);

async function onSaveWebdav(): Promise<void> {
	webdavVerifying.value = true;
	webdavStatus.value = null;
	try {
		await webdavVerify(webdavUrl.value, webdavUsername.value, webdavPassword.value);
		setWebDavSettings({ url: webdavUrl.value, username: webdavUsername.value, password: webdavPassword.value });
		webdavStatus.value = { ok: true, message: i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.saved") };
	} catch (e) {
		webdavStatus.value = { ok: false, message: i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.verifyFailed", { error: e instanceof Error ? e.message : String(e) }) };
	} finally {
		webdavVerifying.value = false;
	}
}

// --- Re-seed the destination panels' form fields after an unlock or an import --------------------------
//
// Every field above is a plain `ref(...)` seeded ONCE from storage at component setup (e.g.
// `ref(githubSaved?.repo ?? "")`) - that's fine normally, but while encryption is on and locked, the
// getters all returned null, so every field started blank. The panels themselves are `v-if`-hidden
// while locked and reappear on unlock, but Vue doesn't re-run a ref's initialiser just because its
// DOM subtree remounts - without this, unlocking (or a standalone-plugin credential import writing
// straight to storage, bypassing every one of these refs) would leave fields looking empty/stale even
// though the credentials are now genuinely available. Re-read everything from storage.
function reseedDestinationFields(): void {
	const duet = getDuetCloudSession();
	if (duet) { duetSession.value = duet; }
	const github = getGithubSettings();
	if (github) {
		githubRepo.value = github.repo;
		githubBranch.value = github.branch;
		githubToken.value = github.token;
		githubMachineName.value = github.machineName ?? "";
	}
	const drive = getGoogleDriveClientId();
	if (drive != null) { driveClientId.value = drive; }
	const dropbox = getDropboxSettings();
	if (dropbox) { dropboxToken.value = dropbox.token; }
	const webdav = getWebDavSettings();
	if (webdav) {
		webdavUrl.value = webdav.url;
		webdavUsername.value = webdav.username;
		webdavPassword.value = webdav.password;
	}
}
watch(sessionUnlocked, (unlocked) => {
	if (!unlocked) { return; }
	reseedDestinationFields();
});
</script>
