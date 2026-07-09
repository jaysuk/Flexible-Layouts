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
				   :title="$t('plugins.flexibleLayouts.settings.switchHelp')" @click="onToggleLayout">
				{{ active
					? $t("plugins.flexibleLayouts.settings.switchToDefault")
					: $t("plugins.flexibleLayouts.settings.switchToFlex") }}
			</v-btn>
			<div class="text-caption text-medium-emphasis mt-2">{{ $t("plugins.flexibleLayouts.settings.pickerHint") }}</div>

			<v-divider class="my-4" />

			<div class="d-flex flex-wrap ga-2">
				<!-- Permanent fallback into edit mode: the shell's own Edit button is now just an ordinary,
					 removable header widget (see docs), so this is the guaranteed way back in if it's ever
					 removed or hidden on a small screen. -->
				<v-btn variant="tonal" prepend-icon="mdi-pencil-ruler"
					   :title="$t('plugins.flexibleLayouts.settings.enterEditHelp')" @click="enterEditMode">
					{{ $t("plugins.flexibleLayouts.settings.enterEdit") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-file-tree"
					   :title="$t('plugins.flexibleLayouts.pages.manageHelp')" @click="openGated('pageManager')">
					{{ $t("plugins.flexibleLayouts.pages.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-palette"
					   :title="$t('plugins.flexibleLayouts.theme.editHelp')" @click="openGated('theme')">
					{{ $t("plugins.flexibleLayouts.theme.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-share-variant"
					   :title="$t('plugins.flexibleLayouts.io.openHelp')" @click="openGated('io')">
					{{ $t("plugins.flexibleLayouts.io.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-layers-triple"
					   :title="$t('plugins.flexibleLayouts.profiles.manageHelp')" @click="openGated('profiles')">
					{{ $t("plugins.flexibleLayouts.profiles.title") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-help-circle"
					   :title="$t('plugins.flexibleLayouts.help.openHelp')" @click="dialogs.help = true">
					{{ $t("plugins.flexibleLayouts.help.title") }}
				</v-btn>
			</div>

			<v-divider class="my-4" />
			<!-- Reachable by ANY user via ordinary navigation (visiting Settings doesn't itself deactivate
				 FL's layout, so the escape guard never sees it) — unlike its siblings above, whose actions
				 are individually gated via openGated(), this section can rewrite the very credentials that
				 gate everything else, so it needs its OWN gate rather than relying on the escape guard. -->
			<AccessSettings v-if="canManageAccess" />
			<v-alert v-else type="info" variant="tonal" density="comfortable" class="d-flex align-center ga-2">
				<span class="flex-grow-1">{{ $t("plugins.flexibleLayouts.access.lockedHint") }}</span>
				<v-btn size="small" variant="tonal" @click="unlockAccessSettings">
					{{ $t("plugins.flexibleLayouts.access.unlock") }}
				</v-btn>
			</v-alert>

			<v-divider class="my-4" />
			<div class="d-flex align-center mb-1">
				<div class="text-title-small">{{ $t("plugins.flexibleLayouts.updates.title") }}</div>
				<v-spacer />
				<v-btn size="small" variant="text" :loading="checking || checkingAll" prepend-icon="mdi-refresh"
					   :title="$t('plugins.flexibleLayouts.updates.checkNowHelp')" @click="checkNow">{{ $t("plugins.flexibleLayouts.updates.checkNow") }}</v-btn>
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
				<v-btn variant="tonal" prepend-icon="mdi-history" :loading="restoring" :disabled="!isConnected"
					   :title="$t('plugins.flexibleLayouts.sdBackup.restoreNowHelp')" @click="restoreNow">
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
				<v-btn variant="tonal" prepend-icon="mdi-download"
					   :title="$t('plugins.flexibleLayouts.diagnostics.downloadHelp')" @click="downloadDiagnostics">
					{{ $t("plugins.flexibleLayouts.diagnostics.download") }}
				</v-btn>
				<v-btn variant="tonal" prepend-icon="mdi-content-copy"
					   :title="$t('plugins.flexibleLayouts.diagnostics.copyHelp')" @click="copyDiagnostics">
					{{ $t("plugins.flexibleLayouts.diagnostics.copy") }}
				</v-btn>
			</div>

			<v-divider class="my-4" />
			<div class="text-title-small mb-1 text-error">{{ $t("plugins.flexibleLayouts.reset.sectionTitle") }}</div>
			<p class="text-body-small text-medium-emphasis mt-0 mb-2">{{ $t("plugins.flexibleLayouts.reset.hint") }}</p>
			<v-btn variant="tonal" color="error" prepend-icon="mdi-restore-alert" :loading="resetting"
				   :title="$t('plugins.flexibleLayouts.reset.buttonHelp')" @click="openReset">
				{{ $t("plugins.flexibleLayouts.reset.button") }}
			</v-btn>

			<v-divider class="my-4" />
			<div class="text-title-small mb-1">More plugins by jaysuk</div>
			<div v-for="p in familyPlugins" :key="p.id" class="d-flex align-center py-1" style="border-bottom:1px solid rgba(127,127,127,0.15)">
				<div>
					<div class="text-body-2 font-weight-medium">
						{{ p.name }}
						<v-chip v-if="p.installed" size="x-small" color="success" variant="flat" class="ml-2">installed</v-chip>
					</div>
					<div class="text-caption text-medium-emphasis">{{ p.description }}</div>
				</div>
				<v-spacer />
				<v-btn size="small" variant="text" :href="p.repo" target="_blank" rel="noopener">GitHub</v-btn>
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
		<ResetConfirmDialog v-model="resetOpen" @confirmed="onResetConfirmed" />
	</v-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";

import i18n from "@/i18n";
import { showConfirmDialog } from "@/composables/useConfirmDialog";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import { buildReport, cleanReleaseNotes, copyReport, downloadReport, fetchReleaseHistory, formatReleaseNotesHtml, isPluginInstalled, otherFamilyPlugins, type ReleaseHistoryEntry, runAllUpdateChecks } from "dwc-plugin-runtime";

import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { activateFlLayout, deactivateFlLayout, isFlLayoutActive } from "../model/layoutState";
import { editMode } from "../model/editorState";
import { applying, checking, dismissCurrentUpdate, dismissedVersion, pendingReload, runUpdateCheck, setUpdateChecksEnabled, undismissUpdate, updateChecksEnabled, updateDiagnostics, updateState as update, applyUpdateNow } from "../model/updateCheck";
import { useLayoutStore } from "../model/store";
import { applyBackup, isAutoBackupEnabled, readBackup, setAutoBackupEnabled } from "../model/sdBackup";
import ImportExportDialog from "../editor/ImportExportDialog.vue";
import ThemeEditor from "../editor/ThemeEditor.vue";
import ProfilesDialog from "../editor/ProfilesDialog.vue";
import HelpDialog from "../editor/HelpDialog.vue";
import AccessSettings from "../editor/AccessSettings.vue";
import PageManager from "../editor/PageManager.vue";
import PasswordDialog from "../editor/PasswordDialog.vue";
import ResetConfirmDialog from "../editor/ResetConfirmDialog.vue";
import { can, requestAdmin } from "../model/access";
import { resetToDefaults } from "../model/reset";

const machineStore = useMachineStore();

// Other plugins in the family (cross-links), from the shared runtime registry.
const familyPlugins = computed(() => otherFamilyPlugins(PLUGIN_MANIFEST_ID).map((p) => ({ ...p, installed: isPluginInstalled(machineStore.model, p.id) })));
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
// Admin just like entering edit mode. The PasswordDialog mounted below surfaces the prompt from
// either shell.
async function openGated(key: "pageManager" | "theme" | "io" | "profiles"): Promise<void> {
	if (!can("editLayout") && !(await requestAdmin())) {
		return;
	}
	dialogs[key] = true;
}

// The Access section itself needs the same gate as the buttons above — reachable via ordinary
// navigation (visiting Settings never deactivates FL's layout, so the escape guard doesn't see it),
// and it can rewrite the very credentials that gate everything else.
const canManageAccess = computed(() => can("editLayout"));
async function unlockAccessSettings(): Promise<void> {
	await requestAdmin();
}

// Full reset wipes the access-lock configuration along with everything else, so it needs its own
// Admin gate up front too - editConfig rather than editLayout since this isn't really "editing the
// layout", but both are Admin-only today so the practical effect is the same.
const resetOpen = ref(false);
const resetting = ref(false);
async function openReset(): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) {
		return;
	}
	resetOpen.value = true;
}
async function onResetConfirmed(): Promise<void> {
	resetting.value = true;
	try {
		// Awaited: resetToDefaults() explicitly flushes the wipe to the board (DWC's settings/cache
		// autosave is debounced, so reloading immediately after the in-memory mutations would race it
		// and reload the board's still-old file - the reset would silently do nothing). A save failure
		// (board offline, network drop) must not reload into what looks like an untouched layout with
		// no explanation, so it's reported instead.
		await resetToDefaults();
		window.location.reload();
	} catch (e) {
		resetting.value = false;
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.reset.title"), (e as Error)?.message ?? String(e));
	}
}

const router = useRouter();

// Guaranteed way into edit mode, independent of the header: the shell's own Edit button is now just
// an ordinary, removable/reorderable header widget (see AccessChip/EditModeToggle widgets), so this
// is the recovery path if it's ever removed, or just hidden behind the mobile overflow menu.
async function enterEditMode(): Promise<void> {
	if (!can("editLayout") && !(await requestAdmin())) {
		return;
	}
	if (!isFlLayoutActive()) {
		activateFlLayout();
	}
	editMode.value = true;
	router.push("/").catch(() => { /* already there */ });
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
		let ok: boolean;
		try {
			// A failed confirm prompt should never be worse than "assume not confirmed" - degrade to a
			// notification instead of an uncaught error here (this restores a whole layout, so silently
			// proceeding without confirmation is not an acceptable fallback).
			ok = await showConfirmDialog(sdT("restoreTitle"), sdT("restoreNowConfirm", { date: when, count }), "mdi-sd");
		} catch (e) {
			uiStore.makeNotification(LogLevel.error, sdT("title"), (e as Error)?.message ?? String(e));
			return;
		}
		if (ok) {
			applyBackup(backup);
			sdNotify(LogLevel.success, "restored");
		}
	} finally {
		restoring.value = false;
	}
}
</script>
