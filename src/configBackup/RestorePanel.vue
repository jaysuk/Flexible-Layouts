<template>
	<v-card flat>
		<v-card-text>
			<!-- Step 1: source -->
			<template v-if="step === 'source'">
				<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.restore.sourceHeading") }}</div>

				<v-radio-group v-model="sourceMode" density="compact" hide-details class="mb-3">
					<v-radio value="local" :label="$t('plugins.flexibleLayouts.configBackup.restore.sourceLocalOption')" />
					<v-radio v-for="opt in cloudSourceOptions" :key="opt.id" :value="opt.id">
						<template #label>
							<span class="d-flex align-center ga-2">
								{{ opt.label }}
								<v-chip size="x-small" :color="opt.configured ? 'success' : undefined" variant="tonal">
									{{ opt.configured
										? $t("plugins.flexibleLayouts.configBackup.cloud.configuredNote")
										: $t("plugins.flexibleLayouts.configBackup.cloud.notConfiguredYet") }}
								</v-chip>
							</span>
						</template>
					</v-radio>
				</v-radio-group>

				<template v-if="sourceMode === 'local'">
					<div class="d-flex flex-column align-start ga-2 pa-4" style="border: 1px dashed rgba(128,128,128,0.5); border-radius: 8px;"
						 @dragover.prevent @drop.prevent="onDrop">
						<v-btn variant="tonal" prepend-icon="mdi-file-upload-outline" @click="pickFile">
							{{ $t("plugins.flexibleLayouts.configBackup.restore.sourceLocal") }}
						</v-btn>
						<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.configBackup.restore.sourceDrop") }}</span>
					</div>
					<input ref="fileInput" type="file" accept=".zip" class="d-none" @change="onFileInput" />
				</template>

				<template v-else-if="!cloudSourceConfigured">
					<v-alert type="warning" variant="tonal" density="compact">
						{{ $t("plugins.flexibleLayouts.configBackup.create.notConfigured", { destination: cloudSourceLabel }) }}
					</v-alert>
				</template>

				<template v-else-if="sourceMode === 'duet'">
					<v-alert type="info" variant="tonal" density="compact" class="mb-3">{{ $t("plugins.flexibleLayouts.configBackup.cloud.otherMachinesNote") }}</v-alert>
					<MachineList :machines="duetMachineItems" :loading="duetLoadingMachines" :selected="duetSelectedGuid"
								 :this-machine-key="thisMachineKey" @select="selectDuetMachine" />
					<template v-if="duetSelectedGuid">
						<v-divider class="my-3" />
						<CloudBackupBrowser :items="duetItems" :loading="duetLoadingBackups"
											 @download="onDuetDownload" @restore="onDuetRestore" @delete="onDuetDelete" />
					</template>
					<v-alert v-if="duetError" type="error" variant="tonal" density="compact" class="mt-3">{{ duetError }}</v-alert>
				</template>

				<template v-else-if="sourceMode === 'github'">
					<v-alert type="info" variant="tonal" density="compact" class="mb-3">{{ $t("plugins.flexibleLayouts.configBackup.cloud.otherMachinesNote") }}</v-alert>
					<MachineList :machines="githubMachineItems" :loading="githubLoadingMachines" :selected="githubSelectedMachine"
								 :this-machine-key="githubThisMachineKey" @select="selectGithubMachine" />
					<template v-if="githubSelectedMachine">
						<v-divider class="my-3" />
						<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.github.historyHeading") }}</div>
						<CloudBackupBrowser :items="githubHistoryItems" :loading="githubLoadingHistory" :show-delete="false"
											 @download="onGithubDownload" @restore="onGithubRestore" />
					</template>
				</template>

				<template v-else-if="sourceMode === 'dropbox'">
					<MachineList :machines="dropboxMachineItems" :loading="dropboxLoadingMachines" :selected="dropboxSelectedMachine"
								 :this-machine-key="thisHostname" @select="selectDropboxMachine" />
					<template v-if="dropboxSelectedMachine">
						<v-divider class="my-3" />
						<CloudBackupBrowser :items="dropboxItems" :loading="dropboxLoadingBackups"
											 @download="onDropboxDownload" @restore="onDropboxRestore" @delete="onDropboxDelete" />
					</template>
				</template>

				<template v-else-if="sourceMode === 'webdav'">
					<MachineList :machines="webdavMachineItems" :loading="webdavLoadingMachines" :selected="webdavSelectedMachine"
								 :this-machine-key="thisHostname" @select="selectWebdavMachine" />
					<template v-if="webdavSelectedMachine">
						<v-divider class="my-3" />
						<CloudBackupBrowser :items="webdavItems" :loading="webdavLoadingBackups"
											 @download="onWebdavDownload" @restore="onWebdavRestore" @delete="onWebdavDelete" />
					</template>
				</template>

				<v-alert v-if="loadError" type="error" variant="tonal" density="compact" class="mt-3">{{ loadError }}</v-alert>
			</template>

			<!-- Step 2: file tree -->
			<template v-else-if="step === 'tree' && archive">
				<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.restore.treeHeading") }}</div>
				<BackupFileTree :files="archive.manifest.files" :model-value="selection" @update:model-value="selection = $event" />
				<div class="d-flex ga-2 mt-3">
					<v-btn variant="tonal" @click="step = 'source'">{{ $t("plugins.flexibleLayouts.shell.back") }}</v-btn>
					<v-btn color="primary" :disabled="selection.size === 0" :loading="preparing" @click="proceedFromTree">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.restoreSelected", { count: selection.size }) }}
					</v-btn>
				</div>
			</template>

			<!-- Step 3: repair (only when redactions are present) -->
			<template v-else-if="step === 'repair' && archive">
				<RedactionRepairStep :sites="repairSites" :live-file-texts="liveFileTexts" :model-value="repairDecisions"
									  @update:model-value="repairDecisions = $event" />
				<div class="d-flex ga-2 mt-3">
					<v-btn variant="tonal" @click="step = 'tree'">{{ $t("plugins.flexibleLayouts.shell.back") }}</v-btn>
					<v-btn color="primary" :disabled="repairDecisions.size < repairSites.length" @click="proceedFromRepair">
						{{ $t("plugins.flexibleLayouts.shell.done") }}
					</v-btn>
				</div>
			</template>

			<!-- Step 4: review + apply -->
			<template v-else-if="step === 'review' && archive && plan">
				<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.configBackup.restore.reviewHeading") }}</div>

				<div class="text-body-2 mb-2">{{ $t("plugins.flexibleLayouts.configBackup.restore.excludedNote") }}</div>

				<v-alert v-if="!diff?.sameMachine" type="warning" variant="tonal" density="comfortable" class="mb-3">
					<div class="d-flex align-center ga-2">
						<span>{{ $t("plugins.flexibleLayouts.configBackup.restore.restoreFromOtherMachine") }}</span>
						<v-spacer />
						<v-btn size="small" variant="tonal" @click="diffOpen = true">{{ $t("plugins.flexibleLayouts.configBackup.restore.diffHeading") }}</v-btn>
					</div>
				</v-alert>

				<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.configBackup.restore.modeHeading") }}</div>
				<v-radio-group v-model="mode" density="compact" hide-details class="mb-3">
					<v-radio value="merge">
						<template #label>
							<div>
								<div>{{ $t("plugins.flexibleLayouts.configBackup.restore.modeMerge") }}</div>
								<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.configBackup.restore.modeMergeHelp") }}</div>
							</div>
						</template>
					</v-radio>
					<v-radio value="mirror" :disabled="!diff?.sameMachine">
						<template #label>
							<div>
								<div>{{ $t("plugins.flexibleLayouts.configBackup.restore.modeMirror") }}</div>
								<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.configBackup.restore.modeMirrorHelp") }}</div>
							</div>
						</template>
					</v-radio>
				</v-radio-group>
				<v-alert v-if="!diff?.sameMachine" type="info" variant="tonal" density="compact" class="mb-3">
					{{ $t("plugins.flexibleLayouts.configBackup.restore.modeMirrorDisabledDifferentMachine") }}
				</v-alert>

				<v-alert v-if="mode === 'mirror'" type="warning" variant="tonal" density="compact" class="mb-3">
					<div class="d-flex align-center ga-2 flex-wrap">
						<span>{{ $t("plugins.flexibleLayouts.configBackup.restore.suggestBackupFirst") }}</span>
						<v-spacer />
						<v-btn size="small" variant="tonal" :loading="quickBackupBusy" :disabled="quickBackupDone" @click="onQuickBackup">
							<v-icon v-if="quickBackupDone" size="16" class="me-1">mdi-check</v-icon>
							{{ quickBackupDone
								? $t("plugins.flexibleLayouts.configBackup.restore.suggestBackupFirstDone")
								: $t("plugins.flexibleLayouts.configBackup.restore.suggestBackupFirstButton") }}
						</v-btn>
					</div>
					<v-alert v-if="quickBackupError" type="error" variant="tonal" density="compact" class="mt-2">{{ quickBackupError }}</v-alert>
				</v-alert>

				<v-table density="compact" class="mb-3">
					<thead>
						<tr>
							<th>{{ $t("plugins.flexibleLayouts.configBackup.restore.planColumnFile") }}</th>
							<th>{{ $t("plugins.flexibleLayouts.configBackup.restore.planColumnStatus") }}</th>
						</tr>
					</thead>
					<tbody>
						<tr v-for="entry in plan.entries" :key="entry.archivePath">
							<td class="text-caption">{{ entry.targetPath || entry.archivePath }}</td>
							<td class="text-caption">
								<v-chip size="x-small" :color="statusColor(entry.status)" variant="tonal">{{ statusLabel(entry.status) }}</v-chip>
							</td>
						</tr>
					</tbody>
				</v-table>

				<template v-if="mode === 'mirror' && plan.deletions.length > 0">
					<v-alert type="error" variant="tonal" density="comfortable" class="mb-2">
						<div class="font-weight-medium mb-1">{{ $t("plugins.flexibleLayouts.configBackup.restore.deletionsHeading") }}</div>
						<ul class="text-caption">
							<li v-for="d in plan.deletions" :key="d.targetPath">{{ d.targetPath }}</li>
						</ul>
					</v-alert>
					<v-checkbox v-model="deletionsConfirmed" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.configBackup.restore.deletionsConfirm', { count: plan.deletions.length })" />
					<v-text-field v-if="plan.deletions.length > 20" v-model="deletionsTyped" density="compact" variant="outlined"
								  :label="$t('plugins.flexibleLayouts.configBackup.restore.deletionsTypeConfirm')" class="mt-2" />
				</template>
				<v-checkbox v-else v-model="overwriteConfirmed" density="compact" hide-details
							:label="$t('plugins.flexibleLayouts.configBackup.restore.overwriteConfirm')" />

				<div class="d-flex ga-2 mt-3">
					<v-btn variant="tonal" :disabled="applying" @click="step = repairSites.length > 0 ? 'repair' : 'tree'">
						{{ $t("plugins.flexibleLayouts.shell.back") }}
					</v-btn>
					<v-btn color="error" :disabled="!canApply" :loading="applying" @click="onApply">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.applyButton") }}
					</v-btn>
				</div>

				<template v-if="applying">
					<v-progress-linear :model-value="applyProgressPct" height="8" rounded class="mt-3" />
					<div class="text-caption text-medium-emphasis mt-1">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.applyProgress", { done: applyProgressDone, total: applyProgressTotal }) }}
					</div>
				</template>

				<v-alert v-if="applyError" type="error" variant="tonal" density="compact" class="mt-3">{{ applyError }}</v-alert>

				<template v-if="applyResult">
					<v-divider class="my-3" />
					<div class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.configBackup.restore.resultHeading") }}</div>
					<div class="text-body-2">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.resultWritten", { count: writtenCount }) }}
						<span v-if="deletedCount > 0"> · {{ $t("plugins.flexibleLayouts.configBackup.restore.resultDeleted", { count: deletedCount }) }}</span>
						<span v-if="failedCount > 0"> · {{ $t("plugins.flexibleLayouts.configBackup.restore.resultFailed", { count: failedCount }) }}</span>
					</div>
					<v-alert v-for="r in failedResults" :key="r.targetPath" type="error" variant="tonal" density="compact" class="mt-2">
						{{ r.targetPath }}: {{ r.error }}
					</v-alert>
					<v-alert v-if="commentedOutFiles.length > 0" type="warning" variant="tonal" density="compact" class="mt-2">
						<div class="font-weight-medium mb-1">
							{{ $t("plugins.flexibleLayouts.configBackup.restore.resultCommentedOut", { count: commentedOutFiles.length }) }}
						</div>
						<ul class="text-caption">
							<li v-for="p in commentedOutFiles" :key="p">{{ p }}</li>
						</ul>
					</v-alert>
				</template>

				<MachineDiffDialog v-if="diff" v-model="diffOpen" :diff="diff" :backup-hostname="archive.manifest.machine.hostname" />
			</template>
		</v-card-text>
	</v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { downloadBlob } from "dwc-plugin-runtime";

