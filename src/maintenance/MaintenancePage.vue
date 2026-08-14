<template>
	<v-container fluid class="py-4">
		<div class="d-flex align-center mb-4">
			<v-icon size="large" class="me-3">mdi-wrench-cog-outline</v-icon>
			<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.maintenance.title") }}</div>
			<v-spacer />
			<v-btn size="small" variant="tonal" prepend-icon="mdi-cog-outline" @click="setupOpen = true">
				{{ $t("plugins.flexibleLayouts.maintenance.setupAction") }}
			</v-btn>
		</div>

		<v-alert v-if="!trackingConfigured" type="info" variant="tonal" density="compact" class="mb-4">
			{{ $t("plugins.flexibleLayouts.maintenance.notSetUp") }}
		</v-alert>

		<v-row dense class="mb-4">
			<template v-if="isFff">
				<v-col cols="6" sm="3">
					<v-card variant="tonal" class="pa-3 text-center">
						<div class="text-h6">{{ printHoursDisplay }}</div>
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.printHours") }}</div>
					</v-card>
				</v-col>
				<v-col cols="6" sm="3">
					<v-card variant="tonal" class="pa-3 text-center">
						<div class="text-h6">{{ filamentUsedDisplay }}</div>
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.filamentUsed") }}</div>
					</v-card>
				</v-col>
				<v-col cols="6" sm="3">
					<v-card variant="tonal" class="pa-3 text-center">
						<div class="text-h6">{{ toolChangesDisplay }}</div>
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.toolChanges") }}</div>
					</v-card>
				</v-col>
			</template>
			<v-col v-else cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ spindleHoursDisplay }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.spindleHours") }}</div>
				</v-card>
			</v-col>
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ jobCounts.finished }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsCompleted") }}</div>
				</v-card>
			</v-col>
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ jobCounts.cancelled }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsCancelled") }}</div>
				</v-card>
			</v-col>
		</v-row>

		<v-card variant="outlined" class="mb-4">
			<v-card-text class="d-flex ga-2 align-start flex-wrap">
				<v-select v-model="newCategory" :items="categoryItems" density="compact" variant="outlined" hide-details
						  :label="$t('plugins.flexibleLayouts.maintenance.category')" style="max-width: 220px;" />
				<v-text-field v-model="newNote" density="compact" variant="outlined" hide-details
							  :label="$t('plugins.flexibleLayouts.maintenance.note')" class="flex-grow-1" style="min-width: 200px;" />
				<v-btn color="primary" :loading="logging" @click="onLogEntry">{{ $t("plugins.flexibleLayouts.maintenance.addEntry") }}</v-btn>
			</v-card-text>
		</v-card>

		<div class="text-subtitle-2 mb-1">{{ $t("plugins.flexibleLayouts.maintenance.entriesTitle") }}</div>
		<div v-if="!log.entries.length" class="text-caption text-medium-emphasis">
			{{ $t("plugins.flexibleLayouts.maintenance.noEntriesYet") }}
		</div>
		<div v-for="entry in sortedEntries" :key="entry.id" class="d-flex align-center py-1" style="border-bottom: 1px solid rgba(127,127,127,0.15)">
			<div class="flex-grow-1">
				<div class="text-body-2">{{ formatWhen(entry.loggedAt) }} — {{ categoryLabel(entry.category) }}</div>
				<div v-if="entry.note" class="text-caption text-medium-emphasis">{{ entry.note }}</div>
			</div>
			<div v-if="sinceEntry(entry) != null" class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.maintenance.sinceLastService", { hours: sinceEntry(entry) }) }}
			</div>
		</div>

		<MaintenanceSetupDialog v-model="setupOpen" />
	</v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { can, requestAdmin } from "../model/access";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { DEFAULT_EVENT_LOG_FILE } from "../model/maintenance/configPatch";
import { countJobEvents, parseEventLog, totalJobSeconds } from "../model/maintenance/eventLog";
import { appendMaintenanceEntry, emptyMaintenanceLog, mostRecentEntry, readMaintenanceLog, secondsSince, type MaintenanceEntry, type MaintenanceLog } from "../model/maintenance/log";
import { maintenanceMacrosMissing, maintenanceMacrosOutdated } from "../model/maintenance/macros";
import { resolveOmPath } from "../util/omPath";
import MaintenanceSetupDialog from "./MaintenanceSetupDialog.vue";

const machineStore = useMachineStore();

const setupOpen = ref(false);
const trackingConfigured = ref(false);

