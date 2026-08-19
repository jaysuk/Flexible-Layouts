<template>
	<div class="mh-root fill-height d-flex flex-column px-2 py-1">
		<span v-if="widget.title" class="mh-label text-truncate flex-shrink-0">{{ widget.title }}</span>

		<!-- Only the controller's own asserted state is coloured - "halted" comes straight from
		     state.status, not a threshold FL invented. -->
		<div v-if="halted" class="mh-halted flex-shrink-0">
			<v-icon size="16" class="mr-1">mdi-alert-octagon</v-icon>
			{{ $t("plugins.flexibleLayouts.machineHealth.halted") }}
		</div>

		<div class="mh-body flex-grow-1">
			<template v-if="widget.showPower !== false">
				<div v-for="b in boards" :key="'power-' + b.index" class="mh-section">
					<div v-if="boards.length > 1" class="mh-board-name text-caption text-medium-emphasis">{{ b.name }}</div>
					<div v-if="b.vIn" class="mh-row">
						<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.machineHealth.vIn") }}</span>
						<span class="mh-value">{{ fmt(b.vIn.current) }} V <span class="mh-minmax">({{ fmt(b.vIn.min) }}–{{ fmt(b.vIn.max) }})</span></span>
					</div>
					<div v-if="b.v12" class="mh-row">
						<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.machineHealth.v12") }}</span>
						<span class="mh-value">{{ fmt(b.v12.current) }} V <span class="mh-minmax">({{ fmt(b.v12.min) }}–{{ fmt(b.v12.max) }})</span></span>
					</div>
					<div v-if="b.mcuTemp" class="mh-row">
						<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.machineHealth.mcuTemp") }}</span>
						<span class="mh-value">{{ fmt(b.mcuTemp.current) }}°C <span class="mh-minmax">({{ fmt(b.mcuTemp.min) }}–{{ fmt(b.mcuTemp.max) }})</span></span>
					</div>
				</div>
			</template>

			<template v-if="widget.showRam !== false">
				<div v-for="b in boards" :key="'ram-' + b.index" class="mh-row">
					<span class="text-caption text-medium-emphasis">{{ boards.length > 1 ? $t("plugins.flexibleLayouts.machineHealth.freeRamNamed", { board: b.name }) : $t("plugins.flexibleLayouts.machineHealth.freeRam") }}</span>
					<span class="mh-value">{{ b.freeRam != null ? fmtBytes(b.freeRam) : "—" }}</span>
				</div>
			</template>

			<div v-if="widget.showUptime !== false" class="mh-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.machineHealth.uptime") }}</span>
				<span class="mh-value">{{ uptimeText }}</span>
			</div>

			<template v-if="widget.showNetwork !== false">
				<div v-for="(iface, i) in interfaces" :key="'net-' + i" class="mh-row">
					<span class="text-caption text-medium-emphasis">{{ iface.type }}</span>
					<span class="mh-value">
						{{ iface.state ?? "—" }}
						<span v-if="iface.actualIP" class="mh-minmax">{{ iface.actualIP }}</span>
						<span v-if="iface.rssi != null" class="mh-minmax">{{ iface.rssi }} dBm</span>
					</span>
				</div>
			</template>

			<template v-if="widget.showProbes !== false">
				<div v-for="p in probes" :key="'probe-' + p.index" class="mh-row">
					<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.machineHealth.probe", { index: p.index }) }}</span>
					<span class="mh-value">
						<template v-if="p.loadCellForce != null">
							{{ fmt(p.loadCellForce) }} g <span class="mh-minmax">({{ p.value.join(", ") }})</span>
						</template>
						<template v-else>{{ p.value.join(", ") }}</template>
					</span>
				</div>
			</template>

			<div v-if="!boards.length && !interfaces.length && !probes.length" class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.machineHealth.noData") }}
			</div>
		</div>

		<v-btn block variant="outlined" size="small" class="flex-shrink-0 mt-2" prepend-icon="mdi-file-document-outline"
			   :loading="fetchingDiag" @click="runM122">
			{{ $t("plugins.flexibleLayouts.machineHealth.fullDiagnostics") }}
		</v-btn>

		<v-dialog v-model="diagOpen" max-width="640">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.machineHealth.fullDiagnostics") }}</v-card-title>
				<v-card-text>
					<pre class="mh-pre">{{ diagText }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="diagOpen = false">{{ $t("generic.close") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "machineHealth" }> }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const widget = props.widget;

// state.status is the one value here that IS coloured - it's an assertion the firmware itself makes,
// not a threshold FL is guessing at (see the plan's "no thresholds invented in FL" rule).
const halted = computed(() => machineStore.model.state?.status === "halted");

interface BoardHealth {
	index: number;
	name: string;
	vIn: { current: number; min: number; max: number } | null;
	v12: { current: number; min: number; max: number } | null;
	mcuTemp: { current: number; min: number; max: number } | null;
	freeRam: number | null;
}

const boards = computed<Array<BoardHealth>>(() => {
	const list = machineStore.model.boards;
	if (!list) {
		return [];
	}
	return Array.from(list)
		.map((b, index) => (b ? { b, index } : null))
		.filter((x): x is { b: NonNullable<typeof list[number]>; index: number } => x !== null)
		.map(({ b, index }) => ({
			index,
			name: b.shortName || b.name || `Board ${index}`,
			vIn: b.vIn ? { current: b.vIn.current, min: b.vIn.min, max: b.vIn.max } : null,
			v12: b.v12 ? { current: b.v12.current, min: b.v12.min, max: b.v12.max } : null,
			mcuTemp: b.mcuTemp ? { current: b.mcuTemp.current, min: b.mcuTemp.min, max: b.mcuTemp.max } : null,
			freeRam: b.freeRam,
		}));
});

interface InterfaceHealth {
	type: string;
	state: string | null;
	actualIP: string | null;
	rssi: number | null;
}

const interfaces = computed<Array<InterfaceHealth>>(() => {
	const list = machineStore.model.network?.interfaces;
	if (!list) {
		return [];
	}
	return Array.from(list)
		.filter((iface): iface is NonNullable<typeof iface> => iface !== null)
		.map((iface) => ({
			type: iface.type,
			state: iface.state,
			actualIP: iface.actualIP,
			rssi: iface.type === "wifi" ? iface.rssi : null,
		}));
});

interface ProbeHealth {
	index: number;
	value: Array<number>;
	/** Force in grams, for a load-cell probe (DWC 3.7.0-beta.3) - null for every other probe type,
	 *  where value[0]'s raw counts are the only reading there is. */
	loadCellForce: number | null;
}

const probes = computed<Array<ProbeHealth>>(() => {
	const list = machineStore.model.sensors?.probes as unknown as Array<{ value: Array<number>; loadCell?: { force?: number } | null } | null> | undefined;
	if (!list) {
		return [];
	}
	return Array.from(list)
		.map((p, index) => (p ? {
			index, value: p.value,
			loadCellForce: (p.loadCell && typeof p.loadCell.force === "number") ? p.loadCell.force : null,
		} : null))
		.filter((x): x is ProbeHealth => x !== null);
});

function fmt(v: number): string {
	return v.toFixed(1);
}

function fmtBytes(bytes: number): string {
	return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

const uptimeText = computed(() => {
	const seconds = machineStore.model.state?.upTime;
	if (seconds == null) {
		return "—";
	}
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const parts = [];
	if (d > 0) { parts.push(`${d}d`); }
	if (d > 0 || h > 0) { parts.push(`${h}h`); }
	parts.push(`${m}m`);
	parts.push(`${s}s`);
	return parts.join(" ");
});

const diagOpen = ref(false);
const diagText = ref("");
const fetchingDiag = ref(false);

async function runM122(): Promise<void> {
	fetchingDiag.value = true;
	try {
		diagText.value = await machineStore.sendCode("M122", false, true);
		diagOpen.value = true;
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, "M122", (e as Error)?.message ?? String(e));
	} finally {
		fetchingDiag.value = false;
	}
}
</script>

<style scoped>
.mh-root { min-height: 0; }
.mh-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.mh-body { min-height: 0; overflow-y: auto; }
.mh-halted {
	display: flex; align-items: center;
	background: rgba(var(--v-theme-error), 0.15);
	color: rgb(var(--v-theme-error));
	border-radius: 4px; padding: 4px 8px; margin-bottom: 4px;
	font-weight: 600; font-size: 0.85em;
}
.mh-section { padding: 2px 0; }
.mh-board-name { font-weight: 600; padding-top: 4px; }
.mh-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 2px 0; }
.mh-value { font-variant-numeric: tabular-nums; text-align: right; }
.mh-minmax { opacity: 0.6; font-size: 0.85em; margin-left: 4px; }
.mh-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; max-height: 60vh; overflow-y: auto; }
</style>
