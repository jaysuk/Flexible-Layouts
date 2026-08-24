<template>
  <div class="gc-root fill-height d-flex flex-column pa-1">
    <div v-if="widget.title" class="gc-title text-truncate flex-shrink-0">{{ widget.title }}</div>
    <div class="gc-grid flex-grow-1">
      <div v-for="(g, i) in gauges" :key="i" class="gc-item" :class="labelClass">
        <span class="gc-label text-truncate">{{ g.label }}</span>
        <v-progress-circular v-if="variant === 'circular'" :model-value="g.pct" :size="58" :width="6" :color="g.color || 'primary'">
          <span class="gc-num">{{ g.text }}</span>
        </v-progress-circular>
        <div v-else class="gc-linear">
          <div class="gc-linear-track">
            <div class="gc-linear-fill" :style="{ width: g.pct + '%', background: g.strokeColor }" />
          </div>
          <span class="gc-num">{{ g.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import { labelFlexClass } from "../composables/useLabelPosition";
import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "gaugeCluster" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

// "bottom" matches how each gauge rendered before labelPosition existed (gauge first, label after).
const labelClass = computed(() => labelFlexClass(props.widget.labelPosition, "bottom"));
const variant = computed(() => props.widget.variant ?? "circular");

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
      // v-progress-circular takes a Vuetify colour PROP (token or literal, resolved by Vuetify
      // itself); the linear bar's fill is a plain CSS background, so it needs the literal colour
      // string up front instead.
      strokeColor: resolveColor(g.color),
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
.gc-item { display: flex; align-items: center; gap: 2px; }
.gc-num { font-size: 0.72em; font-weight: 600; font-variant-numeric: tabular-nums; }
.gc-label { font-size: 0.7em; opacity: 0.75; max-width: 5rem; }
.gc-linear { display: flex; flex-direction: column; gap: 2px; width: 80px; }
.gc-linear-track { height: 8px; border-radius: 4px; background: rgba(var(--v-theme-on-surface), 0.12); overflow: hidden; }
.gc-linear-fill { height: 100%; border-radius: 4px; transition: width 0.2s ease; }
</style>
