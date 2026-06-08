<template>
  <div class="ht-root fill-height d-flex flex-column px-2 py-1" :class="{ 'ht-frozen': disabledNow }">
    <div class="d-flex align-baseline">
      <span class="ht-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <span class="ht-cur">{{ current }}<span class="ht-unit">°C</span></span>
    </div>
    <div class="ht-target text-medium-emphasis">→ {{ active }}<span v-if="state"> · {{ state }}</span></div>
    <div class="ht-presets mt-1">
      <v-btn v-for="p in widget.presets || []" :key="p" size="x-small" variant="tonal" :color="widget.color || 'primary'"
             class="ht-btn" :disabled="disabledNow" @click="setTarget(p)">{{ p }}°</v-btn>
      <v-btn size="x-small" variant="tonal" color="error" class="ht-btn" :disabled="disabledNow" @click="off">
        {{ $t("plugins.flexibleLayouts.heater.off") }}
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

const props = defineProps<{ widget: Extract<Widget, { type: "heater" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const base = computed(() => props.widget.omPath ?? "");

function num(path: string): number | null {
  const v = resolveOmPath(machineStore.model, path);
  return typeof v === "number" ? v : null;
}
const current = computed(() => { const v = num(`${base.value}.current`); return v === null ? "—" : v.toFixed(1); });
const active = computed(() => { const v = num(`${base.value}.active`); return v === null ? "—" : `${v.toFixed(0)}°C`; });
const state = computed(() => {
  const v = resolveOmPath(machineStore.model, `${base.value}.state`);
  return typeof v === "string" ? v : "";
});

function run(code: string | undefined): void {
  if (disabledNow.value || !code) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Heater command failed", (e as Error)?.message ?? String(e)));
}
function setTarget(t: number): void { run((props.widget.setCommand || "").replace(/\{value\}/g, String(t))); }
function off(): void { run(props.widget.offCommand); }
</script>

<style scoped>
.ht-root { min-height: 0; }
.ht-frozen { opacity: 0.5; pointer-events: none; }
.ht-label { font-size: 0.8em; font-weight: 500; }
.ht-cur { font-size: 1.1em; font-weight: 700; font-variant-numeric: tabular-nums; }
.ht-unit { font-size: 0.7em; font-weight: 400; opacity: 0.7; }
.ht-target { font-size: 0.72em; }
.ht-presets { display: flex; flex-wrap: wrap; gap: 3px; }
.ht-btn { min-width: 0; padding: 0 6px; }
</style>
