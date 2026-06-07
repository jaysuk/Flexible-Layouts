<template>
  <div class="fn-root fill-height d-flex flex-column justify-center px-2" :class="{ 'fn-frozen': disabledNow }">
    <div class="d-flex align-center mb-1">
      <span class="fn-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <span v-if="rpm !== null" class="fn-rpm me-2">{{ rpm }} rpm</span>
      <span class="fn-val">{{ displayPct }}%</span>
    </div>
    <v-slider :model-value="position" :min="0" :max="100" :step="1" :color="widget.color || 'primary'"
              density="compact" hide-details thumb-size="14" :disabled="disabledNow"
              @update:model-value="onInput" @end="onEnd" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "fan" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const idx = computed(() => props.widget.fanIndex ?? 0);

const omPct = computed(() => {
  const v = resolveOmPath(machineStore.model, `fans[${idx.value}].requestedValue`);
  return typeof v === "number" ? Math.round(v * 100) : 0;
});
const rpm = computed(() => {
  const v = resolveOmPath(machineStore.model, `fans[${idx.value}].rpm`);
  return typeof v === "number" && v >= 0 ? v : null;
});

const dragging = ref<number | null>(null);
const position = computed(() => dragging.value ?? omPct.value);
const displayPct = computed(() => Math.round(position.value));

function send(pct: number): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(`M106 P${idx.value} S${(pct / 100).toFixed(2)}`, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Fan command failed", (e as Error)?.message ?? String(e)));
}
function onInput(v: number): void { dragging.value = v; }
function onEnd(v: number): void { send(v); setTimeout(() => { dragging.value = null; }, 600); }
</script>

<style scoped>
.fn-root { min-height: 0; }
.fn-frozen { opacity: 0.5; pointer-events: none; }
.fn-label { font-size: 0.8rem; font-weight: 500; }
.fn-val { font-size: 0.8rem; font-variant-numeric: tabular-nums; opacity: 0.85; }
.fn-rpm { font-size: 0.7rem; opacity: 0.6; font-variant-numeric: tabular-nums; }
</style>
