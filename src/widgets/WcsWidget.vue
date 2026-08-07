<template>
  <div class="wcs-root fill-height d-flex flex-column px-2 py-1" :class="{ 'wcs-frozen': disabledNow }">
    <UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />
    <div class="d-flex align-center mb-1 flex-shrink-0">
      <span v-if="widget.label" class="wcs-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <v-select :model-value="activeWcs" :items="wcsItems" density="compact" variant="outlined" hide-details
                class="wcs-select" :disabled="disabledNow" @update:model-value="selectWcs" />
    </div>

    <div class="wcs-body flex-grow-1">
      <div v-for="a in axisRows" :key="a.letter" class="wcs-row">
        <span class="wcs-letter">{{ a.letter }}</span>
        <span class="wcs-pos">{{ a.work }}</span>
        <span v-if="showMachine" class="wcs-mpos">{{ a.machine }}</span>
        <v-btn size="x-small" variant="tonal" color="warning" class="wcs-zero" :disabled="disabledNow"
               :title="`${$t('plugins.flexibleLayouts.wcs.zero')} ${a.letter}`" @click="zeroAxis(a.letter)">0</v-btn>
      </div>
      <div v-if="!axisRows.length" class="text-medium-emphasis text-caption">{{ $t("plugins.flexibleLayouts.dro.none") }}</div>
    </div>

    <div class="d-flex ga-1 mt-1 flex-shrink-0">
      <v-btn size="small" variant="tonal" color="warning" class="flex-grow-1" :disabled="disabledNow"
             prepend-icon="mdi-crosshairs-gps" @click="zeroAll">{{ $t("plugins.flexibleLayouts.wcs.zeroHere") }}</v-btn>
      <v-btn v-if="widget.goto !== false" size="small" variant="tonal" :color="widget.color || 'primary'"
             class="flex-grow-1" :disabled="disabledNow" prepend-icon="mdi-target"
             :title="$t('plugins.flexibleLayouts.wcs.gotoZeroHint')" @click="gotoWorkZero">
        {{ $t("plugins.flexibleLayouts.wcs.gotoZero") }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";
import { unhomedAxes } from "../util/homedCheck";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "wcs" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

// G54..G59.3 — workplaceNumber is 0-based, so index 0 = G54 … index 8 = G59.3.
const WCS = ["G54", "G55", "G56", "G57", "G58", "G59", "G59.1", "G59.2", "G59.3"] as const;
const wcsItems = WCS.map((g, i) => ({ title: g, value: i }));
const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const showMachine = computed(() => props.widget.showMachine !== false);
const precision = computed(() => props.widget.precision ?? 2);
const wantAxes = computed(() => (props.widget.axes?.length ? props.widget.axes : ["X", "Y", "Z"]).map((a) => a.toUpperCase()));
const unhomedNow = computed(() => unhomedAxes(machineStore.model, wantAxes.value));

const activeWcs = computed(() => {
  const n = resolveOmPath(machineStore.model, "move.workplaceNumber");
  return typeof n === "number" ? n : 0;
});

interface RawAxis { letter?: string; machinePosition?: number | null; userPosition?: number | null }
const axisRows = computed(() => {
  const arr = resolveOmPath(machineStore.model, "move.axes");
  if (!Array.isArray(arr)) { return [] as Array<{ letter: string; work: string; machine: string }>; }
  const fmt = (v: unknown): string => (typeof v === "number" ? v.toFixed(precision.value) : "—");
  return wantAxes.value.map((letter) => {
    const a = (arr as Array<RawAxis>).find((x) => (x?.letter ?? "").toUpperCase() === letter);
    return { letter, work: fmt(a?.userPosition), machine: fmt(a?.machinePosition) };
  });
});

function run(code: string): void {
  if (disabledNow.value) { return; }
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "WCS command failed", (e as Error)?.message ?? String(e)));
}
function selectWcs(i: number): void { run(WCS[i]); }
function zeroAxis(letter: string): void { run(`G10 L20 P${activeWcs.value + 1} ${letter}0`); }
function zeroAll(): void { run(`G10 L20 P${activeWcs.value + 1} ${wantAxes.value.map((a) => `${a}0`).join(" ")}`); }
// Go to work XY zero only — never auto-move Z into the job. (Raise Z yourself first if needed.)
function gotoWorkZero(): void { run("G90\nG0 X0 Y0"); }
</script>

<style scoped>
.wcs-root { min-height: 0; }
.wcs-frozen { opacity: 0.5; pointer-events: none; }
.wcs-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.wcs-select { max-width: 96px; }
.wcs-body { min-height: 0; overflow-y: auto; }
.wcs-row { display: flex; align-items: baseline; gap: 6px; padding: 1px 2px; }
.wcs-letter { font-weight: 700; width: 1.3em; }
.wcs-pos { margin-left: auto; font-family: monospace; font-weight: 600; font-variant-numeric: tabular-nums; }
.wcs-mpos { font-family: monospace; font-size: 0.72em; opacity: 0.6; font-variant-numeric: tabular-nums; min-width: 4.5em; text-align: right; }
.wcs-zero { min-width: 0; padding: 0 6px; }
</style>
