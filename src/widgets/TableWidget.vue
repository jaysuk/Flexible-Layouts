<template>
  <div class="tb-root fill-height d-flex flex-column pa-1">
    <div v-if="widget.title" class="tb-title text-truncate flex-shrink-0">{{ widget.title }}</div>
    <div class="tb-body flex-grow-1">
      <div v-for="(row, i) in rows" :key="i" class="tb-row">
        <span class="tb-label text-truncate">{{ row.label || row.omPath }}</span>
        <span class="tb-value">{{ value(row) }}<span v-if="row.unit" class="tb-unit">{{ row.unit }}</span></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "table" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const rows = computed(() => props.widget.rows ?? []);

function value(row: { omPath: string; precision?: number }): string {
  const v = resolveOmPath(machineStore.model, row.omPath);
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return row.precision !== undefined ? v.toFixed(row.precision) : String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return "{…}";
  return String(v);
}
</script>

<style scoped>
.tb-root { min-height: 0; }
.tb-title { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.tb-body { min-height: 0; overflow-y: auto; }
.tb-row { display: flex; align-items: baseline; gap: 8px; padding: 1px 2px; }
.tb-label { flex: 1 1 auto; font-size: 0.8em; opacity: 0.8; }
.tb-value { font-size: 0.85em; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tb-unit { font-size: 0.7em; font-weight: 400; opacity: 0.7; margin-left: 1px; }
</style>
