<template>
  <div class="mc-root fill-height d-flex flex-column pa-1" :class="{ 'mc-frozen': disabledNow }">
    <div v-if="loading" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.macros.loading") }}</div>
    <div v-else-if="!files.length" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.macros.none") }}</div>
    <div v-else class="mc-grid" :style="{ gridTemplateColumns: `repeat(${widget.columns || 2}, 1fr)` }">
      <v-btn v-for="f in files" :key="f" size="small" variant="tonal" :color="widget.color || 'primary'"
             class="text-none mc-btn" :disabled="disabledNow" prepend-icon="mdi-cog-play"
             @click="run(f)">{{ pretty(f) }}</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "macros" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const files = ref<Array<string>>([]);
const loading = ref(false);

const folder = computed(() => props.widget.folder || "0:/macros");

async function load(): Promise<void> {
  if (!machineStore.isConnected) { files.value = []; return; }
  loading.value = true;
  try {
    const list = await machineStore.getFileList(folder.value);
    files.value = list.filter((f) => !f.isDirectory && /\.g$/i.test(f.name)).map((f) => f.name).sort();
  } catch (e) {
    files.value = [];
  } finally {
    loading.value = false;
  }
}
watch([() => machineStore.isConnected, folder], load, { immediate: true });

function pretty(name: string): string { return name.replace(/\.g$/i, ""); }
function run(name: string): void {
  if (disabledNow.value) return;
  const path = `${folder.value.replace(/\/$/, "")}/${name}`;
  void machineStore.sendCode(`M98 P"${path}"`, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Macro failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.mc-root { min-height: 0; }
.mc-frozen { opacity: 0.5; pointer-events: none; }
.mc-grid { display: grid; gap: 4px; overflow-y: auto; min-height: 0; }
.mc-btn { min-width: 0; }
.mc-btn :deep(.v-btn__content) { overflow: hidden; text-overflow: ellipsis; }
</style>
