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
		</div>

		<v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-shrink-0" prepend-icon="mdi-open-in-new" @click="open">
			{{ $t("plugins.flexibleLayouts.maintenance.title") }}
		</v-btn>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { MAINTENANCE_ROUTE_PATH } from "../model/maintenance/constants";
import { DEFAULT_EVENT_LOG_FILE } from "../model/maintenance/configPatch";
import { countJobEvents, parseEventLog } from "../model/maintenance/eventLog";
import { maintenanceMacrosMissing, maintenanceMacrosOutdated } from "../model/maintenance/macros";
import { resolveOmPath } from "../util/omPath";

defineProps<{ widget: Extract<Widget, { type: "maintenanceWidget" }> }>();
const machineStore = useMachineStore();
const router = useRouter();

const trackingConfigured = ref(false);
const liveSpindleSeconds = ref<number | null>(null);
const livePrintSeconds = ref<number | null>(null);
const liveFilamentMm = ref<number | null>(null);
const liveToolChanges = ref<number | null>(null);
const jobCounts = ref({ finished: 0, cancelled: 0 });

// state.machineMode drives which stats make sense to show - a spindle-hours figure is meaningless on
// an FFF machine (and vice versa for filament/tool-change counts on a CNC/laser one).
const isFff = computed(() => resolveOmPath(machineStore.model, "state.machineMode") === "FFF");

const spindleHoursDisplay = computed(() => (liveSpindleSeconds.value != null ? (liveSpindleSeconds.value / 3600).toFixed(1) : "—"));
const printHoursDisplay = computed(() => (livePrintSeconds.value != null ? (livePrintSeconds.value / 3600).toFixed(1) : "—"));
const filamentUsedDisplay = computed(() => (liveFilamentMm.value != null ? (liveFilamentMm.value / 1000).toFixed(1) + " m" : "—"));
const toolChangesDisplay = computed(() => (liveToolChanges.value != null ? String(liveToolChanges.value) : "—"));

onMounted(async () => {
	if (!machineStore.isConnected) { return; }
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
		jobCounts.value = countJobEvents(parseEventLog(text));
	} catch { /* no event log yet */ }
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
