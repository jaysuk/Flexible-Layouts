<template>
  <div class="st-root fill-height d-flex flex-column justify-center px-2" :class="{ 'st-frozen': disabledNow }">
    <span v-if="widget.label" class="st-label text-truncate text-center">{{ widget.label }}</span>
    <div class="d-flex align-center justify-center ga-1">
      <v-btn icon="mdi-minus" size="small" variant="tonal" :color="widget.color || 'primary'"
             :disabled="disabledNow" @click="bump(-1)" />
      <span class="st-val text-center flex-grow-1">{{ displayValue }}<span v-if="widget.unit" class="st-unit">{{ widget.unit }}</span></span>
      <v-btn icon="mdi-plus" size="small" variant="tonal" :color="widget.color || 'primary'"
             :disabled="disabledNow" @click="bump(1)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "stepper" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const step = computed(() => props.widget.step ?? 1);
const precision = computed(() => props.widget.precision ?? (Number.isInteger(step.value) ? 0 : 2));

const omValue = computed<number | null>(() => {
  if (!props.widget.omPath) return null;
  const v = resolveOmPath(machineStore.model, props.widget.omPath);
  return typeof v === "number" ? v : null;
});
const displayValue = computed(() => {
  const v = omValue.value;
  return v === null ? "—" : v.toFixed(precision.value);
});

function fmt(n: number): string { return Number(n.toFixed(precision.value)).toString(); }
function send(value: number): void {
  if (disabledNow.value || !props.widget.command) return;
  const code = props.widget.command.replace(/\{value\}/g, fmt(value));
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Command failed", (e as Error)?.message ?? String(e)));
}
function bump(dir: number): void {
  const delta = dir * step.value;
  if ((props.widget.mode ?? "absolute") === "relative") {
    send(delta); // e.g. M290 Z{value} with value = ±step
    return;
  }
  // Absolute: nudge from the live value (or 0) and send the new total, clamped.
  let next = (omValue.value ?? 0) + delta;
  if (props.widget.min !== undefined) next = Math.max(props.widget.min, next);
  if (props.widget.max !== undefined) next = Math.min(props.widget.max, next);
  send(next);
}
</script>

<style scoped>
.st-root { min-height: 0; }
.st-frozen { opacity: 0.5; pointer-events: none; }
.st-label { font-size: 0.78rem; font-weight: 500; line-height: 1.3; }
.st-val { font-size: 0.95rem; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.st-unit { font-size: 0.75rem; font-weight: 400; opacity: 0.7; margin-left: 1px; }
</style>
