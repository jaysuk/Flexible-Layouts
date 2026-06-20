<template>
  <div class="gc-root fill-height d-flex flex-column pa-1">
    <div v-if="widget.title" class="gc-title text-truncate flex-shrink-0">{{ widget.title }}</div>
    <div class="gc-grid flex-grow-1">
      <div v-for="(g, i) in gauges" :key="i" class="gc-item">
        <v-progress-circular :model-value="g.pct" :size="58" :width="6" :color="g.color || 'primary'">
          <span class="gc-num">{{ g.text }}</span>
        </v-progress-circular>
        <span class="gc-label text-truncate">{{ g.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "gaugeCluster" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const gauges = computed(() =>
  (props.widget.gauges ?? []).map((g) => {
    const v = resolveOmPath(machineStore.model, g.omPath);
    const num = typeof v === "number" ? v : null;
    const lo = g.min ?? 0;
    const hi = g.max ?? 100;
    const pct = num === null || hi <= lo ? 0 : Math.max(0, Math.min(100, ((num - lo) / (hi - lo)) * 100));
    const dp = Math.max(0, props.widget.precision ?? 0);
    return {
      label: g.label || g.omPath,
      color: g.color,
      pct,
      text: num === null ? "—" : `${num.toFixed(dp)}${g.unit || ""}`,
    };
  }),
);
</script>

<style scoped>
.gc-root { min-height: 0; }
.gc-title { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.gc-grid { display: flex; flex-wrap: wrap; gap: 10px; align-content: flex-start; justify-content: space-around; overflow-y: auto; min-height: 0; }
.gc-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.gc-num { font-size: 0.72em; font-weight: 600; font-variant-numeric: tabular-nums; }
.gc-label { font-size: 0.7em; opacity: 0.75; max-width: 5rem; }
</style>
