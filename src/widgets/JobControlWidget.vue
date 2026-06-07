<template>
  <div class="jc-root fill-height d-flex flex-column justify-center px-2 py-1" :class="{ 'jc-frozen': disabledNow }">
    <div class="jc-name text-truncate">{{ fileName || $t("plugins.flexibleLayouts.jobControl.noJob") }}</div>
    <v-progress-linear v-if="widget.showProgress !== false" :model-value="pct" :color="widget.color || 'primary'"
                       height="8" rounded class="my-1" />
    <div class="d-flex ga-1">
      <v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-grow-1" :disabled="disabledNow || !printing"
             :icon="paused ? 'mdi-play' : 'mdi-pause'" :title="paused ? $t('plugins.flexibleLayouts.jobControl.resume') : $t('plugins.flexibleLayouts.jobControl.pause')"
             @click="paused ? run('M24') : run('M25')" />
      <v-btn size="small" variant="tonal" color="error" class="flex-grow-1" :disabled="disabledNow || !printing"
             icon="mdi-stop" :title="$t('plugins.flexibleLayouts.jobControl.cancel')" @click="run('M25\nM0')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "jobControl" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const status = computed(() => resolveOmPath(machineStore.model, "state.status"));
const printing = computed(() => status.value === "processing" || status.value === "paused" || status.value === "pausing" || status.value === "resuming");
const paused = computed(() => status.value === "paused");
const fileName = computed(() => {
  const f = resolveOmPath(machineStore.model, "job.file.fileName");
  return typeof f === "string" ? f.replace(/^.*\//, "") : "";
});
const pct = computed(() => {
  const pos = resolveOmPath(machineStore.model, "job.filePosition");
  const size = resolveOmPath(machineStore.model, "job.file.size");
  if (typeof pos === "number" && typeof size === "number" && size > 0) return Math.round((pos / size) * 100);
  return 0;
});

function run(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Job command failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.jc-root { min-height: 0; }
.jc-frozen { opacity: 0.5; pointer-events: none; }
.jc-name { font-size: 0.78rem; font-weight: 500; }
</style>
