<template>
  <div class="ex-root fill-height d-flex flex-column ga-2 pa-2" :class="{ 'ex-frozen': disabledNow }">
    <span v-if="widget.label" class="ex-label text-truncate">{{ widget.label }}</span>

    <div class="ex-section">
      <!-- Amount (length of filament) -->
      <div class="ex-row">
        <span class="ex-sub">{{ $t("plugins.flexibleLayouts.extruder.amount") }}</span>
        <div class="d-flex flex-wrap ga-1">
          <v-chip v-for="a in amounts" :key="a" size="x-small" :variant="a === amount ? 'flat' : 'tonal'"
                  :color="a === amount ? (widget.color || 'primary') : undefined" @click="amount = a">{{ a }}</v-chip>
        </div>
      </div>

      <!-- Speed mode: by length (feed-rate) or by flow rate -->
      <div class="ex-row">
        <span class="ex-sub">{{ $t("plugins.flexibleLayouts.extruder.speedBy") }}</span>
        <v-btn-toggle v-model="mode" mandatory density="compact" variant="outlined" divided class="ex-modes">
          <v-btn value="length" size="x-small">{{ $t("plugins.flexibleLayouts.extruder.byLength") }}</v-btn>
          <v-btn value="flow" size="x-small">{{ $t("plugins.flexibleLayouts.extruder.byFlow") }}</v-btn>
        </v-btn-toggle>
      </div>

      <!-- Length mode: feed-rate -->
      <div v-if="mode === 'length'" class="ex-row">
        <span class="ex-sub">{{ $t("plugins.flexibleLayouts.extruder.speed") }}</span>
        <div class="ex-field">
          <input v-model.number="feedDisplay" class="ex-num" type="number" :min="feedUnit === 'mmS' ? 0.01 : 1"
                 :step="feedUnit === 'mmS' ? 0.01 : 1" :inputmode="feedUnit === 'mmS' ? 'decimal' : 'numeric'" />
          <button type="button" class="ex-unit ex-unit-toggle" :disabled="disabledNow"
                  :title="$t('plugins.flexibleLayouts.extruder.unitToggleHint')" @click="toggleFeedUnit">
            {{ feedUnit === "mmS" ? "mm/s" : "mm/min" }}
          </button>
        </div>
      </div>

      <!-- Flow mode: volumetric flow rate + derived feed-rate -->
      <template v-else>
        <div class="ex-row">
          <span class="ex-sub">{{ $t("plugins.flexibleLayouts.extruder.flow") }}</span>
          <div class="ex-field">
            <input v-model.number="flowRate" class="ex-num" type="number" min="0.1" step="0.1" inputmode="decimal" />
            <span class="ex-unit">mm³/s</span>
          </div>
        </div>
        <div class="ex-derived">{{ $t("plugins.flexibleLayouts.extruder.atFeed", { feed: derivedFeed }) }}</div>
      </template>

      <div v-if="belowExtrudeTemp || belowRetractTemp" class="ex-cold-warning">
        <v-icon size="14" class="mr-1">mdi-snowflake-alert</v-icon>
        {{ $t("plugins.flexibleLayouts.extruder.coldWarning", { temp: hotendTemp!.toFixed(0) }) }}
      </div>
      <div class="d-flex ga-1 mt-1">
        <v-btn size="small" variant="tonal" :color="belowExtrudeTemp ? 'warning' : (widget.color || 'primary')" class="flex-grow-1" :disabled="disabledNow"
               prepend-icon="mdi-arrow-down" @click="move(1)">{{ $t("plugins.flexibleLayouts.extruder.extrude") }}</v-btn>
        <v-btn size="small" variant="tonal" :color="belowRetractTemp ? 'warning' : (widget.color || 'primary')" class="flex-grow-1" :disabled="disabledNow"
               prepend-icon="mdi-arrow-up" @click="move(-1)">{{ $t("plugins.flexibleLayouts.extruder.retract") }}</v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

interface Extruder { filamentDiameter?: number }
interface Tool { extruders?: Array<number>; heaters?: Array<number> }
interface Heater { current?: number }

