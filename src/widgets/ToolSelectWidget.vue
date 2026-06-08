<template>
  <div class="ts-root fill-height d-flex flex-column justify-center px-2 py-1" :class="{ 'ts-frozen': disabledNow }">
    <span v-if="widget.label" class="ts-label text-truncate">{{ widget.label }}</span>
    <div class="d-flex flex-wrap ga-1 mt-1">
      <v-btn v-for="t in tools" :key="t.number" size="small" :variant="t.number === current ? 'flat' : 'tonal'"
             :color="t.number === current ? (widget.color || 'primary') : undefined" :disabled="disabledNow"
             class="ts-btn text-none" @click="select(t.number)">{{ t.name || ("T" + t.number) }}</v-btn>
      <v-btn v-if="tools.length" size="small" variant="tonal" :disabled="disabledNow" class="ts-btn"
             icon="mdi-close" :title="$t('plugins.flexibleLayouts.toolSelect.none')" @click="select(-1)" />
    </div>
    <div v-if="!tools.length" class="text-medium-emphasis text-caption">{{ $t("plugins.flexibleLayouts.toolSelect.empty") }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "toolSelect" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

const tools = computed<Array<{ number: number; name: string }>>(() => {
  const arr = resolveOmPath(machineStore.model, "tools");
  if (!Array.isArray(arr)) return [];
  return arr.filter((t) => t != null).map((t) => ({ number: (t as { number?: number }).number ?? 0, name: (t as { name?: string }).name ?? "" }));
});
const current = computed(() => {
  const n = resolveOmPath(machineStore.model, "state.currentTool");
  return typeof n === "number" ? n : -1;
});

function select(n: number): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(`T${n}`, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Tool change failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.ts-root { min-height: 0; }
.ts-frozen { opacity: 0.5; pointer-events: none; }
.ts-label { font-size: 0.8em; font-weight: 500; }
.ts-btn { min-width: 0; }
</style>
