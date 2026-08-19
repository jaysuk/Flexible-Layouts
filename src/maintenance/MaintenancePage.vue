<template>
	<v-container fluid class="py-4">
		<div class="d-flex align-center mb-4">
			<v-icon size="large" class="me-3">mdi-wrench-cog-outline</v-icon>
			<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.maintenance.title") }}</div>
			<v-spacer />
			<v-switch v-if="trackingConfigured" :model-value="trackingEnabled" density="compact" hide-details
					  :disabled="togglingTracking" class="me-3" style="flex: none;"
					  :label="trackingEnabled ? $t('plugins.flexibleLayouts.maintenance.trackingOn') : $t('plugins.flexibleLayouts.maintenance.trackingOff')"
					  @update:model-value="(v) => onToggleTracking(v === true)" />
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
					<div class="text-h6">{{ jobCounts.started }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsStarted") }}</div>
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
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ powerOnHoursDisplay }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.powerOnHours") }}</div>
				</v-card>
			</v-col>
			<v-col v-if="isFff" cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ filamentErrorsDisplay }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.filamentErrors") }}</div>
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
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { can, requestAdmin } from "../model/access";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { DEFAULT_EVENT_LOG_FILE } from "../model/maintenance/configPatch";
import { parseEventLog, totalJobSeconds } from "../model/maintenance/eventLog";
import { appendMaintenanceEntry, emptyMaintenanceLog, mostRecentEntry, readMaintenanceLog, secondsSince, type MaintenanceEntry, type MaintenanceLog } from "../model/maintenance/log";
import { maintenanceMacrosMissing, maintenanceMacrosOutdated, seedMaintenanceState } from "../model/maintenance/macros";
import { resolveOmPath } from "../util/omPath";
import MaintenanceSetupDialog from "./MaintenanceSetupDialog.vue";

const machineStore = useMachineStore();

const setupOpen = ref(false);
const trackingConfigured = ref(false);
const togglingTracking = ref(false);

// Job history (liveJobSeconds/jobCounts) and the maintenance log itself need an actual SD-card read,
// so they can't be plain computeds - refreshed on mount and on a timer below (EVENT_LOG_POLL_MS). Every
// other live figure below reads straight off the live object model (already reactive, pushed by DWC's
// own poll/websocket) via a computed, so it updates the instant the machine reports a new value - no
// manual refresh, no stale numbers left over from whenever the page happened to last mount.
function liveNumber(path: string): number | null {
	const v = resolveOmPath(machineStore.model, path);
	return typeof v === "number" ? v : null;
}
function liveBool(path: string, fallback: boolean): boolean {
	const v = resolveOmPath(machineStore.model, path);
	return typeof v === "boolean" ? v : fallback;
}

const liveJobSeconds = ref<number | null>(null);
const log = ref<MaintenanceLog>(emptyMaintenanceLog());

const isFff = computed(() => resolveOmPath(machineStore.model, "state.machineMode") === "FFF");

const liveSpindleSeconds = computed(() => liveNumber("global.flMaintSpindleSec"));
const livePrintSeconds = computed(() => liveNumber("global.flMaintPrintSec"));
const liveFilamentMm = computed(() => liveNumber("global.flMaintFilamentMm"));
const liveToolChanges = computed(() => liveNumber("global.flMaintToolChanges"));
const livePowerOnSeconds = computed(() => liveNumber("global.flMaintPowerOnSec"));
const liveFilamentErrors = computed(() => liveNumber("global.flMaintFilamentErrors"));
const trackingEnabled = computed(() => liveBool("global.flMaintEnabled", true));

// Job started/finished/cancelled counts are incremented directly by start.g/stop.g/cancel.g
// (jobTrackingPatch.ts) - NOT parsed from RRF's WARN-level event log text. That text-matching approach
// (still used below only for liveJobSeconds, a low-visibility duration figure) had no way to scope
// "started" to actually being about a print - any warn-level line merely containing that word counted,
// which is what let this figure climb on a real user's machine without them starting a job.
const jobCounts = computed(() => ({
	started: liveNumber("global.flMaintJobsStarted") ?? 0,
	finished: liveNumber("global.flMaintJobsFinished") ?? 0,
	cancelled: liveNumber("global.flMaintJobsCancelled") ?? 0,
}));

