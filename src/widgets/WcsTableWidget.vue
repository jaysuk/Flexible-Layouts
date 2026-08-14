<template>
	<div class="wt-root fill-height d-flex flex-column px-2 py-1" :class="{ 'wt-frozen': disabledNow }">
		<span v-if="widget.label" class="wt-label text-truncate flex-shrink-0">{{ widget.label }}</span>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<div class="wt-table-wrap flex-grow-1">
			<table class="wt-table">
				<thead>
					<tr>
						<th></th>
						<th>{{ $t("plugins.flexibleLayouts.wcsTable.name") }}</th>
						<th v-for="a in axes" :key="a">{{ a }}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="row in rows" :key="row.code" :class="{ 'wt-active': row.index === activeWcs }">
						<td>
							<v-btn size="x-small" :variant="row.index === activeWcs ? 'flat' : 'text'"
								   :color="row.index === activeWcs ? (widget.color || 'primary') : undefined"
								   :disabled="disabledNow" class="wt-code" @click="selectWcs(row.index)">{{ row.code }}</v-btn>
						</td>
						<td>
							<span class="wt-name text-truncate">{{ widget.names?.[row.index] || "—" }}</span>
						</td>
						<td v-for="a in axes" :key="a">
							<input class="wt-offset" type="number" step="any" :disabled="disabledNow"
								   :value="editValue(row.index, a)"
								   @change="commitOffset(row.index, a, ($event.target as HTMLInputElement).value)" />
						</td>
						<td>
							<v-btn size="x-small" variant="text" :disabled="disabledNow" icon
								   :title="$t('plugins.flexibleLayouts.wcsTable.zeroHere')" @click="zeroHere(row.index)">
								<v-icon size="14">mdi-crosshairs-gps</v-icon>
							</v-btn>
						</td>
					</tr>
				</tbody>
			</table>
		</div>

		<div v-if="widget.showCopy !== false" class="d-flex ga-1 align-center mt-2 flex-shrink-0 flex-wrap">
			<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.wcsTable.copy") }}</span>
			<v-select v-model="copyFrom" :items="wcsItems" density="compact" variant="outlined" hide-details
					  class="wt-copy-select" :disabled="disabledNow" />
			<v-icon size="16">mdi-arrow-right</v-icon>
			<v-select v-model="copyTo" :items="wcsItems" density="compact" variant="outlined" hide-details
					  class="wt-copy-select" :disabled="disabledNow" />
			<v-btn size="small" variant="tonal" :color="widget.color || 'primary'" :disabled="disabledNow || copyFrom === copyTo" @click="copyOffsets">
				{{ $t("plugins.flexibleLayouts.wcsTable.copyButton") }}
			</v-btn>
		</div>

		<div v-if="widget.showRotation !== false" class="wt-rotation mt-2 flex-shrink-0">
			<div v-if="rotationActive" class="wt-rotation-warning">
				<v-icon size="14" class="mr-1">mdi-alert</v-icon>
				{{ $t("plugins.flexibleLayouts.wcsTable.rotationActive", { angle: fmt(rotation!.angle), x: fmt(rotation!.centre[0]), y: fmt(rotation!.centre[1]) }) }}
			</div>
			<div v-else-if="rotation === null" class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.wcsTable.rotationUnsupported") }}
			</div>
			<div v-if="rotation !== null" class="d-flex ga-1 align-center flex-wrap mt-1">
				<v-text-field v-model.number="rotAngle" type="number" step="any" density="compact" variant="outlined" hide-details
							  class="wt-rot-field" :label="$t('plugins.flexibleLayouts.wcsTable.angle')" :disabled="disabledNow" />
				<v-text-field v-model.number="rotCentreX" type="number" step="any" density="compact" variant="outlined" hide-details
							  class="wt-rot-field" :label="$t('plugins.flexibleLayouts.wcsTable.centreX')" :disabled="disabledNow" />
				<v-text-field v-model.number="rotCentreY" type="number" step="any" density="compact" variant="outlined" hide-details
							  class="wt-rot-field" :label="$t('plugins.flexibleLayouts.wcsTable.centreY')" :disabled="disabledNow" />
				<v-btn size="small" variant="tonal" :color="widget.color || 'primary'" :disabled="disabledNow" @click="applyRotation">
					{{ $t("plugins.flexibleLayouts.wcsTable.applyRotation") }}
				</v-btn>
				<v-btn v-if="rotationActive" size="small" variant="text" :disabled="disabledNow" @click="clearRotation">
					{{ $t("plugins.flexibleLayouts.wcsTable.clearRotation") }}
				</v-btn>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";
import { unhomedAxes } from "../util/homedCheck";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "wcsTable" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

// G54..G59.3 — workplaceNumber / G10's P parameter are both 1-based (P1=G54 … P9=G59.3); index 0-8
// here matches workplaceOffsets[]'s own 0-based indexing, so P = index + 1 throughout.
const WCS = ["G54", "G55", "G56", "G57", "G58", "G59", "G59.1", "G59.2", "G59.3"] as const;
const wcsItems = WCS.map((g, i) => ({ title: g, value: i }));
const rows = WCS.map((code, index) => ({ code, index }));

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const precision = computed(() => props.widget.precision ?? 2);
const axes = computed(() => (props.widget.axes?.length ? props.widget.axes : ["X", "Y", "Z"]).map((a) => a.toUpperCase()));
const unhomedNow = computed(() => unhomedAxes(machineStore.model, axes.value));

const activeWcs = computed(() => {
	const n = resolveOmPath(machineStore.model, "move.workplaceNumber");
	return typeof n === "number" ? n : 0;
});