const liveSpindleSeconds = ref<number | null>(null);
const livePrintSeconds = ref<number | null>(null);
const liveFilamentMm = ref<number | null>(null);
const liveToolChanges = ref<number | null>(null);
const liveJobSeconds = ref<number | null>(null);
const jobCounts = ref({ finished: 0, cancelled: 0 });
const log = ref<MaintenanceLog>(emptyMaintenanceLog());

const isFff = computed(() => resolveOmPath(machineStore.model, "state.machineMode") === "FFF");

const spindleHoursDisplay = computed(() => (liveSpindleSeconds.value != null ? (liveSpindleSeconds.value / 3600).toFixed(1) : "—"));
const printHoursDisplay = computed(() => (livePrintSeconds.value != null ? (livePrintSeconds.value / 3600).toFixed(1) : "—"));
const filamentUsedDisplay = computed(() => (liveFilamentMm.value != null ? (liveFilamentMm.value / 1000).toFixed(1) + " m" : "—"));
const toolChangesDisplay = computed(() => (liveToolChanges.value != null ? String(liveToolChanges.value) : "—"));

async function refresh(): Promise<void> {
	const io = defaultMachineIO();

	const missing = await maintenanceMacrosMissing(io);
	trackingConfigured.value = !missing && !(await maintenanceMacrosOutdated(io));

	const spindleSec = resolveOmPath(machineStore.model, "global.flMaintSpindleSec");
	liveSpindleSeconds.value = typeof spindleSec === "number" ? spindleSec : null;
	const printSec = resolveOmPath(machineStore.model, "global.flMaintPrintSec");
	livePrintSeconds.value = typeof printSec === "number" ? printSec : null;
	const filamentMm = resolveOmPath(machineStore.model, "global.flMaintFilamentMm");
	liveFilamentMm.value = typeof filamentMm === "number" ? filamentMm : null;
	const toolChanges = resolveOmPath(machineStore.model, "global.flMaintToolChanges");
	liveToolChanges.value = typeof toolChanges === "number" ? toolChanges : null;

	try {
		const systemDir = (machineStore.model as { directories?: { system?: string } }).directories?.system || "0:/sys";
		const text = await io.downloadText(`${systemDir}/${DEFAULT_EVENT_LOG_FILE}`);
		const events = parseEventLog(text);
		liveJobSeconds.value = totalJobSeconds(events);
		jobCounts.value = countJobEvents(events);
	} catch {
		liveJobSeconds.value = null; // no log file yet (not set up, or nothing's run since)
	}

	log.value = await readMaintenanceLog();
}

onMounted(() => { void refresh(); });

// --- Logging a new entry ------------------------------------------------------------------------------

const categoryItems = [
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryCollet"), value: "collet" },
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryBelt"), value: "belt" },
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryLubrication"), value: "lubrication" },
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryCustom"), value: "custom" },
];
function categoryLabel(value: string): string {
	return categoryItems.find((c) => c.value === value)?.title ?? value;
}

const newCategory = ref("collet");
const newNote = ref("");
const logging = ref(false);

async function onLogEntry(): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	logging.value = true;
	try {
		await appendMaintenanceEntry({
			loggedAt: Date.now(),
			category: newCategory.value,
			note: newNote.value,
			spindleSecondsAtEntry: liveSpindleSeconds.value,
			jobSecondsAtEntry: liveJobSeconds.value,
			printSecondsAtEntry: livePrintSeconds.value,
			filamentMmAtEntry: liveFilamentMm.value,
			toolChangesAtEntry: liveToolChanges.value,
		});
		newNote.value = "";
		log.value = await readMaintenanceLog();
	} finally {
		logging.value = false;
	}
}

// --- Display helpers -----------------------------------------------------------------------------------

const sortedEntries = computed(() => [...log.value.entries].sort((a, b) => b.loggedAt - a.loggedAt));

function formatWhen(loggedAt: number): string {
	try { return new Date(loggedAt).toLocaleString(); } catch { return String(loggedAt); }
}

/** "Hours since THIS entry's category was last logged" - null when the relevant live counter or this
 *  entry's own baseline is unavailable, rather than showing a misleadingly precise number. Compares
 *  print-hours on an FFF machine, spindle-hours otherwise - whichever this machine's mode actually
 *  accumulates, matching what's shown as the live stat above. */
function sinceEntry(entry: MaintenanceEntry): string | null {
	if (mostRecentEntry(log.value, entry.category)?.id !== entry.id) { return null; } // only the newest entry per category shows this
	const seconds = isFff.value
		? secondsSince(livePrintSeconds.value, entry.printSecondsAtEntry ?? null)
		: secondsSince(liveSpindleSeconds.value, entry.spindleSecondsAtEntry);
	return seconds != null ? (seconds / 3600).toFixed(1) : null;
}
</script>
