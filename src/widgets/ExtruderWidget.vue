<template>
  <div class="ex-root fill-height d-flex flex-column ga-2 pa-2" :class="{ 'ex-frozen': disabledNow }">
    <span v-if="widget.label" class="ex-label text-truncate">{{ widget.label }}</span>

    <!-- Extrude / retract at a set volumetric flow rate -->
    <div class="ex-section">
      <div class="ex-row">
        <span class="ex-sub">{{ $t("plugins.flexibleLayouts.extruder.amount") }}</span>
        <div class="d-flex flex-wrap ga-1">
          <v-chip v-for="a in amounts" :key="a" size="x-small" :variant="a === amount ? 'flat' : 'tonal'"
                  :color="a === amount ? (widget.color || 'primary') : undefined" @click="amount = a">{{ a }}</v-chip>
        </div>
      </div>
      <div class="ex-row">
        <span class="ex-sub">{{ $t("plugins.flexibleLayouts.extruder.flow") }}</span>
        <div class="ex-field">
          <input v-model.number="flowRate" class="ex-num" type="number" min="0.1" step="0.1" inputmode="decimal" />
          <span class="ex-unit">mm³/s</span>
        </div>
      </div>
      <div class="ex-derived">{{ $t("plugins.flexibleLayouts.extruder.atFeed", { feed: derivedFeed }) }}</div>
      <div class="d-flex ga-1 mt-1">
        <v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-grow-1" :disabled="disabledNow"
               prepend-icon="mdi-arrow-down" @click="move(1)">{{ $t("plugins.flexibleLayouts.extruder.extrude") }}</v-btn>
        <v-btn size="small" variant="tonal" color="warning" class="flex-grow-1" :disabled="disabledNow"
               prepend-icon="mdi-arrow-up" @click="move(-1)">{{ $t("plugins.flexibleLayouts.extruder.retract") }}</v-btn>
      </div>
    </div>

    <!-- Steps per mm (M92 E) -->
    <div v-if="widget.showStepsPerMm !== false" class="ex-section">
      <div class="ex-section-head">
        <span>{{ $t("plugins.flexibleLayouts.extruder.stepsPerMm") }}</span>
        <span class="ex-current">{{ currentSteps != null ? round(currentSteps) : "—" }}</span>
      </div>
      <div class="d-flex ga-1 align-center">
        <div class="ex-field flex-grow-1">
          <input v-model.number="stepsInput" class="ex-num" type="number" min="1" step="0.1" inputmode="decimal"
                 @keyup.enter="applySteps" />
          <span class="ex-unit">steps</span>
        </div>
        <v-btn size="small" variant="tonal" :disabled="disabledNow" @click="applySteps">{{ $t("plugins.flexibleLayouts.extruder.set") }}</v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

interface Extruder { factor?: number; stepsPerMm?: number; filamentDiameter?: number }
interface Tool { extruders?: Array<number> }

const props = defineProps<{ widget: Extract<Widget, { type: "extruder" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const amounts = computed(() => (props.widget.amounts?.length ? props.widget.amounts : [1, 5, 10, 50]));
const amount = ref<number>(amounts.value[1] ?? amounts.value[0] ?? 5);
const flowRate = ref<number>(props.widget.flowRate ?? 5);

function round(n: number): number { return Math.round(n * 100) / 100; }

// --- live model / target extruder --------------------------------------------------
const model = computed(() => machineStore.model as {
  move?: { extruders?: Array<Extruder> };
  tools?: Array<Tool>;
  state?: { currentTool?: number };
});
const extruders = computed<Array<Extruder>>(() => model.value.move?.extruders ?? []);

// The extruder driven by the configured tool (or the active tool), defaulting to drive 0.
const extruderIndex = computed(() => {
  const toolNum = props.widget.tool ?? model.value.state?.currentTool ?? -1;
  const tool = toolNum >= 0 ? model.value.tools?.[toolNum] : undefined;
  const ei = tool?.extruders?.[0];
  return typeof ei === "number" ? ei : 0;
});

// Filament diameter for the volumetric→linear conversion: explicit config, else the object model,
// else a 1.75 mm default.
const diameter = computed(() => {
  const omd = extruders.value[extruderIndex.value]?.filamentDiameter;
  return props.widget.filamentDiameter || (typeof omd === "number" && omd > 0 ? omd : 0) || 1.75;
});

// Feed-rate (mm/min of filament) that yields the requested volumetric flow: F = flow / area × 60.
const derivedFeed = computed(() => {
  const area = Math.PI * (diameter.value / 2) ** 2;
  if (!(area > 0) || !(flowRate.value > 0)) return 0;
  return Math.round((flowRate.value / area) * 60);
});

// --- steps per mm ------------------------------------------------------------------
const currentSteps = computed(() => {
  const s = extruders.value[extruderIndex.value]?.stepsPerMm;
  return typeof s === "number" ? s : null;
});
const stepsInput = ref<number | null>(null);
watch(currentSteps, (v) => { if (v != null && stepsInput.value == null) stepsInput.value = round(v); }, { immediate: true });

// --- actions -----------------------------------------------------------------------
function send(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Extruder command failed", (e as Error)?.message ?? String(e)));
}

function move(dir: number): void {
  if (disabledNow.value || derivedFeed.value <= 0) return;
  const lines: Array<string> = [];
  if (props.widget.tool !== null && props.widget.tool !== undefined) lines.push(`T${props.widget.tool}`);
  lines.push("M83");
  lines.push(`G1 E${dir * amount.value} F${derivedFeed.value}`);
  send(lines.join("\n"));
}

function applySteps(): void {
  const v = Number(stepsInput.value);
  if (!Number.isFinite(v) || v <= 0) return;
  // Build the full per-extruder list so only the targeted drive changes (M92 E takes a colon list).
  const list = extruders.value.length
    ? extruders.value.map((e, i) => (i === extruderIndex.value ? v : round(e.stepsPerMm ?? v)))
    : [v];
  send(`M92 E${list.join(":")}`);
}
</script>

<style scoped>
.ex-root { min-height: 0; overflow: auto; }
.ex-frozen { opacity: 0.5; pointer-events: none; }
.ex-label { font-size: 0.85em; font-weight: 600; }

.ex-section { display: flex; flex-direction: column; gap: 4px; }
.ex-section + .ex-section { border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); padding-top: 6px; }
.ex-section-head {
  display: flex; align-items: baseline; justify-content: space-between;
  font-size: 0.75em; font-weight: 600; opacity: 0.85;
}
.ex-current { font-variant-numeric: tabular-nums; opacity: 0.9; }

.ex-row { display: flex; align-items: center; gap: 8px; }
.ex-sub { font-size: 0.7em; opacity: 0.7; min-width: 4.5em; }
.ex-derived { font-size: 0.65em; opacity: 0.6; text-align: right; font-variant-numeric: tabular-nums; }

.ex-field { display: flex; align-items: center; gap: 4px; flex: 1 1 auto; min-width: 0; }
.ex-num {
  width: 100%; box-sizing: border-box; min-width: 0;
  font: inherit; font-size: 0.85em; line-height: 1.4;
  padding: 2px 6px; color: inherit;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3); border-radius: 4px;
}
.ex-num:focus { outline: none; border-color: rgb(var(--v-theme-primary)); }
.ex-unit { font-size: 0.7em; opacity: 0.7; white-space: nowrap; }
</style>
