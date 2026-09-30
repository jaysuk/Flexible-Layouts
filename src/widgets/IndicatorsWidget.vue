<template>
  <div class="in-root fill-height d-flex flex-column pa-1">
    <div v-if="widget.title" class="in-title text-truncate flex-shrink-0">{{ widget.title }}</div>
    <div class="in-grid flex-grow-1" :style="{ gridTemplateColumns: `repeat(${widget.columns || 2}, 1fr)` }">
      <div v-for="(it, i) in items" :key="i" class="in-item" :data-on="it.on">
        <v-icon size="small" :color="it.color">{{ it.icon }}</v-icon>
        <span class="in-label text-truncate">{{ it.label }}</span>
        <!-- The state as words too, so it never rests on the dot's colour alone. -->
        <span class="in-state">{{ it.on ? $t("plugins.flexibleLayouts.indicators.on") : $t("plugins.flexibleLayouts.indicators.off") }}</span>
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
      on,
      color: on ? (it.trueColor || "success") : (it.falseColor || "grey"),
      // The configured icons were never used here (it always drew a dot). Now they are; unset means a filled dot for
      // "on" and a hollow one for "off", so the two differ in shape and not just in colour.
      icon: on ? (it.trueIcon || "mdi-circle") : (it.falseIcon || "mdi-circle-outline"),
    };
  }),
);
</script>

<style scoped>
.in-root { min-height: 0; }
/* Visually hidden, still read by screen readers. */
.in-state { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.in-item { position: relative; }
.in-title { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.in-grid { display: grid; gap: 4px 8px; align-content: flex-start; overflow-y: auto; min-height: 0; }
.in-item { display: flex; align-items: center; gap: 5px; }
.in-label { font-size: 0.78em; }
</style>