const spindleHoursDisplay = computed(() => (liveSpindleSeconds.value != null ? (liveSpindleSeconds.value / 3600).toFixed(1) : "—"));
const printHoursDisplay = computed(() => (livePrintSeconds.value != null ? (livePrintSeconds.value / 3600).toFixed(1) : "—"));
const filamentUsedDisplay = computed(() => (liveFilamentMm.value != null ? (liveFilamentMm.value / 1000).toFixed(1) + " m" : "—"));
const toolChangesDisplay = computed(() => (liveToolChanges.value != null ? String(liveToolChanges.value) : "—"));
const powerOnHoursDisplay = computed(() => (livePowerOnSeconds.value != null ? (livePowerOnSeconds.value / 3600).toFixed(1) : "—"));
const filamentErrorsDisplay = computed(() => (liveFilamentErrors.value != null ? String(liveFilamentErrors.value) : "—"));

/** Checks the deployed-macros status once - this needs an SD-card download and only ever changes when
 *  the setup dialog is applied (which calls this itself), so it isn't worth polling. */
async function checkTrackingConfigured(): Promise<void> {
	const io = defaultMachineIO();
	const missing = await maintenanceMacrosMissing(io);
	trackingConfigured.value = !missing && !(await maintenanceMacrosOutdated(io));
}

/** Re-reads the event log (for liveJobSeconds only - job COUNTS come from the object model above) and
 *  the maintenance log from the SD card - the only remaining "values" on this page that need an actual
 *  fetch rather than a reactive OM read. Called on mount and on a timer. */
async function refreshJobHistory(): Promise<void> {
	const io = defaultMachineIO();
	try {
		const systemDir = (machineStore.model as { directories?: { system?: string } }).directories?.system || "0:/sys";
		const text = await io.downloadText(`${systemDir}/${DEFAULT_EVENT_LOG_FILE}`);
		liveJobSeconds.value = totalJobSeconds(parseEventLog(text));
	} catch {
		liveJobSeconds.value = null; // no log file yet (not set up, or nothing's run since)
	}
	log.value = await readMaintenanceLog();
}

const EVENT_LOG_POLL_MS = 10000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
	void checkTrackingConfigured();
	void refreshJobHistory();
	pollTimer = setInterval(() => { void refreshJobHistory(); }, EVENT_LOG_POLL_MS);
});
onBeforeUnmount(() => {
	if (pollTimer) { clearInterval(pollTimer); }
});

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

// --- Pause/resume tracking -------------------------------------------------------------------------------

/** Rewrites the whole persisted-state file with every currently-known total unchanged and just the
 *  enabled flag flipped - seedMaintenanceState always rewrites the full file (there's no smaller
 *  "patch one field" primitive), so every other counter has to be resupplied from its live OM value
 *  or pausing would silently reset it back to 0. */
async function onToggleTracking(enabled: boolean): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	togglingTracking.value = true;
	try {
		const io = defaultMachineIO();
		const numOm = (path: string): number => {
			const v = resolveOmPath(machineStore.model, path);
			return typeof v === "number" ? v : 0;
		};
		// trackingEnabled itself is a computed off the live OM (global.flMaintEnabled), so no local
		// assignment on success is needed here - it reflects the new state as soon as
		// seedMaintenanceState's M98 reload lands, same as every other figure on this page.
		await seedMaintenanceState(io, numOm("global.flMaintSpindleIndex"), numOm("global.flMaintSpindleSec"), {
			printSeconds: numOm("global.flMaintPrintSec"),
			filamentMm: numOm("global.flMaintFilamentMm"),
			toolChanges: numOm("global.flMaintToolChanges"),
			powerOnSeconds: numOm("global.flMaintPowerOnSec"),
			filamentErrors: numOm("global.flMaintFilamentErrors"),
			jobsStarted: numOm("global.flMaintJobsStarted"),
			jobsFinished: numOm("global.flMaintJobsFinished"),
			jobsCancelled: numOm("global.flMaintJobsCancelled"),
		}, enabled);
	} finally {
		togglingTracking.value = false;
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
