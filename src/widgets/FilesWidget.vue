<template>
  <div class="fl-root fill-height d-flex flex-column pa-1" :class="{ 'fl-frozen': disabledNow }">
    <!-- Path bar: up a level + current location, shown once you've navigated into a sub-folder -->
    <div v-if="canGoUp" class="fl-bar flex-shrink-0">
      <v-btn icon="mdi-arrow-up-bold-box-outline" size="x-small" variant="text" density="comfortable"
             :title="$t('plugins.flexibleLayouts.files.up')" @click="goUp" />
      <span class="fl-path text-truncate" :title="currentDir">{{ relPath || "/" }}</span>
    </div>

    <div v-if="loading" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.macros.loading") }}</div>
    <div v-else-if="!dirs.length && !files.length" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.files.none") }}</div>
    <div v-else class="fl-grid" :style="{ gridTemplateColumns: `repeat(${widget.columns || 1}, 1fr)` }">
      <!-- Folders first -->
      <v-btn v-for="d in dirs" :key="'d:' + d" size="small" variant="tonal" color="secondary"
             class="text-none fl-btn" :disabled="disabledNow" prepend-icon="mdi-folder-outline"
             @click="openDir(d)">{{ d }}</v-btn>
      <!-- Then printable files -->
      <v-btn v-for="f in files" :key="'f:' + f" size="small" variant="tonal" :color="widget.color || 'primary'"
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

// The configured folder is the navigation root; the user can drill into sub-folders but not above it.
const root = computed(() => (props.widget.folder || "0:/gcodes").replace(/\/+$/, ""));
const currentDir = ref(root.value);
watch(root, (r) => { currentDir.value = r; }); // reset when the configured folder changes

const dirs = ref<Array<string>>([]);
const files = ref<Array<string>>([]);
const loading = ref(false);

async function load(): Promise<void> {
  if (!machineStore.isConnected) { dirs.value = []; files.value = []; return; }
  loading.value = true;
  try {
    const list = await machineStore.getFileList(currentDir.value);
    dirs.value = list.filter((f) => f.isDirectory).map((f) => f.name).sort();
    files.value = list.filter((f) => !f.isDirectory && /\.(gco|gcode|g|nc)$/i.test(f.name)).map((f) => f.name).sort();
  } catch (e) {
    dirs.value = [];
    files.value = [];
  } finally {
    loading.value = false;
  }
}
watch([() => machineStore.isConnected, currentDir], load, { immediate: true });

const canGoUp = computed(() => currentDir.value.length > root.value.length);
const relPath = computed(() => currentDir.value.slice(root.value.length).replace(/^\/+/, ""));

function openDir(name: string): void {
  currentDir.value = `${currentDir.value.replace(/\/+$/, "")}/${name}`;
}
function goUp(): void {
  const parent = currentDir.value.replace(/\/[^/]+$/, "");
  currentDir.value = parent.length >= root.value.length ? parent : root.value;
}

function start(name: string): void {
  if (disabledNow.value) return;
  const path = `${currentDir.value.replace(/\/+$/, "")}/${name}`;
  const code = (props.widget.startCommand || 'M32 "{path}"').replace(/\{path\}/g, path);
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Start failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.fl-root { min-height: 0; }
.fl-frozen { opacity: 0.5; pointer-events: none; }
.fl-bar { display: flex; align-items: center; gap: 4px; padding: 0 2px 2px; }
.fl-path { font-size: 0.7rem; opacity: 0.7; font-family: monospace; min-width: 0; }
.fl-grid { display: grid; gap: 4px; overflow-y: auto; min-height: 0; }
.fl-btn { min-width: 0; }
.fl-btn :deep(.v-btn__content) { overflow: hidden; text-overflow: ellipsis; }
</style>
