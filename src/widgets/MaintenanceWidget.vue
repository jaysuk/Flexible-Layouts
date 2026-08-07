<template>
	<div class="mnt-root fill-height d-flex flex-column px-2 py-1">
		<span v-if="widget.label" class="mnt-label text-truncate flex-shrink-0">{{ widget.label }}</span>

		<div v-if="!trackingConfigured" class="text-caption text-medium-emphasis pa-2 flex-grow-1">
			{{ $t("plugins.flexibleLayouts.maintenance.notSetUp") }}
		</div>
		<div v-else class="mnt-body flex-grow-1">
			<div class="mnt-row">
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
const jobCounts = ref({ finished: 0, cancelled: 0 });

const spindleHoursDisplay = computed(() => (liveSpindleSeconds.value != null ? (liveSpindleSeconds.value / 3600).toFixed(1) : "—"));

onMounted(async () => {
	if (!machineStore.isConnected) { return; }
	const io = defaultMachineIO();
	const missing = await maintenanceMacrosMissing(io);
	trackingConfigured.value = !missing && !(await maintenanceMacrosOutdated(io));

	const spindleSec = resolveOmPath(machineStore.model, "global.flMaintSpindleSec");
	liveSpindleSeconds.value = typeof spindleSec === "number" ? spindleSec : null;

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
