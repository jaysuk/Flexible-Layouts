<template>
  <div class="su-root fill-height d-flex align-center justify-center ga-2 px-2">
    <v-icon size="x-small" :color="active.color">{{ active.icon || "mdi-circle" }}</v-icon>
    <span class="su-text text-truncate">{{ active.label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { evaluateRule } from "../util/conditions";

const props = defineProps<{ widget: Extract<Widget, { type: "status" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const active = computed(() => {
  const path = props.widget.omPath ?? "";
  for (const s of props.widget.states ?? []) {
    if (evaluateRule(machineStore.model, { omPath: path, operator: s.operator, value: s.value })) {
      return { color: s.color || "grey", label: s.label ?? "", icon: s.icon };
    }
  }
  return { color: props.widget.defaultColor || "grey", label: props.widget.defaultLabel ?? "—", icon: props.widget.defaultIcon };
});
</script>

<style scoped>
.su-root { min-height: 0; }
.su-text { font-size: 0.85em; font-weight: 600; }
</style>
