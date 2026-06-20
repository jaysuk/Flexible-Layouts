<template>
  <div class="pr-root fill-height d-flex flex-column justify-center px-2">
    <div class="d-flex align-center mb-1">
      <span v-if="widget.label" class="pr-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <span v-if="widget.showValue !== false" class="pr-val">{{ pctText }}%</span>
    </div>
    <v-progress-linear :model-value="pct" :color="widget.color || 'primary'" height="10" rounded />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "progress" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const pct = computed(() => {
  const v = resolveOmPath(machineStore.model, props.widget.omPath ?? "");
  if (typeof v !== "number") return 0;
  let frac: number;
  if (props.widget.maxPath) {
    const max = resolveOmPath(machineStore.model, props.widget.maxPath);
    frac = typeof max === "number" && max > 0 ? v / max : 0;
  } else {
    const lo = props.widget.min ?? 0;
    const hi = props.widget.max ?? 100;
    frac = hi > lo ? (v * (props.widget.scale ?? 1) - lo) / (hi - lo) : 0;
  }
  return Math.max(0, Math.min(100, frac * 100));
});

// The numeric label honours the configured decimal places (default 0 = whole percent).
const pctText = computed(() => pct.value.toFixed(Math.max(0, props.widget.precision ?? 0)));
</script>

<style scoped>
.pr-root { min-height: 0; }
.pr-label { font-size: 0.8em; font-weight: 500; }
.pr-val { font-size: 0.8em; font-variant-numeric: tabular-nums; opacity: 0.85; }
</style>
