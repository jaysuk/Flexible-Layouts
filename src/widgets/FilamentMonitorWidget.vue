<template>
	<div class="fm-root fill-height d-flex flex-column justify-center px-2 py-1 ga-1">
		<div v-if="!rows.length" class="text-caption text-medium-emphasis">
			{{ $t("plugins.flexibleLayouts.filamentMonitor.none") }}
		</div>
		<div v-for="row in rows" :key="row.index" class="d-flex align-center ga-2">
			<strong class="fm-index">E{{ row.index }}</strong>
			<v-chip size="small" variant="tonal" :color="row.color" :prepend-icon="row.icon">{{ row.text }}</v-chip>
			<v-spacer />
			<!-- DWC's own indicator: the extrusion-percentage tooltip bar for laser / rotating-magnet monitors -->
			<FilamentMonitorIndicator :monitor="row.monitor" :extruder-index="row.index">
				<span v-if="row.percent !== null" class="text-caption">{{ row.percent }}%</span>
			</FilamentMonitorIndicator>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { FilamentMonitor } from "@duet3d/objectmodel";
import { computed } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";

defineProps<{ widget: Extract<Widget, { type: "filamentMonitor" }> }>();
const machineStore = useMachineStore();

interface MonitorLike { status?: string; lastPercentage?: number | null; avgPercentage?: number | null }

const STATUS_LOOK: Record<string, { color: string; icon: string }> = {
	ok: { color: "success", icon: "mdi-check-circle-outline" },
	noDataReceived: { color: "warning", icon: "mdi-help-circle-outline" },
	noFilament: { color: "error", icon: "mdi-alert-circle-outline" },
	tooLittleMovement: { color: "error", icon: "mdi-alert-circle-outline" },
	tooMuchMovement: { color: "error", icon: "mdi-alert-circle-outline" },
	sensorError: { color: "error", icon: "mdi-alert-octagon-outline" },
};

// Filament monitors are indexed by extruder number (null where none is assigned), as in DWC's own StatusPanel.
const rows = computed(() => {
	const monitors = (machineStore.model as { sensors?: { filamentMonitors?: Array<MonitorLike | null> } })
		.sensors?.filamentMonitors ?? [];
	const out: Array<{ index: number; monitor: FilamentMonitor; text: string; color: string; icon: string; percent: number | null }> = [];
	monitors.forEach((monitor, index) => {
		if (!monitor || !monitor.status || monitor.status === "noMonitor") {
			return;
		}
		const look = STATUS_LOOK[monitor.status] ?? { color: "grey", icon: "mdi-help-circle-outline" };
		const key = `plugins.flexibleLayouts.filamentMonitor.status.${monitor.status}`;
		const pct = monitor.lastPercentage ?? monitor.avgPercentage ?? null;
		out.push({
			index, monitor: monitor as unknown as FilamentMonitor, ...look,
			text: i18n.global.te(key) ? i18n.global.t(key) : monitor.status,
			percent: typeof pct === "number" ? Math.round(pct) : null,
		});
	});
	return out;
});
</script>

<style scoped>
.fm-index { min-width: 2em; }
</style>
