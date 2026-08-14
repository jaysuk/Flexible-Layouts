<template>
  <div class="sl-root fill-height d-flex flex-column justify-center px-2" :class="{ 'sl-frozen': disabledNow }">
    <div class="d-flex align-center mb-1">
      <span class="sl-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <span class="sl-val">{{ displayValue }}{{ widget.unit || "" }}</span>
    </div>
    <v-slider :model-value="position" :min="min" :max="max" :step="step" :color="widget.color || 'primary'"
              density="compact" hide-details thumb-size="14" :disabled="disabledNow"
              @update:model-value="onInput" @end="onEnd" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "slider" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const min = computed(() => props.widget.min ?? 0);
const max = computed(() => props.widget.max ?? 100);
const step = computed(() => props.widget.step ?? 1);

// Live OM value mapped to the slider scale (slider = om * scale + offset).
const omPosition = computed<number | null>(() => {
  if (!props.widget.omPath) return null;
  const raw = resolveOmPath(machineStore.model, props.widget.omPath);
  if (typeof raw !== "number") return null;
  return raw * (props.widget.scale ?? 1) + (props.widget.offset ?? 0);
});

// While the user drags, show their value; otherwise follow the live OM value.
const dragging = ref<number | null>(null);
const position = computed(() => dragging.value ?? omPosition.value ?? min.value);
const displayValue = computed(() => {
  const v = position.value;
  // Explicit decimal places win; otherwise default to whole numbers for a whole step, else 2 dp.
  if (props.widget.precision !== undefined) {
    return Number(v.toFixed(Math.max(0, props.widget.precision)));
  }
  return Number.isInteger(step.value) ? Math.round(v) : Number(v.toFixed(2));
});

watch(omPosition, () => { if (dragging.value === null) { /* re-render via computed */ } });

// Inverse of omPosition's `raw * scale + offset`: the slider's own min/max/step are in DISPLAY
// units (e.g. a 0-100% dial), but the command needs whatever units the underlying object-model value
// itself uses (e.g. RRF's M106 S is a 0.0-1.0 fraction). Without this, {value} was substituted with
// the raw 0-100 slider position regardless of scale/offset - scale/offset only ever affected what was
// DISPLAYED, never what was SENT, so a slider showing "100%" could send a command nowhere near what
// 100% actually meant to the machine.
function toRawValue(v: number): number {
  const scale = props.widget.scale ?? 1;
  const offset = props.widget.offset ?? 0;
  return scale !== 0 ? (v - offset) / scale : v;
}
function send(v: number): void {
  if (disabledNow.value || !props.widget.command) return;
  const code = props.widget.command.replace(/\{value\}/g, String(toRawValue(v)));
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Command failed", (e as Error)?.message ?? String(e)));
}
function onInput(v: number): void {
  dragging.value = v;
  if (props.widget.live) send(v);
}
function onEnd(v: number): void {
  if (!props.widget.live) send(v);
  // Release the drag hold shortly after so the live OM value can take over again.
  setTimeout(() => { dragging.value = null; }, 600);
}
</script>

<style scoped>
.sl-root { min-height: 0; }
.sl-frozen { opacity: 0.5; pointer-events: none; }
.sl-label { font-size: 0.8em; font-weight: 500; }
.sl-val { font-size: 0.8em; font-variant-numeric: tabular-nums; opacity: 0.85; }
</style>
