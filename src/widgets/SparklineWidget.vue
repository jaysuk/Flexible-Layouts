<template>
  <div class="sp-root fill-height d-flex flex-column pa-1">
    <div v-if="widget.title" class="sp-title text-truncate flex-shrink-0">{{ widget.title }}</div>
    <svg class="sp-svg flex-grow-1" viewBox="0 0 100 30" preserveAspectRatio="none">
      <polyline v-for="(line, i) in lines" :key="i" :points="line.points" fill="none"
                :stroke="line.stroke" stroke-width="0.8" vector-effect="non-scaling-stroke" />
    </svg>
    <div class="sp-foot d-flex flex-wrap ga-2 flex-shrink-0">
      <span v-for="(line, i) in lines" :key="i" class="sp-leg" :style="{ color: line.stroke }">{{ line.last }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "sparkline" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const interval = computed(() => props.widget.intervalMs ?? 1000);
const maxPoints = computed(() => Math.max(2, Math.round(((props.widget.windowSeconds ?? 120) * 1000) / interval.value)));
const buffers = ref<Array<Array<number>>>([]);
let timer: ReturnType<typeof setInterval> | null = null;

function sample(): void {
  const series = props.widget.series ?? [];
  series.forEach((s, i) => {
    const v = resolveOmPath(machineStore.model, s.omPath);
    if (typeof v !== "number") return;
    if (!buffers.value[i]) buffers.value[i] = [];
    const buf = buffers.value[i];
    buf.push(v);
    if (buf.length > maxPoints.value) buf.splice(0, buf.length - maxPoints.value);
  });
}

const lines = computed(() =>
  (props.widget.series ?? []).map((s, i) => {
    const buf = buffers.value[i] ?? [];
    let points = "";
    if (buf.length >= 2) {
      const min = Math.min(...buf);
      const max = Math.max(...buf);
      const span = max - min || 1;
      points = buf.map((v, j) => `${(j / (buf.length - 1)) * 100},${29 - ((v - min) / span) * 28}`).join(" ");
    }
    return {
      points,
      stroke: `rgb(var(--v-theme-${s.color || "primary"}))`,
      last: buf.length ? Number(buf[buf.length - 1].toFixed(1)).toString() : "—",
    };
  }),
);

onMounted(() => { sample(); timer = setInterval(sample, interval.value); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.sp-root { min-height: 0; }
.sp-title { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.sp-svg { width: 100%; min-height: 0; }
.sp-foot { font-size: 0.72em; font-variant-numeric: tabular-nums; }
.sp-leg { font-weight: 600; }
</style>