import { showConfirmDialog } from "@/composables/useConfirmDialog";
import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { buildArchive, computeMachineKey, readArchive } from "../model/configBackup/archive";
import { collectAll, defaultMachineIO, walkDirectory } from "../model/configBackup/collect";
import { BACKUP_DIR_KINDS, DEFAULT_MAX_FILE_BYTES, DIR_FOLDER } from "../model/configBackup/constants";
import type { BackupDirKind } from "../model/configBackup/constants";
import { downloadArchive } from "../model/configBackup/destinations/localZip";
import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { findRedactions, applyRepairsToFile } from "../model/configBackup/repair";
import type { RedactionSite } from "../model/configBackup/types";
import type { RepairAction } from "../model/configBackup/types";
import {
	applyRestorePlan, buildRestorePlan, compareMachines, computeMirrorDeletions,
} from "../model/configBackup/restore";
import type { ApplyRestoreResult, MachineDiff, ParsedArchive, RestoreMode, RestorePlan } from "../model/configBackup/types";
import { buildLiveDirectories, buildMachineIdentity } from "../model/configBackup/machineIdentity";
import {
	deleteBackup as duetDelete, downloadBackup as duetDownload, listBackups as duetListBackups, listMachines as duetListMachines,
} from "../model/configBackup/destinations/duetCloud";
import type { BackupSummary, MachineSummary } from "../model/configBackup/destinations/duetCloud";
import {
	downloadBackupAtCommit, listBackupHistory as githubListHistory, listMachineFolders as githubListMachines,
} from "../model/configBackup/destinations/github";
import type { GithubBackupRevision } from "../model/configBackup/destinations/github";
import {
	deleteBackup as dropboxDelete, downloadBackup as dropboxDownload, listBackups as dropboxListBackups, listMachineFolders as dropboxListMachines,
} from "../model/configBackup/destinations/dropbox";
import {
	deleteBackup as webdavDelete, downloadBackup as webdavDownload, listBackups as webdavListBackups, listMachineFolders as webdavListMachines,
} from "../model/configBackup/destinations/webdav";
import {
	addBackedUpMachineKey, getDropboxSettings, getDuetCloudApiUrl, getDuetCloudSession, getGithubSettings,
	getRedactPreference, getWebDavSettings, setLastBackupAt,
} from "../model/configBackup/credentials";
import BackupFileTree from "./BackupFileTree.vue";
import RedactionRepairStep from "./RedactionRepairStep.vue";
import MachineDiffDialog from "./MachineDiffDialog.vue";
import MachineList from "./MachineList.vue";
import type { MachineListItem } from "./MachineList.vue";
import CloudBackupBrowser from "./CloudBackupBrowser.vue";
import type { BackupBrowserItem } from "./CloudBackupBrowser.vue";

