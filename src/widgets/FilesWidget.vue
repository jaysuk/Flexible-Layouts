<template>
  <div class="fl-root fill-height d-flex flex-column pa-1" :class="{ 'fl-frozen': disabledNow }">
    <div v-if="loading" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.macros.loading") }}</div>
    <div v-else-if="!files.length" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.files.none") }}</div>
    <div v-else class="fl-grid" :style="{ gridTemplateColumns: `repeat(${widget.columns || 1}, 1fr)` }">
      <v-btn v-for="f in files" :key="f" size="small" variant="tonal" :color="widget.color || 'primary'"
             class="text-none fl-btn" :disabled="disabledNow" prepend-icon="mdi-file-outline"
             @click="start(f)">{{ f }}</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "files" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const folder = computed(() => props.widget.folder || "0:/gcodes");
const files = ref<Array<string>>([]);
const loading = ref(false);

async function load(): Promise<void> {
  if (!machineStore.isConnected) { files.value = []; return; }
  loading.value = true;
  try {
    const list = await machineStore.getFileList(folder.value);
    files.value = list.filter((f) => !f.isDirectory && /\.(gco|gcode|g|nc)$/i.test(f.name)).map((f) => f.name).sort();
  } catch (e) {
    files.value = [];
  } finally {
    loading.value = false;
  }
}
watch([() => machineStore.isConnected, folder], load, { immediate: true });

function start(name: string): void {
  if (disabledNow.value) return;
  const path = `${folder.value.replace(/\/$/, "")}/${name}`;
  const code = (props.widget.startCommand || 'M32 "{path}"').replace(/\{path\}/g, path);
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Start failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.fl-root { min-height: 0; }
.fl-frozen { opacity: 0.5; pointer-events: none; }
.fl-grid { display: grid; gap: 4px; overflow-y: auto; min-height: 0; }
.fl-btn { min-width: 0; }
.fl-btn :deep(.v-btn__content) { overflow: hidden; text-overflow: ellipsis; }
</style>
