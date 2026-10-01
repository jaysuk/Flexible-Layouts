<template>
	<section aria-labelledby="fw-changes-title">
		<div id="fw-changes-title" class="text-title-small mb-1">{{ $t("plugins.flexibleLayouts.firmwareChanges.title") }}</div>
		<p class="text-body-small text-medium-emphasis mt-0 mb-2">{{ $t("plugins.flexibleLayouts.firmwareChanges.hint") }}</p>

		<v-alert v-if="pending" type="info" variant="tonal" density="comfortable" class="mb-2" data-test="pending">
			<div class="d-flex align-center flex-wrap ga-2">
				<div class="flex-grow-1">
					{{ $t("plugins.flexibleLayouts.firmwareChanges.pending", { from: state.baseline, to: running }) }}
					<span v-if="state.lastScan" class="text-caption d-block">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.lastScan", { lines: state.lastScan.occurrences, files: state.lastScan.files }) }}
					</span>
				</div>
				<v-btn color="primary" variant="flat" :loading="busy" @click="viewReport">
					{{ $t("plugins.flexibleLayouts.firmwareChanges.viewReport") }}
				</v-btn>
			</div>
		</v-alert>
		<div v-else-if="state.baseline" class="text-caption text-medium-emphasis mb-2">
			{{ $t("plugins.flexibleLayouts.firmwareChanges.reviewedAgainst", { version: state.baseline }) }}
		</div>
		<div v-else class="text-caption text-medium-emphasis mb-2">{{ $t("plugins.flexibleLayouts.firmwareChanges.noBaseline") }}</div>

		<v-switch :model-value="state.enabled" color="primary" density="compact" hide-details
				  :label="$t('plugins.flexibleLayouts.firmwareChanges.enabled')" @update:model-value="setEnabled" />
		<v-switch :model-value="state.editorWarnings" color="primary" density="compact" hide-details :disabled="!state.enabled"
				  :label="$t('plugins.flexibleLayouts.firmwareChanges.editorWarnings')" @update:model-value="setEditorWarnings" />

		<div class="d-flex flex-wrap align-center ga-2 mt-2">
			<v-btn variant="tonal" prepend-icon="mdi-text-box-search-outline" :disabled="!connected" :loading="busy" @click="checkNow">
				{{ $t("plugins.flexibleLayouts.firmwareChanges.checkNow") }}
			</v-btn>
			<v-text-field v-model="manualVersion" density="compact" hide-details variant="outlined" class="fw-manual"
						  :label="$t('plugins.flexibleLayouts.firmwareChanges.manualLabel')" placeholder="3.6.3"
						  :error="manualInvalid" @keydown.enter="checkManual" />
			<v-btn variant="tonal" :disabled="!connected || !manualValid" :loading="busy" @click="checkManual">
				{{ $t("plugins.flexibleLayouts.firmwareChanges.manualCheck") }}
			</v-btn>
		</div>
		<div v-if="manualInvalid" class="text-caption text-error mt-1" role="alert">
			{{ $t("plugins.flexibleLayouts.firmwareChanges.manualInvalid") }}
		</div>
		<div v-if="!connected" class="text-caption text-warning mt-1">{{ $t("plugins.flexibleLayouts.firmwareChanges.needConnection") }}</div>

		<FirmwareChangesDialog v-model="dialogOpen" :attach="attach" />
	</section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import { firmwareChangeReport, firmwareScanBusy, reportOpenRequested, runFirmwareScan } from "../model/firmware/changeCheck";
import {
	mainBoardFirmwareVersion, normaliseFirmwareVersion, readFirmwareChangeState, writeFirmwareChangeState,
} from "../model/firmware/changeState";
import FirmwareChangesDialog from "./FirmwareChangesDialog.vue";

// `attach` is passed on to the report dialog purely for testability (see FirmwareChangesDialog.vue).
defineProps<{ attach?: boolean | string }>();

const machineStore = useMachineStore();
const state = computed(() => readFirmwareChangeState());
const connected = computed(() => machineStore.isConnected);
const running = computed(() => mainBoardFirmwareVersion(machineStore.model));
const busy = computed(() => firmwareScanBusy.value);
/** A firmware change nobody has marked reviewed: the baseline is not the running version. */
const pending = computed(() => state.value.enabled && state.value.baseline !== null && running.value !== null && state.value.baseline !== running.value);

const dialogOpen = ref(false);
const manualVersion = ref("");
const manualValid = computed(() => normaliseFirmwareVersion(manualVersion.value) !== null);
const manualInvalid = computed(() => manualVersion.value.trim() !== "" && !manualValid.value);

function setEnabled(value: boolean | null): void { writeFirmwareChangeState({ enabled: value === true }); }
function setEditorWarnings(value: boolean | null): void { writeFirmwareChangeState({ editorWarnings: value === true }); }

async function scanAndShow(from: string): Promise<void> {
	const to = running.value;
	if (to === null) return;
	await runFirmwareScan(from, to);
	dialogOpen.value = true;
}

/** The report for the pending change (or, with nothing pending, whatever the last one showed). */
async function viewReport(): Promise<void> {
	const s = state.value;
	if (firmwareChangeReport.value === null && s.baseline !== null) { await scanAndShow(s.baseline); return; }
	dialogOpen.value = true;
}

async function checkNow(): Promise<void> {
	const from = state.value.baseline;
	if (from === null) { dialogOpen.value = true; return; } // the dialog explains there is nothing to compare with yet
	await scanAndShow(from);
}

async function checkManual(): Promise<void> {
	const from = normaliseFirmwareVersion(manualVersion.value);
	if (from !== null && connected.value) await scanAndShow(from);
}

// The toast's click-through lands on this page but can only name the page, so it leaves a flag for this card to pick up.
watch(reportOpenRequested, (requested) => {
	if (!requested) return;
	reportOpenRequested.value = false;
	dialogOpen.value = true;
}, { immediate: true });
</script>

<style scoped>
.fw-manual { max-width: 12rem; }
</style>