const machineStore = useMachineStore();
const identity = buildMachineIdentity(machineStore.model as unknown);
const thisMachineKey = computeMachineKey(identity);
const thisHostname = identity.hostname;

function formatDate(iso: string): string {
	try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function confirmDelete(): Promise<boolean> {
	return showConfirmDialog(
		i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.deleteConfirmTitle"),
		i18n.global.t("plugins.flexibleLayouts.configBackup.cloud.deleteConfirmBody"),
		"mdi-delete-outline",
	);
}

const step = ref<"source" | "tree" | "repair" | "review">("source");
const archive = ref<ParsedArchive | null>(null);
const loadError = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

// --- Cloud source browsing (Step 1 alternative to picking a local file) -----------------------------
//
// Configuration (credentials) lives in the "Cloud backup configuration" tab; this only browses and
// restores from destinations already configured there. `active`/`refreshTick` mirrors
// BackupCreatePanel's pattern - v-window keeps every tab mounted, so a plain computed would go stale
// the moment credentials are saved on the Configuration tab and the user comes back here.
const props = defineProps<{ active?: boolean }>();
const refreshTick = ref(0);
watch(() => props.active, (active) => { if (active) { refreshTick.value++; } });

type CloudSourceId = "duet" | "github" | "dropbox" | "webdav";
const sourceMode = ref<"local" | CloudSourceId>("local");

const CLOUD_SOURCE_IDS: Array<CloudSourceId> = ["duet", "github", "dropbox", "webdav"];
const CLOUD_SOURCE_LABEL_KEYS: Record<CloudSourceId, string> = {
	duet: "plugins.flexibleLayouts.configBackup.cloud.duetHeading",
	github: "plugins.flexibleLayouts.configBackup.github.heading",
	dropbox: "plugins.flexibleLayouts.configBackup.cloud.dropboxHeading",
	webdav: "plugins.flexibleLayouts.configBackup.cloud.webdavHeading",
};
function isCloudSourceConfigured(id: CloudSourceId): boolean {
	switch (id) {
		// getDuetCloudApiUrl() always has a value (hardcoded, not user-configurable) - signing in
		// (a session) is what actually reflects the user having done anything here.
		case "duet": return getDuetCloudSession() != null;
		case "github": return getGithubSettings() != null;
		case "dropbox": return getDropboxSettings() != null;
		case "webdav": return getWebDavSettings() != null;
		default: return false;
	}
}
const cloudSourceOptions = computed(() => {
	void refreshTick.value;
	return CLOUD_SOURCE_IDS.map((id) => ({ id, label: i18n.global.t(CLOUD_SOURCE_LABEL_KEYS[id]), configured: isCloudSourceConfigured(id) }));
});
const cloudSourceConfigured = computed(() => {
	void refreshTick.value;
	return sourceMode.value !== "local" && isCloudSourceConfigured(sourceMode.value);
});
const cloudSourceLabel = computed(() => (sourceMode.value === "local" ? "" : i18n.global.t(CLOUD_SOURCE_LABEL_KEYS[sourceMode.value])));

// Duet backup service
const duetMachines = ref<Array<MachineSummary>>([]);
const duetLoadingMachines = ref(false);
const duetSelectedGuid = ref<string | null>(null);
const duetBackups = ref<Array<BackupSummary>>([]);
const duetLoadingBackups = ref(false);
const duetError = ref<string | null>(null);
const duetItems = computed<Array<BackupBrowserItem>>(() => duetBackups.value.map((b) => ({ key: String(b.id), label: formatDate(b.timestamp) })));
const duetMachineItems = computed<Array<MachineListItem>>(() => duetMachines.value.map((m) => ({
	key: m.boardGuid, label: m.machineHostname, sublabel: `${m.backupCount} backups · latest ${formatDate(m.latestBackupDate)}`,
})));
async function refreshDuetMachines(): Promise<void> {
	duetLoadingMachines.value = true;
	duetError.value = null;
	try {
		duetMachines.value = await duetListMachines(getDuetCloudApiUrl());
	} catch (e) {
		duetError.value = e instanceof Error ? e.message : String(e);
	} finally {
		duetLoadingMachines.value = false;
	}
}
async function selectDuetMachine(guid: string): Promise<void> {
	duetSelectedGuid.value = guid;
	duetLoadingBackups.value = true;
	duetError.value = null;
	try {
		duetBackups.value = await duetListBackups(getDuetCloudApiUrl(), guid);
	} catch (e) {
		duetError.value = e instanceof Error ? e.message : String(e);
	} finally {
		duetLoadingBackups.value = false;
	}
}
async function onDuetDownload(id: string): Promise<void> {
	const blob = await duetDownload(getDuetCloudApiUrl(), Number(id));
	downloadBlob(`backup-${id}.zip`, blob, "application/zip");
}
async function onDuetRestore(id: string): Promise<void> {
	await loadFile(new File([await duetDownload(getDuetCloudApiUrl(), Number(id))], "backup.zip"));
}
async function onDuetDelete(id: string): Promise<void> {
	if (!duetSelectedGuid.value) { return; }
	if (!(await confirmDelete())) { return; }
	await duetDelete(getDuetCloudApiUrl(), Number(id), duetSelectedGuid.value);
	await selectDuetMachine(duetSelectedGuid.value);
}

// GitHub
const githubMachines = ref<Array<string>>([]);
const githubLoadingMachines = ref(false);
const githubSelectedMachine = ref<string | null>(null);
const githubHistory = ref<Array<GithubBackupRevision>>([]);
const githubLoadingHistory = ref(false);
const githubThisMachineKey = computed(() => getGithubSettings()?.machineName || thisHostname);
const githubMachineItems = computed<Array<MachineListItem>>(() => githubMachines.value.map((name) => ({ key: name, label: name })));
const githubHistoryItems = computed<Array<BackupBrowserItem>>(() => {
	const repo = getGithubSettings()?.repo;
	return githubHistory.value.map((r) => ({
		key: r.sha, label: formatDate(r.date), sublabel: r.message.split("\n")[0],
		viewUrl: repo ? `https://github.com/${repo}/commit/${r.sha}` : undefined,
	}));
});
async function refreshGithubMachines(): Promise<void> {
	const saved = getGithubSettings();
	if (!saved) { return; }
	githubLoadingMachines.value = true;
	try {
		githubMachines.value = await githubListMachines(saved.token, saved.repo, saved.branch);
	} finally {
		githubLoadingMachines.value = false;
	}
}
async function selectGithubMachine(name: string): Promise<void> {
	const saved = getGithubSettings();
	if (!saved) { return; }
	githubSelectedMachine.value = name;
	githubLoadingHistory.value = true;
	try {
		githubHistory.value = await githubListHistory(saved.token, saved.repo, saved.branch, name);
	} finally {
		githubLoadingHistory.value = false;
	}
}
async function onGithubDownload(sha: string): Promise<void> {
	const saved = getGithubSettings();
	if (!saved || !githubSelectedMachine.value) { return; }
	const blob = await downloadBackupAtCommit(saved.token, saved.repo, githubSelectedMachine.value, sha);
	downloadBlob(`backup-${githubSelectedMachine.value}-${sha.slice(0, 7)}.zip`, blob, "application/zip");
}
async function onGithubRestore(sha: string): Promise<void> {
	const saved = getGithubSettings();
	if (!saved || !githubSelectedMachine.value) { return; }
	await loadFile(new File([await downloadBackupAtCommit(saved.token, saved.repo, githubSelectedMachine.value, sha)], "backup.zip"));
}

// Dropbox
const dropboxMachines = ref<Array<string>>([]);
const dropboxLoadingMachines = ref(false);
const dropboxSelectedMachine = ref<string | null>(null);
const dropboxBackups = ref<Array<{ path: string; name: string; size: number; serverModified: string }>>([]);
const dropboxLoadingBackups = ref(false);
const dropboxItems = computed<Array<BackupBrowserItem>>(() => dropboxBackups.value.map((b) => ({ key: b.path, label: b.name, sublabel: formatDate(b.serverModified) })));
const dropboxMachineItems = computed<Array<MachineListItem>>(() => dropboxMachines.value.map((name) => ({ key: name, label: name })));
async function refreshDropboxMachines(): Promise<void> {
	const saved = getDropboxSettings();
	if (!saved) { return; }
	dropboxLoadingMachines.value = true;
	try {
		dropboxMachines.value = await dropboxListMachines(saved.token);
	} finally {
		dropboxLoadingMachines.value = false;
	}
}
async function selectDropboxMachine(hostname: string): Promise<void> {
	const saved = getDropboxSettings();
	if (!saved) { return; }
	dropboxSelectedMachine.value = hostname;
	dropboxLoadingBackups.value = true;
	try {
		dropboxBackups.value = await dropboxListBackups(saved.token, hostname);
	} finally {
		dropboxLoadingBackups.value = false;
	}
}
async function onDropboxDownload(path: string): Promise<void> {
	const saved = getDropboxSettings();
	if (!saved) { return; }
	const blob = await dropboxDownload(saved.token, path);
	downloadBlob(path.split("/").pop() ?? "backup.zip", blob, "application/zip");
}
async function onDropboxRestore(path: string): Promise<void> {
	const saved = getDropboxSettings();
	if (!saved) { return; }
	await loadFile(new File([await dropboxDownload(saved.token, path)], "backup.zip"));
}
async function onDropboxDelete(path: string): Promise<void> {
	const saved = getDropboxSettings();
	if (!saved || !dropboxSelectedMachine.value) { return; }
	if (!(await confirmDelete())) { return; }
	await dropboxDelete(saved.token, path);
	await selectDropboxMachine(dropboxSelectedMachine.value);
}

// WebDAV
const webdavMachines = ref<Array<string>>([]);
const webdavLoadingMachines = ref(false);
const webdavSelectedMachine = ref<string | null>(null);
const webdavBackups = ref<Array<{ path: string; name: string; size: number; lastModified: string | null }>>([]);
const webdavLoadingBackups = ref(false);
const webdavItems = computed<Array<BackupBrowserItem>>(() => webdavBackups.value.map((b) => ({ key: b.path, label: b.name, sublabel: b.lastModified ?? undefined })));
const webdavMachineItems = computed<Array<MachineListItem>>(() => webdavMachines.value.map((name) => ({ key: name, label: name })));
async function refreshWebdavMachines(): Promise<void> {
	const saved = getWebDavSettings();
	if (!saved) { return; }
	webdavLoadingMachines.value = true;
	try {
		webdavMachines.value = await webdavListMachines(saved.url, saved.username, saved.password);
	} finally {
		webdavLoadingMachines.value = false;
	}
}
async function selectWebdavMachine(hostname: string): Promise<void> {
	const saved = getWebDavSettings();
	if (!saved) { return; }
	webdavSelectedMachine.value = hostname;
	webdavLoadingBackups.value = true;
	try {
		webdavBackups.value = await webdavListBackups(saved.url, saved.username, saved.password, hostname);
	} finally {
		webdavLoadingBackups.value = false;
	}
}
async function onWebdavDownload(path: string): Promise<void> {
	const saved = getWebDavSettings();
	if (!saved) { return; }
	const blob = await webdavDownload(saved.url, saved.username, saved.password, path);
	downloadBlob(path.split("/").pop() ?? "backup.zip", blob, "application/zip");
}
async function onWebdavRestore(path: string): Promise<void> {
	const saved = getWebDavSettings();
	if (!saved) { return; }
	await loadFile(new File([await webdavDownload(saved.url, saved.username, saved.password, path)], "backup.zip"));
}
async function onWebdavDelete(path: string): Promise<void> {
	const saved = getWebDavSettings();
	if (!saved || !webdavSelectedMachine.value) { return; }
	if (!(await confirmDelete())) { return; }
	await webdavDelete(saved.url, saved.username, saved.password, path);
	await selectWebdavMachine(webdavSelectedMachine.value);
}

// Lazily fetch the machine list the first time each cloud source is selected.
watch(sourceMode, (mode) => {
	if (mode === "duet" && isCloudSourceConfigured("duet") && duetMachines.value.length === 0) { void refreshDuetMachines(); }
	if (mode === "github" && isCloudSourceConfigured("github") && githubMachines.value.length === 0) { void refreshGithubMachines(); }
	if (mode === "dropbox" && isCloudSourceConfigured("dropbox") && dropboxMachines.value.length === 0) { void refreshDropboxMachines(); }
	if (mode === "webdav" && isCloudSourceConfigured("webdav") && webdavMachines.value.length === 0) { void refreshWebdavMachines(); }
});

function pickFile(): void { fileInput.value?.click(); }
async function loadFile(file: File): Promise<void> {
	loadError.value = null;
	try {
		const parsed = await readArchive(file);
		// readArchive tolerantly reconstructs a manifest by walking files/** even when manifest.json is
		// missing, so an empty file list is the actual signal that this wasn't a recognisable backup.
		if (parsed.manifest.files.length === 0) {
			throw new Error("invalid");
		}
		archive.value = parsed;
		selection.value = new Set(parsed.manifest.files.map((f) => f.path));
		quickBackupDone.value = false;
		quickBackupError.value = null;
		step.value = "tree";
	} catch {
		loadError.value = i18n.global.t("plugins.flexibleLayouts.configBackup.restore.invalidArchive");
	}
}
function onFileInput(ev: Event): void {
	const file = (ev.target as HTMLInputElement).files?.[0];
	if (file) { void loadFile(file); }
}
function onDrop(ev: DragEvent): void {
	const file = ev.dataTransfer?.files?.[0];
	if (file) { void loadFile(file); }
}

const selection = ref<Set<string>>(new Set());

const repairSites = ref<Array<RedactionSite>>([]);
const repairDecisions = ref<Map<number, RepairAction>>(new Map());
const liveFileTexts = ref<Map<string, string>>(new Map());

const preparing = ref(false);
const mode = ref<RestoreMode>("merge");
const plan = ref<RestorePlan | null>(null);
const diff = ref<MachineDiff | null>(null);
const diffOpen = ref(false);
const deletionsConfirmed = ref(false);
const deletionsTyped = ref("");
const overwriteConfirmed = ref(false);

// --- "Back up current state first" suggestion (Mirror mode only, which can delete files) ------------

function installedVersion(): string {
	const plugins = (machineStore.model as { plugins?: Map<string, { version?: string; dwcVersion?: string }> }).plugins;
	const record = plugins?.get(PLUGIN_MANIFEST_ID);
	return record?.version ?? "unknown";
}
function runningDwcVersion(): string {
	try { return (globalThis as { DWC?: { version?: string } }).DWC?.version ?? "unknown"; } catch { return "unknown"; }
}

const quickBackupBusy = ref(false);
const quickBackupDone = ref(false);
const quickBackupError = ref<string | null>(null);

async function onQuickBackup(): Promise<void> {
	quickBackupBusy.value = true;
	quickBackupError.value = null;
	try {
		const io = defaultMachineIO();
		const model = machineStore.model as unknown;
		const directories = buildLiveDirectories(model);
		const scope = { system: true, macros: true, filaments: true, objectModel: true, diagnostics: true };
		const collected = await collectAll(io, { scope, maxFileBytes: DEFAULT_MAX_FILE_BYTES, directories, model, boards: identity.boards });
		const built = await buildArchive(collected, {
			redact: getRedactPreference("local"), scope, machine: identity, directories,
			pluginVersion: installedVersion(), dwcVersion: runningDwcVersion(),
		});
		downloadArchive(built.blob, identity.hostname);
		setLastBackupAt(new Date().toISOString());
		addBackedUpMachineKey(built.manifest.machine.machineKey);
		quickBackupDone.value = true;
	} catch (e) {
		quickBackupError.value = e instanceof Error ? e.message : String(e);
	} finally {
		quickBackupBusy.value = false;
	}
}

async function proceedFromTree(): Promise<void> {
	if (!archive.value) { return; }
	preparing.value = true;
	try {
		const sites = findRedactions(archive.value, selection.value);
		repairSites.value = sites;
		if (sites.length > 0) {
			const io = defaultMachineIO();
			const uniquePaths = Array.from(new Set(sites.map((s) => s.entry.path)));
			const texts = new Map<string, string>();
			for (const path of uniquePaths) {
				const targetPath = mapArchivePathToLive(path);
				if (!targetPath) { continue; }
				try { texts.set(path, await io.downloadText(targetPath)); } catch { /* no live file - none is a valid outcome */ }
			}
			liveFileTexts.value = texts;
			step.value = "repair";
		} else {
			await buildReview();
			step.value = "review";
		}
	} finally {
		preparing.value = false;
	}
}

function mapArchivePathToLive(archivePath: string): string | null {
	if (!archive.value) { return null; }
	const file = archive.value.manifest.files.find((f) => f.path === archivePath);
	if (!file) { return null; }
	const model = machineStore.model as unknown;
	const dirs = buildLiveDirectories(model);
	const prefix = `files/${DIR_FOLDER[file.kind]}/`;
	const rel = archivePath.startsWith(prefix) ? archivePath.slice(prefix.length) : archivePath;
	const root = dirs[file.kind];
	return root.endsWith("/") ? `${root}${rel}` : `${root}/${rel}`;
}

async function proceedFromRepair(): Promise<void> {
	await buildReview();
	step.value = "review";
}

async function buildReview(): Promise<void> {
	if (!archive.value) { return; }
	const io = defaultMachineIO();
	const model = machineStore.model as unknown;
	const liveDirectories = buildLiveDirectories(model);
	const liveIdentity = buildMachineIdentity(model);

	const coveredKinds = BACKUP_DIR_KINDS.filter((k) => archive.value!.manifest.files.some((f) => f.kind === k));
	const liveFiles: Array<{ targetPath: string; kind: BackupDirKind; size: number }> = [];
	for (const kind of coveredKinds) {
		const walk = await walkDirectory(io, liveDirectories[kind], kind, { maxFileBytes: Number.MAX_SAFE_INTEGER });
		for (const f of walk.files) { liveFiles.push({ targetPath: f.source, kind, size: f.size }); }
	}
	const liveExistingPaths = new Set(liveFiles.map((f) => f.targetPath));

	const builtPlan = buildRestorePlan(archive.value, selection.value, liveDirectories, mode.value, liveExistingPaths);
	if (mode.value === "mirror") {
		const { deletions } = computeMirrorDeletions(liveFiles, archive.value, selection.value, liveDirectories);
		builtPlan.deletions = deletions;
	}
	plan.value = builtPlan;

	const configEntry = archive.value.manifest.files.find((f) => f.kind === "system" && f.path.endsWith("/config.g"));
	const configText = configEntry ? archive.value.textFiles.get(configEntry.path) : undefined;
	diff.value = compareMachines(archive.value.manifest, liveIdentity, configText);
}

const canApply = computed(() => {
	if (!plan.value) { return false; }
	if (mode.value === "mirror" && plan.value.deletions.length > 0) {
		if (!deletionsConfirmed.value) { return false; }
		if (plan.value.deletions.length > 20 && deletionsTyped.value !== "DELETE") { return false; }
		return true;
	}
	return overwriteConfirmed.value;
});

const applying = ref(false);
const applyError = ref<string | null>(null);
const applyResult = ref<ApplyRestoreResult | null>(null);
const applyProgressDone = ref(0);
const applyProgressTotal = ref(1);
const applyProgressPct = computed(() => (applyProgressTotal.value > 0 ? (applyProgressDone.value / applyProgressTotal.value) * 100 : 0));

const writtenCount = computed(() => applyResult.value?.results.filter((r) => r.status === "written").length ?? 0);
const deletedCount = computed(() => applyResult.value?.results.filter((r) => r.status === "deleted").length ?? 0);
const failedResults = computed(() => applyResult.value?.results.filter((r) => r.status === "failed") ?? []);
const failedCount = computed(() => failedResults.value.length);
/** Target paths of files that got a "comment out this line" redaction repair and were actually written
 * - these still need finishing by hand (e.g. a commented-out WiFi line means the machine won't
 * reconnect until someone edits it), so the result screen calls them out explicitly rather than
 * silently reporting a plain "written" success. */
const commentedOutFiles = ref<Array<string>>([]);

async function onApply(): Promise<void> {
	if (!archive.value || !plan.value) { return; }
	applying.value = true;
	applyError.value = null;
	applyProgressDone.value = 0;
	applyProgressTotal.value = plan.value.entries.filter((e) => e.status !== "invalid").length + plan.value.deletions.length || 1;
	try {
		const contentOverrides = new Map<string, string>();
		if (repairSites.value.length > 0) {
			const byPath = new Map<string, Array<RedactionSite>>();
			for (const s of repairSites.value) {
				if (!byPath.has(s.entry.path)) { byPath.set(s.entry.path, []); }
				byPath.get(s.entry.path)!.push(s);
			}
			for (const [path, sites] of byPath) {
				const original = archive.value.textFiles.get(path);
				if (original == null) { continue; }
				contentOverrides.set(path, applyRepairsToFile(path, original, sites, repairDecisions.value));
			}
		}
		const io = defaultMachineIO();
		const status = (machineStore.model as { state?: { status?: string } })?.state?.status;
		const result = await applyRestorePlan(io, {
			archive: archive.value, plan: plan.value, contentOverrides, machineStatus: status,
			onProgress: (done, total) => { applyProgressDone.value = done; applyProgressTotal.value = total; },
		});
		applyResult.value = result;

		const commentedOutArchivePaths = new Set<string>();
		for (const s of repairSites.value) {
			if (repairDecisions.value.get(s.entry.id)?.type === "comment-out") { commentedOutArchivePaths.add(s.entry.path); }
		}
		const archiveToTarget = new Map(plan.value!.entries.map((e) => [e.archivePath, e.targetPath]));
		const writtenTargets = new Set(result.results.filter((r) => r.status === "written").map((r) => r.targetPath));
		commentedOutFiles.value = Array.from(commentedOutArchivePaths)
			.map((p) => archiveToTarget.get(p))
			.filter((p): p is string => p != null && writtenTargets.has(p));

		if (result.touchedConfigG) {
			const ok = await showConfirmDialog(
				i18n.global.t("plugins.flexibleLayouts.configBackup.restore.promptM999Title"),
				i18n.global.t("plugins.flexibleLayouts.configBackup.restore.promptM999Body"),
				"mdi-restart",
			);
			if (ok) { await io.sendCode("M999"); }
		}
	} catch (e) {
		applyError.value = e instanceof Error ? e.message : String(e);
	} finally {
		applying.value = false;
	}
}

function statusColor(status: string): string {
	return status === "invalid" ? "error" : status === "overwrite" ? "warning" : "info";
}
function statusLabel(status: string): string {
	switch (status) {
		case "new": return i18n.global.t("plugins.flexibleLayouts.configBackup.restore.planStatusNew");
		case "overwrite": return i18n.global.t("plugins.flexibleLayouts.configBackup.restore.planStatusOverwrite");
		case "invalid": return i18n.global.t("plugins.flexibleLayouts.configBackup.restore.planStatusInvalid");
		default: return status;
	}
}
</script>
