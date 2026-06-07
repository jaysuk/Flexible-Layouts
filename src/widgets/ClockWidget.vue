<template>
  <div class="ck-root fill-height d-flex flex-column align-center justify-center">
    <span v-if="widget.label" class="ck-label text-truncate">{{ widget.label }}</span>
    <span class="ck-value">{{ display }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "clock" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

function hms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const display = computed(() => {
  const mode = props.widget.mode ?? "time";
  if (mode === "time") {
    void now.value; // re-render each second
    return new Date().toLocaleTimeString([], { hour12: props.widget.format === "12", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  let secs: unknown;
  if (mode === "uptime") secs = resolveOmPath(machineStore.model, "state.upTime");
  else if (mode === "printTime") secs = resolveOmPath(machineStore.model, "job.duration");
  else secs = resolveOmPath(machineStore.model, "job.timesLeft.file");
  return typeof secs === "number" ? hms(secs) : "—";
});
</script>

<style scoped>
.ck-root { min-height: 0; }
.ck-label { font-size: 0.72rem; opacity: 0.7; }
.ck-value { font-size: 1.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
</style>
