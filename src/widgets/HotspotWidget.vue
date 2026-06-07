<template>
  <div class="hs-root fill-height" :class="{ 'hs-frozen': disabledNow }">
    <div v-if="!widget.url" class="text-medium-emphasis text-caption pa-2">
      {{ $t("plugins.flexibleLayouts.hotspot.unset") }}
    </div>
    <div v-else class="hs-stage">
      <img :src="widget.url" class="hs-img" />
      <button v-for="(r, i) in regions" :key="i" type="button" class="hs-region"
              :class="{ 'hs-region--edit': editMode }" :disabled="disabledNow"
              :style="{ left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' }"
              :title="r.label || r.command" @click="fire(r)">
        <span v-if="editMode && r.label" class="hs-tag">{{ r.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { editMode } from "../model/editorState";

const props = defineProps<{ widget: Extract<Widget, { type: "hotspot" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const regions = computed(() => props.widget.regions ?? []);

function fire(r: { command?: string }): void {
  if (disabledNow.value || !r.command) return;
  void machineStore.sendCode(r.command, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Command failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.hs-root { min-height: 0; overflow: hidden; }
.hs-frozen { opacity: 0.5; pointer-events: none; }
.hs-stage { position: relative; display: inline-block; max-width: 100%; max-height: 100%; }
.hs-img { display: block; max-width: 100%; max-height: 100%; }
.hs-region { position: absolute; background: transparent; border: none; cursor: pointer; padding: 0; }
.hs-region--edit { border: 1px dashed rgba(var(--v-theme-primary), 0.8); background: rgba(var(--v-theme-primary), 0.12); }
.hs-tag { font-size: 0.65rem; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); padding: 0 3px; border-radius: 2px; }
</style>
