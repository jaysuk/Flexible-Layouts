<template>
  <div class="wcs-root fill-height d-flex flex-column justify-center px-2 py-1" :class="{ 'wcs-frozen': disabledNow }">
    <span v-if="widget.label" class="wcs-label text-truncate">{{ widget.label }}</span>
    <div class="d-flex flex-wrap ga-1 my-1">
      <v-btn v-for="(g, i) in WCS" :key="g" size="x-small" :variant="i === activeWcs ? 'flat' : 'tonal'"
             :color="i === activeWcs ? (widget.color || 'primary') : undefined" :disabled="disabledNow"
             class="wcs-btn" @click="select(g)">{{ g }}</v-btn>
    </div>
    <v-btn size="small" variant="tonal" color="warning" :disabled="disabledNow" prepend-icon="mdi-crosshairs-gps"
           @click="zeroHere">{{ $t("plugins.flexibleLayouts.wcs.zeroHere") }}</v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "wcs" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const WCS = ["G54", "G55", "G56", "G57", "G58", "G59"] as const;
const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// move.workplaceNumber is 0-based (0 = G54).
const activeWcs = computed(() => {
  const n = resolveOmPath(machineStore.model, "move.workplaceNumber");
  return typeof n === "number" ? n : 0;
});

function run(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "WCS command failed", (e as Error)?.message ?? String(e)));
}
function select(g: string): void { run(g); }
function zeroHere(): void {
  const axes = props.widget.axes?.length ? props.widget.axes : ["X", "Y", "Z"];
  run(`G10 L20 P${activeWcs.value + 1} ${axes.map((a) => `${a}0`).join(" ")}`);
}
</script>

<style scoped>
.wcs-root { min-height: 0; }
.wcs-frozen { opacity: 0.5; pointer-events: none; }
.wcs-label { font-size: 0.8rem; font-weight: 500; }
.wcs-btn { min-width: 0; padding: 0 6px; }
</style>
