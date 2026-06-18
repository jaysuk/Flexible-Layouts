<template>
	<v-card flat>
		<v-card-text>
			<div class="d-flex align-center mb-4">
				<v-icon size="large" class="me-3">mdi-view-dashboard-edit</v-icon>
				<div>
					<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.settings.heading") }}</div>
					<div class="text-body-small text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.settings.subheading") }}
					</div>
				</div>
			</div>

			<v-alert :type="active ? 'success' : 'info'" variant="tonal" density="comfortable" class="mb-4">
				{{ active
					? $t("plugins.flexibleLayouts.settings.statusActive")
					: $t("plugins.flexibleLayouts.settings.statusInactive") }}
			</v-alert>

			<v-btn :color="active ? undefined : 'primary'" :variant="active ? 'tonal' : 'flat'"
				   :prepend-icon="active ? 'mdi-view-dashboard-outline' : 'mdi-view-dashboard-edit'"
				   @click="onToggleLayout">
				{{ active
					? $t("plugins.flexibleLayouts.settings.switchToDefault")
					: $t("plugins.flexibleLayouts.settings.switchToFlex") }}
			</v-btn>
			<div class="text-caption text-medium-emphasis mt-2">{{ $t("plugins.flexibleLayouts.settings.pickerHint") }}</div>

			<v-divider class="my-4" />

			<div class="d-flex flex-wrap ga-2">
				<v-btn variant="tonal" prepend-icon="mdi-file-tree" @click="openGated('pageManager')">
					{{ $t("plugins.flexibleLayouts.pages.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-palette" @click="openGated('theme')">
					{{ $t("plugins.flexibleLayouts.theme.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-share-variant" @click="openGated('io')">
					{{ $t("plugins.flexibleLayouts.io.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-layers-triple" @click="openGated('profiles')">
					{{ $t("plugins.flexibleLayouts.profiles.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-help-circle" @click="dialogs.help = true">
					{{ $t("plugins.flexibleLayouts.help.title") }}
				</v-btn>
			</div>

			<v-divider class="my-4" />
			<LockSettings />

			<v-divider class="my-4" />
			<div class="d-flex align-center mb-1">
				<div class="text-title-small">{{ $t("plugins.flexibleLayouts.updates.title") }}</div>
				<v-spacer />
				<v-btn size="small" variant="text" :loading="checking || checkingAll" prepend-icon="mdi-refresh"
					   @click="checkNow">{{ $t("plugins.flexibleLayouts.updates.checkNow") }}</v-btn>
			</div>

			<!-- Reload prompt: shown after a successful one-click update (stale code runs until reload) -->
			<v-alert v-if="pendingReload" type="success" variant="tonal" density="comfortable" class="mb-2">
				<div class="d-flex align-center flex-wrap ga-2">
					<div class="flex-grow-1">{{ $t("plugins.flexibleLayouts.updates.installedReloadBanner") }}</div>
					<v-btn color="success" prepend-icon="mdi-restart" @click="reloadPage">
						{{ $t("plugins.flexibleLayouts.updates.reloadNow") }}
					</v-btn>
				</div>
			</v-alert>

			<!-- Update offered but skipped by the user: quiet hint, Check now brings it back -->
			<div v-else-if="update?.updateAvailable && isDismissed" class="text-caption text-medium-emphasis mb-2">
				{{ $t("plugins.flexibleLayouts.updates.skipped", { version: update.latestVersion }) }}
			</div>

			<!-- A compatible newer release: one-click apply -->
			<v-alert v-else-if="update?.scenario === 'pluginUpdate'" type="info" variant="tonal" density="comfortable" class="mb-2">
				<div class="d-flex align-center flex-wrap ga-2">
					<div class="flex-grow-1">
						<div class="font-weight-medium">{{ $t("plugins.flexibleLayouts.updates.available", { version: update.latestVersion }) }}</div>
						<div class="text-caption">{{ $t("plugins.flexibleLayouts.updates.installedNow", { version: update.currentVersion }) }}</div>
						<div v-if="!isConnected" class="text-caption text-warning">{{ $t("plugins.flexibleLayouts.updates.needConnection") }}</div>
					</div>
					<v-btn color="primary" :loading="applying" :disabled="!isConnected" prepend-icon="mdi-download"
						   @click="updateNow">{{ $t("plugins.flexibleLayouts.updates.updateNow") }}</v-btn>
					<v-btn variant="text" @click="showReleaseNotes">
						{{ $t("plugins.flexibleLayouts.updates.notes") }}
					</v-btn>
					<v-btn variant="text" size="small" @click="skipVersion">
						{{ $t("plugins.flexibleLayouts.updates.skipVersion") }}
					</v-btn>
				</div>
			</v-alert>

			<!-- Newer release that needs a DWC update first -->
			<v-alert v-else-if="update?.scenario === 'dwcUpdate'" type="warning" variant="tonal" density="comfortable" class="mb-2">
				<div class="font-weight-medium">{{ $t("plugins.flexibleLayouts.updates.available", { version: update.latestVersion }) }}</div>
				<div class="text-caption">{{ $t("plugins.flexibleLayouts.updates.needsDwc", { dwc: update.requiredDwc, running: update.runningDwc }) }}</div>
				<v-btn class="mt-1" size="small" variant="text" @click="showReleaseNotes">
					{{ $t("plugins.flexibleLayouts.updates.notes") }}
				</v-btn>
				<v-btn class="mt-1" size="small" variant="text" @click="skipVersion">
					{{ $t("plugins.flexibleLayouts.updates.skipVersion") }}
				</v-btn>
			</v-alert>

			<v-alert v-else-if="update?.scenario === 'upToDate'" type="success" variant="tonal" density="compact" class="mb-2">
				{{ $t("plugins.flexibleLayouts.updates.upToDate", { version: update.currentVersion }) }}
			</v-alert>

			<v-switch :model-value="checksEnabled" color="primary" density="compact" hide-details
					  :label="$t('plugins.flexibleLayouts.updates.autoCheck')" @update:model-value="onToggleChecks" />

			<v-divider class="my-4" />
			<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.sdBackup.title") }}</div>
			<p class="text-body-small text-medium-emphasis mt-0 mb-2">{{ $t("plugins.flexibleLayouts.sdBackup.hint") }}</p>
			<div class="d-flex flex-wrap ga-2">
				<v-btn variant="tonal" prepend-icon="mdi-content-save" :loading="backingUp" :disabled="!isConnected" @click="backupNow">
					{{ $t("plugins.flexibleLayouts.sdBackup.backupNow") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-history" :loading="restoring" :disabled="!isConnected" @click="restoreNow">
					{{ $t("plugins.flexibleLayouts.sdBackup.restoreNow") }}
				</v-btn>
			</div>
			<v-switch :model-value="sdEnabled" color="primary" density="compact" hide-details class="mt-1"
					  :label="$t('plugins.flexibleLayouts.sdBackup.auto')" @update:model-value="onToggleSd" />

			<v-divider class="my-4" />
			<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.diagnostics.title") }}</div>
			<p class="text-body-small text-medium-emphasis mt-0 mb-2">
				{{ $t("plugins.flexibleLayouts.diagnostics.hint") }}
			</p>
			<div class="d-flex flex-wrap ga-2">
				<v-btn variant="tonal" prepend-icon="mdi-download" @click="downloadDiagnostics">
					{{ $t("plugins.flexibleLayouts.diagnostics.download") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-content-copy" @click="copyDiagnostics">
					{{ $t("plugins.flexibleLayouts.diagnostics.copy") }}
				</v-btn>
			</div>

			<p class="text-body-small text-medium-emphasis mt-4 mb-0">
				{{ $t("plugins.flexibleLayouts.settings.escapeHint") }}
				<code>/BuiltInLayout</code>
			</p>
		</v-card-text>

		<v-dialog v-model="releaseNotesOpen" width="700" scrollable>
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.updates.releaseNotes", { version: update?.latestVersion }) }}</v-card-title>
				<v-divider />
				<v-card-text class="text-body-small" style="word-break: break-word; font-family: system-ui, -apple-system, sans-serif; max-height: 60vh; overflow-y: auto;">
					<!-- Loading indicator while fetching history -->
					<div v-if="historyLoading" class="d-flex justify-center pa-4">
						<v-progress-circular indeterminate size="32" />
					</div>
					<!-- Cumulative history: one section per release newer than the installed version -->
					<template v-else-if="releaseHistory.length > 0">
						<div v-for="entry in releaseHistory" :key="entry.version" class="mb-4">
							<div class="text-subtitle-2 font-weight-bold mb-1">{{ entry.name }}</div>
							<div v-html="formatReleaseNotesHtml(entry.notes)" />
						</div>
					</template>
					<!-- Offline fallback: single section from the latest-release notes -->
					<template v-else>
						<div v-html="fallbackNotesHtml" />
					</template>
				</v-card-text>
				<v-divider />
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="releaseNotesOpen = false">{{ $t("plugins.flexibleLayouts.updates.close") }}</v-btn>
					<v-btn v-if="update?.releaseUrl" color="primary" variant="text" :href="update.releaseUrl" target="_blank" rel="noopener">
						{{ $t("plugins.flexibleLayouts.updates.viewOnGithub") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<PageManager v-model="dialogs.pageManager" @open-import="dialogs.io = true" />
		<ThemeEditor v-model="dialogs.theme" />
		<ImportExportDialog v-model="dialogs.io" />
		<ProfilesDialog v-model="dialogs.profiles" />
		<HelpDialog v-model="dialogs.help" />
		<PasswordDialog />
	</v-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";

import i18n from "@/i18n";
import { showConfirmDialog } from "@/composables/useConfirmDialog";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import { buildReport, cleanReleaseNotes, copyReport, downloadReport, fetchReleaseHistory, formatReleaseNotesHtml, type ReleaseHistoryEntry, runAllUpdateChecks } from "dwc-plugin-runtime";

import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { activateFlLayout, deactivateFlLayout, isFlLayoutActive } from "../model/layoutState";
import { applying, checking, dismissCurrentUpdate, dismissedVersion, pendingReload, runUpdateCheck, setUpdateChecksEnabled, undismissUpdate, updateChecksEnabled, updateDiagnostics, updateState as update, applyUpdateNow } from "../model/updateCheck";
import { useLayoutStore } from "../model/store";
import { applyBackup, isAutoBackupEnabled, readBackup, setAutoBackupEnabled, writeBackup } from "../model/sdBackup";
import ImportExportDialog from "../editor/ImportExportDialog.vue";
import ThemeEditor from "../editor/ThemeEditor.vue";
import ProfilesDialog from "../editor/ProfilesDialog.vue";
import HelpDialog from "../editor/HelpDialog.vue";
import LockSettings from "../editor/LockSettings.vue";
import PageManager from "../editor/PageManager.vue";
import PasswordDialog from "../editor/PasswordDialog.vue";
import { isLocked, requestUnlock } from "../model/lock";

const machineStore = useMachineStore();
const uiStore = useUiStore();

const active = computed(() => isFlLayoutActive());

// --- Updates -----------------------------------------------------------------------------------
const isConnected = computed(() => machineStore.isConnected);
const checksEnabled = ref(updateChecksEnabled());
const releaseNotesOpen = ref(false);

// Release history: lazily fetched when the notes dialog opens, cached until latestVersion changes.
const releaseHistory = ref<ReleaseHistoryEntry[]>([]);
const historyLoading = ref(false);
let historyFetchedFor: string | null = null;

/** Installed version used as the "since" cursor for cumulative history. */
function installedVersion(): string {
	const plugins = (machineStore.model as { plugins?: Map<string, { version?: string }> }).plugins;
	return plugins?.get(PLUGIN_MANIFEST_ID)?.version ?? "0.0.0";
}

/** HTML rendered for the offline fallback (single-entry, from the latest-release notes). */
const fallbackNotesHtml = computed(() =>
	formatReleaseNotesHtml(cleanReleaseNotes(update.value?.notes ?? "")),
);

watch(releaseNotesOpen, async (open) => {
	if (!open) return;
	const latest = update.value?.latestVersion ?? null;
	// Only re-fetch when the dialog opens and the latest version has changed (avoids redundant calls).
	if (latest && historyFetchedFor === latest) return;
	historyLoading.value = true;
	try {
		releaseHistory.value = await fetchReleaseHistory({
			owner: "jaysuk",
			repo: "Flexible-Layouts",
			// Show all releases newer than what the user currently has installed.
			sinceVersion: installedVersion(),
		});
		historyFetchedFor = latest;
	} finally {
		historyLoading.value = false;
	}
});

const isDismissed = computed(() => update.value?.latestVersion != null && update.value.latestVersion === dismissedVersion.value);
// An explicit check means the user wants to see the offer again, so clear any skipped version first.
// Check FL AND every other plugin registered with the runtime update hub, so one button refreshes all.
const checkingAll = ref(false);
async function checkNow() {
	undismissUpdate();
	checkingAll.value = true;
	try {
		await runAllUpdateChecks();
	} finally {
		checkingAll.value = false;
	}
}
function skipVersion() { dismissCurrentUpdate(); }
function updateNow() { applyUpdateNow(); }
function showReleaseNotes() { releaseNotesOpen.value = true; }
function reloadPage() { window.location.reload(); }
function onToggleChecks(value: boolean | null) {
	const on = value === true;
	checksEnabled.value = on;
	setUpdateChecksEnabled(on);
	if (on) { runUpdateCheck({ force: true }); }
}

// Diagnostics: bundle versions + recent errors + a privacy-scrubbed object model + the live layout
// document (the most useful FL-specific artifact — lets a bug be reproduced from the exact layout).
function diagnosticReport() {
	return buildReport({
		pluginId: PLUGIN_MANIFEST_ID,
		model: machineStore.model,
		state: { document: useLayoutStore().document.value, updates: updateDiagnostics() },
	});
}
function downloadDiagnostics(): void {
	downloadReport(diagnosticReport());
}
async function copyDiagnostics(): Promise<void> {
	const ok = await copyReport(diagnosticReport());
	uiStore.makeNotification(
		ok ? LogLevel.success : LogLevel.warning,
		"Flexible Layouts",
		i18n.global.t(ok ? "plugins.flexibleLayouts.diagnostics.copied" : "plugins.flexibleLayouts.diagnostics.copyFailed"),
	);
}
const dialogs = reactive({
	pageManager: false,
	theme: false,
	io: false,
	profiles: false,
	help: false,
});

// Page management, theming, import/export and profiles all mutate the layout, so they sit behind
// the optional password lock just like entering edit mode. The PasswordDialog mounted below
// surfaces the prompt from either shell.
async function openGated(key: "pageManager" | "theme" | "io" | "profiles"): Promise<void> {
	if (isLocked() && !(await requestUnlock())) {
		return;
	}
	dialogs[key] = true;
}

function onToggleLayout() {
	if (isFlLayoutActive()) {
		deactivateFlLayout();
	} else {
		activateFlLayout();
	}
}

// --- SD-card backup ----------------------------------------------------------------------------
const sdEnabled = ref(isAutoBackupEnabled());
const backingUp = ref(false);
const restoring = ref(false);

function sdT(key: string, params?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.sdBackup.${key}`, params ?? {});
}
function sdNotify(level: LogLevel, key: string, params?: Record<string, unknown>): void {
	uiStore.makeNotification(level, sdT("title"), sdT(key, params));
}

function onToggleSd(value: boolean | null): void {
	const on = value === true;
	sdEnabled.value = on;
	setAutoBackupEnabled(on);
}

async function backupNow(): Promise<void> {
	backingUp.value = true;
	try {
		const result = await writeBackup();
		if (result === "written" || result === "unchanged") {
			sdNotify(LogLevel.success, "backupOk");
		} else if (result === "skipped-empty") {
			sdNotify(LogLevel.info, "backupEmpty");
		} else {
			sdNotify(LogLevel.warning, "backupFailed");
		}
	} finally {
		backingUp.value = false;
	}
}

async function restoreNow(): Promise<void> {
	restoring.value = true;
	try {
		const backup = await readBackup();
		if (!backup) {
			sdNotify(LogLevel.warning, "noBackup");
			return;
		}
		const count = Object.keys(backup.profiles).length;
		const when = backup.savedAt ? new Date(backup.savedAt).toLocaleString() : "";
		const ok = await showConfirmDialog(sdT("restoreTitle"), sdT("restoreNowConfirm", { date: when, count }), "mdi-sd");
		if (ok) {
			applyBackup(backup);
			sdNotify(LogLevel.success, "restored");
		}
	} finally {
		restoring.value = false;
	}
}
</script>
