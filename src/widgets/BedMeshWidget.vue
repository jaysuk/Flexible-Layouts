<template>
	<div class="bmw-root fill-height d-flex flex-column px-2 py-1" :class="{ 'bmw-frozen': disabledNow }">
		<span v-if="widget.label" class="bmw-label text-truncate flex-shrink-0">{{ widget.label }}</span>

		<div class="d-flex align-center ga-2 mb-1 flex-shrink-0 flex-wrap">
			<v-select v-model="selectedFile" :items="fileItems" density="compact" variant="outlined" hide-details
					  class="bmw-file" :label="$t('plugins.flexibleLayouts.bedMesh.file')"
					  :disabled="disabledNow || filesLoading" @update:model-value="onSelectFile" />
			<v-btn icon="mdi-refresh" size="small" variant="text" :disabled="disabledNow" :loading="filesLoading"
				   :title="$t('plugins.flexibleLayouts.bedMesh.refresh')" @click="refreshFiles" />
			<v-btn icon="mdi-content-save" size="small" variant="text" color="primary" :disabled="disabledNow || !dirty"
				   :loading="saving" :title="$t('plugins.flexibleLayouts.bedMesh.save')" @click="onSave" />
			<v-btn icon="mdi-undo" size="small" variant="text" :disabled="disabledNow || !dirty"
				   :title="$t('plugins.flexibleLayouts.bedMesh.discard')" @click="discard" />
			<v-spacer />
			<v-btn size="small" variant="text" prepend-icon="mdi-grid" :disabled="disabledNow" :loading="probingFullMesh"
				   :title="$t('plugins.flexibleLayouts.bedMesh.probeFullHelp')" @click="probeFullMesh">
				{{ $t("plugins.flexibleLayouts.bedMesh.probeFull") }}
			</v-btn>
			<v-btn size="small" variant="text" prepend-icon="mdi-close-box-outline" :disabled="disabledNow"
				   :title="$t('plugins.flexibleLayouts.bedMesh.clearHelp')" @click="clearMesh">
				{{ $t("plugins.flexibleLayouts.bedMesh.clear") }}
			</v-btn>
		</div>

		<div v-if="loading" class="d-flex justify-center pa-4 flex-grow-1 align-center"><v-progress-circular indeterminate /></div>
		<div v-else-if="!loaded" class="text-caption text-medium-emphasis pa-2">{{ $t("plugins.flexibleLayouts.bedMesh.noFile") }}</div>
		<template v-else>
			<div class="text-caption text-medium-emphasis flex-shrink-0 bmw-stats">
				{{ $t("plugins.flexibleLayouts.bedMesh.statsLine", {
					probed: liveStats?.probedCount ?? 0, total: liveStats?.totalCount ?? 0,
					mean: fmt(liveStats?.mean ?? 0), dev: fmt(liveStats?.deviation ?? 0),
				}) }}
			</div>
			<div class="bmw-grid flex-grow-1" :style="gridStyle">
				<button v-for="cell in cellsFlat" :key="cell.key" type="button" class="bmw-cell"
						:class="{ 'bmw-cell-unprobed': cell.value === null, 'bmw-cell-dirty': cell.dirty }"
						:style="cellStyle(cell.value)" :disabled="disabledNow"
						:title="$t('plugins.flexibleLayouts.bedMesh.cellTitle', { row: cell.row, col: cell.col })"
						@click="openCell(cell.row, cell.col)">
					{{ cell.value === null ? "—" : fmt(cell.value) }}
				</button>
			</div>
		</template>

		<v-dialog v-model="cellOpen" max-width="380">
			<v-card v-if="activeCell">
				<v-card-title>{{ $t("plugins.flexibleLayouts.bedMesh.cellTitle", { row: activeCell.row, col: activeCell.col }) }}</v-card-title>
				<v-card-text>
					<div class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.bedMesh.cellPosition", { x: fmt(activeCellPos.axis0), y: fmt(activeCellPos.axis1) }) }}
					</div>
					<div class="mb-3">
						{{ $t("plugins.flexibleLayouts.bedMesh.currentValue") }}:
						<strong>{{ activeCellValue === null ? $t("plugins.flexibleLayouts.bedMesh.unprobed") : fmt(activeCellValue) }}</strong>
					</div>

					<!-- Idle: manual edit or start a re-probe -->
					<template v-if="cellStage === 'idle'">
						<v-text-field v-model.number="manualValue" type="number" step="0.001" density="compact" variant="outlined"
									  hide-details :label="$t('plugins.flexibleLayouts.bedMesh.manualValue')" class="mb-2" />
						<div class="d-flex ga-2 flex-wrap">
							<v-btn size="small" variant="tonal" :disabled="disabledNow" @click="applyManual">
								{{ $t("plugins.flexibleLayouts.bedMesh.applyManual") }}
							</v-btn>
							<v-btn size="small" variant="tonal" :disabled="disabledNow" @click="clearCell">
								{{ $t("plugins.flexibleLayouts.bedMesh.clearCell") }}
							</v-btn>
							<v-spacer />
							<v-btn size="small" color="primary" variant="tonal" :disabled="disabledNow" @click="startProbe">
								{{ $t("plugins.flexibleLayouts.bedMesh.reprobe") }}
							</v-btn>
						</div>
					</template>

					<!-- Confirming: show the resolved command before it's sent -->
					<template v-else-if="cellStage === 'confirming'">
						<div class="mb-2">{{ $t("plugins.flexibleLayouts.bedMesh.confirmText") }}</div>
						<pre class="bmw-pre">{{ pendingCmd }}</pre>
						<div class="d-flex ga-2 mt-2">
							<v-btn size="small" variant="text" @click="cellStage = 'idle'">{{ $t("generic.cancel") }}</v-btn>
							<v-spacer />
							<v-btn size="small" color="warning" :loading="probingCell" @click="runProbe">
								{{ $t("plugins.flexibleLayouts.bedMesh.reprobe") }}
							</v-btn>
						</div>
					</template>

					<!-- Result: raw reply next to the computed value, before it's written anywhere -->
					<template v-else-if="cellStage === 'result' && probeResult">
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.bedMesh.rawReply") }}</div>
						<pre class="bmw-pre">{{ probeResult.reply || $t("plugins.flexibleLayouts.bedMesh.noReply") }}</pre>
						<div class="mt-2">
							{{ $t("plugins.flexibleLayouts.bedMesh.computedValue") }}:
							<strong v-if="probeResult.value !== null">{{ fmt(probeResult.value) }}</strong>
							<strong v-else class="text-error">{{ $t("plugins.flexibleLayouts.bedMesh.noReply") }}</strong>
						</div>
						<div class="d-flex ga-2 mt-2">
							<v-btn size="small" variant="text" @click="cellStage = 'idle'; probeResult = null">{{ $t("generic.cancel") }}</v-btn>
							<v-spacer />
							<v-btn size="small" color="primary" :disabled="probeResult.value === null" @click="acceptProbe">
								{{ $t("plugins.flexibleLayouts.bedMesh.accept") }}
							</v-btn>
						</div>
					</template>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn size="small" variant="text" @click="cellOpen = false">{{ $t("generic.close") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { cellPosition } from "../model/bedMesh/heightmap";
import { createBedMeshStore, DEFAULT_HEIGHTMAP_FILE } from "../model/bedMesh/store";
import { heightmapValue, parseProbeReply } from "../model/bedMesh/probeReply";
import { buildProbeCommand, DEFAULT_BED_MESH_PROBE_COMMAND } from "../util/probe";

const props = defineProps<{ widget: Extract<Widget, { type: "bedMesh" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const io = defaultMachineIO();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

const store = createBedMeshStore(io);
const { loaded, loading, saving, dirty, liveStats } = store;

function fmt(v: number): string {
	return v.toFixed(3);
}
function t(k: string, args?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.bedMesh.${k}`, args ?? {});
}

// --- File list / load ------------------------------------------------------------------------------

const fileList = ref<Array<string>>([]);
const filesLoading = ref(false);
const selectedFile = ref(props.widget.fileName || DEFAULT_HEIGHTMAP_FILE);
const fileItems = computed(() => (fileList.value.includes(selectedFile.value) ? fileList.value : [selectedFile.value, ...fileList.value]));

async function refreshFiles(): Promise<void> {
	filesLoading.value = true;
	try {
		const entries = await io.getFileList("0:/sys");
		fileList.value = entries.filter((e) => !e.isDirectory && e.name.toLowerCase().endsWith(".csv")).map((e) => e.name);
	} catch {
		fileList.value = [];
	} finally {
		filesLoading.value = false;
	}
}

async function onSelectFile(): Promise<void> {
	const result = await store.load(selectedFile.value);
	if (result === "not-found") {
		uiStore.makeNotification(LogLevel.warning, t("title"), t("fileNotFound", { name: selectedFile.value }));
	} else if (result === "invalid") {
		uiStore.makeNotification(LogLevel.error, t("title"), t("fileInvalid", { name: selectedFile.value }));
	}
}

onMounted(() => {
	if (machineStore.isConnected) {
		void refreshFiles();
		void onSelectFile();
	}
});

async function onSave(): Promise<void> {
	const result = await store.save();
	if (result === "saved") {
		uiStore.makeNotification(LogLevel.success, t("title"), t("saved"));
	} else if (result === "upload-failed") {
		uiStore.makeNotification(LogLevel.error, t("title"), t("uploadFailed"));
	} else if (result === "reload-failed") {
		// The file WAS written; the machine just hasn't reloaded it yet - a stronger warning than a
		// plain failure, since the card and the machine now disagree until Save is retried.
		uiStore.makeNotification(LogLevel.warning, t("title"), t("reloadFailed"));
	}
}

function discard(): void {
	store.discard();
}

const probingFullMesh = ref(false);
async function probeFullMesh(): Promise<void> {
	probingFullMesh.value = true;
	try {
		await io.sendCode("G29 S0");
		uiStore.makeNotification(LogLevel.success, t("title"), t("probeFullDone"));
		await refreshFiles();
		await onSelectFile();
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, t("title"), (e as Error)?.message ?? String(e));
	} finally {
		probingFullMesh.value = false;
	}
}

async function clearMesh(): Promise<void> {
	try {
		await io.sendCode("G29 S2");
		uiStore.makeNotification(LogLevel.success, t("title"), t("clearDone"));
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, t("title"), (e as Error)?.message ?? String(e));
	}
}

// --- Grid rendering ----------------------------------------------------------------------------

const gridStyle = computed(() => (loaded.value ? { gridTemplateColumns: `repeat(${loaded.value.meta.num[0]}, 1fr)` } : {}));

// Row 0 is the file's first (lowest-Y) row; rendered bottom-to-top so the grid reads like looking
// down at the bed from above with the far edge (higher Y) at the top.
const cellsFlat = computed(() => {
	if (!loaded.value) { return []; }
	const [numCols, numRows] = loaded.value.meta.num;
	const out: Array<{ key: string; row: number; col: number; value: number | null; dirty: boolean }> = [];
	for (let r = numRows - 1; r >= 0; r--) {
		for (let c = 0; c < numCols; c++) {
			const value = store.valueAt(r, c);
			const baseline = loaded.value.rows[r]?.[c] ?? null;
			out.push({ key: `${r},${c}`, row: r, col: c, value, dirty: value !== baseline });
		}
	}
	return out;
});

function cellStyle(value: number | null): Record<string, string> {
	if (value === null || !liveStats.value) {
		return {};
	}
	const scale = Math.max(Math.abs(liveStats.value.min), Math.abs(liveStats.value.max), 0.05);
	const magnitude = Math.max(-1, Math.min(1, value / scale));
	const hue = magnitude < 0 ? 210 : 0; // blue = low spots, red = high spots, centred on zero
	const lightness = 92 - Math.abs(magnitude) * 35;
	return { background: `hsl(${hue} 70% ${lightness}%)` };
}

// --- Cell detail dialog --------------------------------------------------------------------------

const cellOpen = ref(false);
const activeCell = ref<{ row: number; col: number } | null>(null);
const cellStage = ref<"idle" | "confirming" | "result">("idle");
const manualValue = ref<number>(0);
const pendingCmd = ref("");
const probingCell = ref(false);
const probeResult = ref<{ reply: string; value: number | null } | null>(null);

const activeCellValue = computed(() => (activeCell.value ? store.valueAt(activeCell.value.row, activeCell.value.col) : null));
const activeCellPos = computed(() => {
	if (!activeCell.value || !loaded.value) { return { axis0: 0, axis1: 0 }; }
	return cellPosition(loaded.value.meta, activeCell.value.row, activeCell.value.col);
});

function openCell(row: number, col: number): void {
	if (disabledNow.value) { return; }
	activeCell.value = { row, col };
	cellStage.value = "idle";
	probeResult.value = null;
	manualValue.value = store.valueAt(row, col) ?? 0;
	cellOpen.value = true;
}

function applyManual(): void {
	if (!activeCell.value) { return; }
	store.setValue(activeCell.value.row, activeCell.value.col, manualValue.value);
	cellOpen.value = false;
}

function clearCell(): void {
	if (!activeCell.value) { return; }
	store.setValue(activeCell.value.row, activeCell.value.col, null);
	cellOpen.value = false;
}

function startProbe(): void {
	if (!activeCell.value) { return; }
	const pos = activeCellPos.value;
	pendingCmd.value = buildProbeCommand(props.widget.probeCmd || DEFAULT_BED_MESH_PROBE_COMMAND, { x: pos.axis0, y: pos.axis1 });
	if (props.widget.confirm === false) {
		void runProbe();
	} else {
		cellStage.value = "confirming";
	}
}

async function runProbe(): Promise<void> {
	probingCell.value = true;
	try {
		const reply = await io.sendCode(pendingCmd.value);
		const parsed = parseProbeReply(reply);
		const probeIndex = props.widget.probeIndex ?? 0;
		const triggerHeight = machineStore.model.sensors.probes[probeIndex]?.triggerHeight;
		const value = parsed && triggerHeight !== undefined ? heightmapValue(parsed.stopHeight, triggerHeight) : null;
		probeResult.value = { reply, value };
		cellStage.value = "result";
	} catch (e) {
		probeResult.value = { reply: (e as Error)?.message ?? String(e), value: null };
		cellStage.value = "result";
	} finally {
		probingCell.value = false;
	}
}

function acceptProbe(): void {
	if (!activeCell.value || !probeResult.value || probeResult.value.value === null) { return; }
	store.setValue(activeCell.value.row, activeCell.value.col, probeResult.value.value);
	cellOpen.value = false;
}
</script>

<style scoped>
.bmw-root { min-height: 0; }
.bmw-frozen { opacity: 0.5; pointer-events: none; }
.bmw-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.bmw-file { max-width: 220px; }
.bmw-stats { padding: 2px 0; }
.bmw-grid { min-height: 0; overflow: auto; display: grid; gap: 2px; align-content: start; }
.bmw-cell {
	aspect-ratio: 1.4;
	min-width: 44px;
	border-radius: 3px;
	border: 1px solid rgba(127, 127, 127, 0.25);
	font-size: 0.68rem;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	color: rgba(0, 0, 0, 0.87);
}
.bmw-cell:disabled { cursor: default; }
.bmw-cell-unprobed { background: repeating-linear-gradient(45deg, rgba(127, 127, 127, 0.15), rgba(127, 127, 127, 0.15) 4px, transparent 4px, transparent 8px); }
.bmw-cell-dirty { outline: 2px solid rgb(var(--v-theme-warning)); outline-offset: -2px; }
.bmw-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; }
</style>
