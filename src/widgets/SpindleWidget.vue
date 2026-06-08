<template>
  <div class="spn-root fill-height d-flex flex-column justify-center px-2 py-1" :class="{ 'spn-frozen': disabledNow }">
    <div class="d-flex align-center mb-1">
      <span class="spn-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <span class="spn-state" :class="`spn-state--${state}`">{{ state }}</span>
    </div>
    <div class="d-flex align-center ga-2 mb-1">
      <v-slider v-model="rpm" :min="min" :max="max" :step="stepSize" density="compact" hide-details thumb-size="14"
                :color="widget.color || 'primary'" :disabled="disabledNow" />
      <span class="spn-rpm">{{ Math.round(rpm) }}</span>
    </div>
    <div class="d-flex ga-1">
      <v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-grow-1" :disabled="disabledNow"
             icon="mdi-rotate-right" :title="$t('plugins.flexibleLayouts.spindle.forward')" @click="run(`M3 S${Math.round(rpm)}`)" />
      <v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-grow-1" :disabled="disabledNow"
             icon="mdi-rotate-left" :title="$t('plugins.flexibleLayouts.spindle.reverse')" @click="run(`M4 S${Math.round(rpm)}`)" />
      <v-btn size="small" variant="tonal" color="error" class="flex-grow-1" :disabled="disabledNow"
             icon="mdi-stop" :title="$t('plugins.flexibleLayouts.spindle.stop')" @click="run('M5')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "spindle" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const base = computed(() => `spindles[${props.widget.spindleIndex ?? 0}]`);

function num(path: string): number | null {
  const v = resolveOmPath(machineStore.model, path);
  return typeof v === "number" ? v : null;
}
const min = computed(() => props.widget.min ?? num(`${base.value}.min`) ?? 0);
const max = computed(() => props.widget.max ?? num(`${base.value}.max`) ?? 24000);
const stepSize = computed(() => Math.max(1, Math.round((max.value - min.value) / 100)));
const state = computed(() => {
  const v = resolveOmPath(machineStore.model, `${base.value}.state`);
  return typeof v === "string" ? v : "—";
});
const active = computed(() => num(`${base.value}.active`));

// Slider follows the active RPM until the user drags it.
const local = ref<number | null>(null);
const rpm = computed({
  get: () => local.value ?? active.value ?? min.value,
  set: (v: number) => { local.value = v; },
});
watch(active, () => { local.value = null; });

function run(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Spindle command failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.spn-root { min-height: 0; }
.spn-frozen { opacity: 0.5; pointer-events: none; }
.spn-label { font-size: 0.8em; font-weight: 500; }
.spn-rpm { font-size: 0.85em; font-variant-numeric: tabular-nums; width: 3.5em; text-align: right; }
.spn-state { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
.spn-state--forward, .spn-state--reverse { color: rgb(var(--v-theme-success)); opacity: 1; }
</style>