const props = defineProps<{ widget: Extract<Widget, { type: "extruder" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const amounts = computed(() => (props.widget.amounts?.length ? props.widget.amounts : [1, 5, 10, 50]));
const amount = ref<number>(amounts.value[1] ?? amounts.value[0] ?? 5);

// Config-backed (persist edits to the widget so they stick).
const mode = computed({
  get: () => props.widget.mode ?? "length",
  set: (v: "length" | "flow") => { props.widget.mode = v; },
});
const feedrate = computed({
  get: () => props.widget.feedrate ?? 300,
  set: (v: number) => { props.widget.feedrate = Number(v) || 0; },
});
const feedUnit = computed(() => props.widget.feedUnit ?? "mmMin");
function toggleFeedUnit(): void {
  props.widget.feedUnit = feedUnit.value === "mmS" ? "mmMin" : "mmS";
}
// Displayed/entered in whichever unit is currently selected; feedrate itself always stays in
// mm/min underneath (that's what G1's F parameter needs), so the sent command never depends on
// which unit the operator happened to be looking at when they typed a value.
const feedDisplay = computed({
  get: () => (feedUnit.value === "mmS" ? Number((feedrate.value / 60).toFixed(2)) : feedrate.value),
  set: (v: number) => { feedrate.value = feedUnit.value === "mmS" ? Number(v) * 60 : Number(v); },
});
const flowRate = computed({
  get: () => props.widget.flowRate ?? 5,
  set: (v: number) => { props.widget.flowRate = Number(v) || 0; },
});

// --- flow → feed-rate conversion ---------------------------------------------------
const model = computed(() => machineStore.model as {
  move?: { extruders?: Array<Extruder> };
  tools?: Array<Tool>;
  state?: { currentTool?: number };
  heat?: { heaters?: Array<Heater | null>; coldExtrudeTemperature?: number; coldRetractTemperature?: number };
});
const toolNum = computed(() => props.widget.tool ?? model.value.state?.currentTool ?? -1);
const currentTool = computed(() => (toolNum.value >= 0 ? model.value.tools?.[toolNum.value] : undefined));
const extruderIndex = computed(() => {
  const ei = currentTool.value?.extruders?.[0];
  return typeof ei === "number" ? ei : 0;
});

// --- cold extrusion warning ---------------------------------------------------------
// RRF enforces cold-extrude/retract blocking itself (heat.coldExtrudeTemperature /
// coldRetractTemperature), but the object model exposes only those THRESHOLDS - there's no field
// reporting whether an operator has already overridden it with M302 P1. Disabling the buttons
// outright below temperature would therefore be wrong for anyone who's deliberately done that (a
// common workshop/service move), so this only warns - the actual safety net is move()'s own
// error-reply surfacing below, which now shows RRF's real refusal if one happens.
const hotendTemp = computed<number | null>(() => {
  const heaterIdx = currentTool.value?.heaters?.[0];
  const t = typeof heaterIdx === "number" ? model.value.heat?.heaters?.[heaterIdx]?.current : undefined;
  return typeof t === "number" ? t : null;
});
const coldExtrudeThreshold = computed(() => model.value.heat?.coldExtrudeTemperature ?? 160);
const coldRetractThreshold = computed(() => model.value.heat?.coldRetractTemperature ?? 90);
const belowExtrudeTemp = computed(() => hotendTemp.value !== null && hotendTemp.value < coldExtrudeThreshold.value);
const belowRetractTemp = computed(() => hotendTemp.value !== null && hotendTemp.value < coldRetractThreshold.value);
const diameter = computed(() => {
  const omd = model.value.move?.extruders?.[extruderIndex.value]?.filamentDiameter;
  return props.widget.filamentDiameter || (typeof omd === "number" && omd > 0 ? omd : 0) || 1.75;
});
// Feed-rate (mm/min) that yields the requested volumetric flow: F = flow / area × 60.
const derivedFeed = computed(() => {
  const area = Math.PI * (diameter.value / 2) ** 2;
  if (!(area > 0) || !(flowRate.value > 0)) return 0;
  return Math.round((flowRate.value / area) * 60);
});

// The feed-rate actually sent, per the selected mode.
const effectiveFeed = computed(() => (mode.value === "flow" ? derivedFeed.value : Math.round(feedrate.value)));

// RRF's own firmware blocks a cold extrude/retract (below heat.coldExtrudeTemperature /
// coldRetractTemperature - both server-side thresholds with no "cold extrusion allowed" flag
// exposed via the object model, so this can't be pre-checked client-side) and reports it as a
// normally-RESOLVED "Error: ..." reply, not a rejected promise - RRF/DWC only reject on actual
// transport failures, never on the G-code itself erroring. logReply=false additionally suppresses
// DWC's own automatic error logging for a resolved reply (see machine.ts's sendCode). Combined,
// a cold-extrusion refusal - or any other G-code error the move triggers, e.g. one firmware chooses
// to report for exceeding a configured speed limit - was previously swallowed with nothing shown to
// the operator at all.
function isErrorReply(reply: string): boolean {
  return /^error:/i.test(reply.trim());
}

async function move(dir: number): Promise<void> {
  if (disabledNow.value || effectiveFeed.value <= 0) return;
  const lines: Array<string> = [];
  if (props.widget.tool !== null && props.widget.tool !== undefined) lines.push(`T${props.widget.tool}`);
  lines.push("M83");
  lines.push(`G1 E${dir * amount.value} F${effectiveFeed.value}`);
  try {
    const reply = await machineStore.sendCode(lines.join("\n"), false, false);
    if (isErrorReply(reply)) {
      uiStore.makeNotification(LogLevel.error, "Extrude failed", reply.trim());
    }
  } catch (e) {
    uiStore.makeNotification(LogLevel.error, "Extrude failed", (e as Error)?.message ?? String(e));
  }
}
</script>

<style scoped>
.ex-root { min-height: 0; overflow: auto; }
.ex-frozen { opacity: 0.5; pointer-events: none; }
.ex-label { font-size: 0.85em; font-weight: 600; }

.ex-section { display: flex; flex-direction: column; gap: 4px; }
.ex-row { display: flex; align-items: center; gap: 8px; }
.ex-sub { font-size: 0.7em; opacity: 0.7; min-width: 4.5em; }
.ex-modes { height: auto; }
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
.ex-unit-toggle {
  font: inherit; background: none; border: none; color: inherit; cursor: pointer;
  padding: 2px 4px; border-radius: 3px; text-decoration: underline dotted;
}
.ex-unit-toggle:hover, .ex-unit-toggle:focus-visible { background: rgba(var(--v-theme-on-surface), 0.08); opacity: 1; }
.ex-cold-warning {
  display: flex; align-items: center; font-size: 0.68em; font-weight: 600;
  color: rgb(var(--v-theme-warning)); margin-top: 4px;
}
</style>
