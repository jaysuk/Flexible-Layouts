<template>
	<div class="mnt-root fill-height d-flex flex-column px-2 py-1">
		<span v-if="widget.label" class="mnt-label text-truncate flex-shrink-0">{{ widget.label }}</span>

		<div v-if="!trackingConfigured" class="text-caption text-medium-emphasis pa-2 flex-grow-1">
			{{ $t("plugins.flexibleLayouts.maintenance.notSetUp") }}
		</div>
		<div v-else class="mnt-body flex-grow-1">
			<template v-if="isFff">
				<div class="mnt-row">
					<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.printHours") }}</span>
					<span class="mnt-value">{{ printHoursDisplay }}</span>
				</div>
				<div class="mnt-row">
					<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.filamentUsed") }}</span>
					<span class="mnt-value">{{ filamentUsedDisplay }}</span>
				</div>
				<div class="mnt-row">
					<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.toolChanges") }}</span>
					<span class="mnt-value">{{ toolChangesDisplay }}</span>
				</div>
			</template>
			<div v-else class="mnt-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.spindleHours") }}</span>
				<span class="mnt-value">{{ spindleHoursDisplay }}</span>
			</div>
			<div class="mnt-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsCompleted") }}</span>
				<span class="mnt-value">{{ jobCounts.finished }}</span>
			</div>
			<div class="mnt-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsCancelled") }}</span>
				<span class="mnt-value">{{ jobCounts.cancelled }}</span>
			</div>
			<div class="mnt-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.powerOnHours") }}</span>
				<span class="mnt-value">{{ powerOnHoursDisplay }}</span>
			</div>
			<div v-if="isFff" class="mnt-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.filamentErrors") }}</span>
				<span class="mnt-value">{{ filamentErrorsDisplay }}</span>
			</div>
			<!-- Summed across every tracked axis, not a per-axis breakdown - this tile is too small for
				 a multi-row table per axis/fan/heater; that detail lives on the full Maintenance page. -->
			<div v-if="totalAxisTravelDisplay" class="mnt-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.totalAxisTravel") }}</span>
				<span class="mnt-value">{{ totalAxisTravelDisplay }}</span>
			</div>
		</div>

		<div class="d-flex align-center ga-2 flex-shrink-0">
			<v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-grow-1" prepend-icon="mdi-open-in-new" @click="open">
				{{ $t("plugins.flexibleLayouts.maintenance.title") }}
			</v-btn>
			<!-- Item H: a single count badge, not per-rule detail - that lives on the full page. -->
			<v-chip v-if="dueCount > 0" size="small" color="warning" variant="flat" :title="$t('plugins.flexibleLayouts.maintenance.remindersTitle')">
				{{ dueCount }}
			</v-chip>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { MAINTENANCE_ROUTE_PATH } from "../model/maintenance/constants";
import { baselineForCounter, mostRecentEntryForCounter, OM_PATH_FOR_COUNTER, readMaintenanceLog, secondsSince } from "../model/maintenance/log";
import { maintenanceMacrosMissing, maintenanceMacrosOutdated } from "../model/maintenance/macros";
import { computeDueStatus } from "../model/reminders/dueStatus";
import { getIntervalRules } from "../model/reminders/storage";
import { resolveOmPath } from "../util/omPath";

defineProps<{ widget: Extract<Widget, { type: "maintenanceWidget" }> }>();
const machineStore = useMachineStore();
const router = useRouter();

const trackingConfigured = ref(false);

// state.machineMode drives which stats make sense to show - a spindle-hours figure is meaningless on
// an FFF machine (and vice versa for filament/tool-change counts on a CNC/laser one).
const isFff = computed(() => resolveOmPath(machineStore.model, "state.machineMode") === "FFF");

// Every figure below reads straight off the live object model via a computed, so it updates the
// instant the machine reports a new value (already reactive - DWC pushes model updates on its own
// poll/websocket) - no manual refresh, no polling, no stale numbers left over from whenever this
// widget happened to last mount. Job counts are incremented directly by start.g/stop.g/cancel.g
// (jobTrackingPatch.ts), so - unlike before - they're just as reactive as everything else here; no
// SD-card event-log fetch is needed for this widget at all any more.
function liveNumber(path: string): number | null {
	const v = resolveOmPath(machineStore.model, path);
	return typeof v === "number" ? v : null;
}
const liveSpindleSeconds = computed(() => liveNumber("global.flMaintSpindleSec"));
const livePrintSeconds = computed(() => liveNumber("global.flMaintPrintSec"));
const liveFilamentMm = computed(() => liveNumber("global.flMaintFilamentMm"));
const liveToolChanges = computed(() => liveNumber("global.flMaintToolChanges"));
const livePowerOnSeconds = computed(() => liveNumber("global.flMaintPowerOnSec"));
const liveFilamentErrors = computed(() => liveNumber("global.flMaintFilamentErrors"));
// Summed rather than per-axis (see the template comment) - null (not 0) when the array itself isn't
// there yet (e.g. tracking configured before the v8 macro update), same "show a dash, not a lie"
// convention liveNumber already uses for every other figure on this widget.
const totalAxisTravelMm = computed(() => {
	const v = resolveOmPath(machineStore.model, "global.flMaintAxisMm");
	return Array.isArray(v) ? v.reduce((sum: number, n) => sum + (typeof n === "number" ? n : 0), 0) : null;
});
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
const totalAxisTravelDisplay = computed(() => (totalAxisTravelMm.value != null ? (totalAxisTravelMm.value / 1000).toFixed(1) + " m" : ""));

// --- Item H: due-reminder count -------------------------------------------------------------------
const dueCount = ref(0);
async function refreshDueCount(): Promise<void> {
	const rules = getIntervalRules().filter((r) => r.enabled);
	if (!rules.length) { dueCount.value = 0; return; }
	const log = await readMaintenanceLog();
	dueCount.value = rules.filter((rule) => {
		const live = liveNumber(OM_PATH_FOR_COUNTER[rule.counter]);
		const entry = mostRecentEntryForCounter(log, rule.counter);
		const baseline = entry ? baselineForCounter(entry, rule.counter) : null;
		const status = computeDueStatus(secondsSince(live, baseline), rule.intervalValue);
		return status === "dueSoon" || status === "overdue";
	}).length;
}

onMounted(async () => {
	if (!machineStore.isConnected) { return; }
	const io = defaultMachineIO();
	const missing = await maintenanceMacrosMissing(io);
	trackingConfigured.value = !missing && !(await maintenanceMacrosOutdated(io));
	void refreshDueCount();
});

function open(): void {
	router.push(MAINTENANCE_ROUTE_PATH);
}
</script>

<style scoped>
.mnt-root { min-height: 0; }
.mnt-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.mnt-body { min-height: 0; overflow-y: auto; }
.mnt-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0; }
.mnt-value { font-weight: 600; }
</style>