interface RawAxis { letter?: string; workplaceOffsets?: Array<number> }
function rawAxes(): Array<RawAxis> {
	const arr = resolveOmPath(machineStore.model, "move.axes");
	return Array.isArray(arr) ? (arr as Array<RawAxis>) : [];
}

function offset(wcsIndex: number, axisLetter: string): number {
	const a = rawAxes().find((x) => (x?.letter ?? "").toUpperCase() === axisLetter);
	return a?.workplaceOffsets?.[wcsIndex] ?? 0;
}

function fmt(v: number): string {
	return v.toFixed(precision.value);
}

// A cell being actively typed into shows the user's in-progress text rather than snapping back to
// the live object-model value on every poll tick; committed (or never-touched) cells read live.
const draftEdits = ref(new Map<string, string>());
function cellKey(wcsIndex: number, axisLetter: string): string {
	return `${wcsIndex}:${axisLetter}`;
}
function editValue(wcsIndex: number, axisLetter: string): string {
	const draft = draftEdits.value.get(cellKey(wcsIndex, axisLetter));
	return draft ?? fmt(offset(wcsIndex, axisLetter));
}

function run(code: string): void {
	if (disabledNow.value) { return; }
	void machineStore.sendCode(code, false, false).catch((e: unknown) =>
		uiStore.makeNotification(LogLevel.error, "WCS command failed", (e as Error)?.message ?? String(e)));
}

function selectWcs(index: number): void {
	run(WCS[index]);
}

// G10 L2 P<n> <axis><value> writes the raw offset directly - works while unhomed, and (per RRF's own
// worked example) the value given IS the offset itself, not "current position now reads this".
function commitOffset(wcsIndex: number, axisLetter: string, text: string): void {
	const key = cellKey(wcsIndex, axisLetter);
	const value = Number(text);
	if (!Number.isFinite(value)) {
		draftEdits.value.delete(key);
		return;
	}
	run(`G10 L2 P${wcsIndex + 1} ${axisLetter}${value}`);
	draftEdits.value.delete(key);
}

// G10 L20 P<n> <axis>0 - sets the offset so the CURRENT physical position reads as 0 in that system,
// without needing to switch the active WCS first (same primitive WcsWidget's own "Zero here" uses).
function zeroHere(wcsIndex: number): void {
	run(`G10 L20 P${wcsIndex + 1} ${axes.value.map((a) => `${a}0`).join(" ")}`);
}

const copyFrom = ref(0);
const copyTo = ref(1);
function copyOffsets(): void {
	if (copyFrom.value === copyTo.value) { return; }
	const cmd = axes.value.map((a) => `${a}${offset(copyFrom.value, a)}`).join(" ");
	run(`G10 L2 P${copyTo.value + 1} ${cmd}`);
}

// move.rotation is a non-nullable ModelObject on current firmware (angle 0 = "no rotation"), but
// older firmware built without G68/G69 support may omit the field entirely - resolveOmPath then
// returns undefined, which is distinguished from "present but zero" via `rotation === null` below.
interface RawRotation { angle?: number; centre?: Array<number> }
const rotation = computed<{ angle: number; centre: [number, number] } | null>(() => {
	const r = resolveOmPath(machineStore.model, "move.rotation") as RawRotation | undefined;
	if (!r || typeof r.angle !== "number") { return null; }
	return { angle: r.angle, centre: [r.centre?.[0] ?? 0, r.centre?.[1] ?? 0] };
});
const rotationActive = computed(() => !!rotation.value && Math.abs(rotation.value.angle) > 1e-9);

const rotAngle = ref(0);
const rotCentreX = ref(0);
const rotCentreY = ref(0);
// Seed the edit fields from the live rotation once it first becomes known, then leave them alone -
// otherwise every poll tick would stomp on whatever the operator is mid-way through typing.
const seeded = ref(false);
watch(rotation, (r) => {
	if (r && !seeded.value) {
		rotAngle.value = r.angle;
		rotCentreX.value = r.centre[0];
		rotCentreY.value = r.centre[1];
		seeded.value = true;
	}
}, { immediate: true });

function applyRotation(): void {
	run(`G68 X${rotCentreX.value} Y${rotCentreY.value} R${rotAngle.value}`);
}
function clearRotation(): void {
	run("G69");
}
</script>

<style scoped>
.wt-root { min-height: 0; }
.wt-frozen { opacity: 0.5; pointer-events: none; }
.wt-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.wt-table-wrap { min-height: 0; overflow: auto; }
.wt-table { border-collapse: collapse; width: 100%; font-size: 0.8em; }
.wt-table th { text-align: left; font-weight: 600; opacity: 0.7; padding: 2px 4px; position: sticky; top: 0; background: rgb(var(--v-theme-surface)); }
.wt-table td { padding: 1px 4px; white-space: nowrap; }
.wt-active { background: rgba(var(--v-theme-primary), 0.08); }
.wt-code { min-width: 0; padding: 0 6px; font-size: 0.78em; }
.wt-name { display: inline-block; max-width: 8em; opacity: 0.85; }
.wt-offset {
	width: 5.5em; font-family: monospace; font-variant-numeric: tabular-nums;
	background: transparent; border: 1px solid rgba(127, 127, 127, 0.25); border-radius: 3px;
	padding: 1px 3px; color: inherit;
}
.wt-copy-select { max-width: 96px; }
.wt-rot-field { max-width: 96px; }
.wt-rotation-warning {
	display: flex; align-items: center;
	background: rgba(var(--v-theme-warning), 0.15);
	color: rgb(var(--v-theme-warning));
	border-radius: 4px; padding: 4px 8px;
	font-size: 0.8em; font-weight: 600;
}
</style>
