<template>
  <div class="in-root fill-height d-flex flex-column pa-1">
    <div v-if="widget.title" class="in-title text-truncate flex-shrink-0">{{ widget.title }}</div>
    <div class="in-grid flex-grow-1" :style="{ gridTemplateColumns: `repeat(${widget.columns || 2}, 1fr)` }">
      <div v-for="(it, i) in items" :key="i" class="in-item">
        <v-icon size="small" :color="it.color">{{ it.icon }}</v-icon>
        <span class="in-label text-truncate">{{ it.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { evaluateRule } from "../util/conditions";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "indicators" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

// Original behaviour, kept as the default for any item with no operator set (including every
// item saved before comparison operators existed) - never removed, so existing indicators keep
// behaving exactly as they always have.
function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") return v !== "" && v !== "false" && v !== "0";
  return !!v;
}
const items = computed(() =>
  (props.widget.items ?? []).map((it) => {
    const on = it.operator
      ? evaluateRule(machineStore.model, { omPath: it.omPath, operator: it.operator, value: it.value })
      : truthy(resolveOmPath(machineStore.model, it.omPath));
    return {
      label: it.label || it.omPath,
      color: on ? (it.trueColor || "success") : (it.falseColor || "grey"),
      icon: "mdi-circle",
    };
  }),
);
</script>

<style scoped>
.in-root { min-height: 0; }
.in-title { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.in-grid { display: grid; gap: 4px 8px; align-content: flex-start; overflow-y: auto; min-height: 0; }
.in-item { display: flex; align-items: center; gap: 5px; }
.in-label { font-size: 0.78em; }
</style>
