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

      <!-- Files as thumbnail tiles when enabled (and available), else compact buttons -->
      <template v-if="showThumbs">
        <button v-for="f in files" :key="'f:' + f.name" type="button" class="fl-file"
                :disabled="disabledNow" @click="start(f.name)">
          <component :is="ThumbnailImg" v-if="firstThumb(f)" :thumbnail="firstThumb(f)" class="fl-thumb" />
          <v-icon v-else size="small" class="fl-thumb-fallback">mdi-file-outline</v-icon>
          <span class="fl-name text-truncate" :title="f.name">{{ f.name }}</span>
        </button>
      </template>
      <template v-else>
        <v-btn v-for="f in files" :key="'f:' + f.name" size="small" variant="tonal" :color="widget.color || 'primary'"
               class="text-none fl-btn" :disabled="disabledNow" prepend-icon="mdi-file-outline"
               @click="start(f.name)">{{ f.name }}</v-btn>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, resolveComponent, watch } from "vue";

import { type GcodeThumbnailItem, useGcodeThumbnails } from "@/composables/useGcodeThumbnails";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "files" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// DWC's slicer-thumbnail fetcher (caches getFileInfo + populates each item's `thumbnails`), and its
// globally-registered renderer. Resolving the renderer by name means we don't bundle the QOI decoder.
const thumbs = useGcodeThumbnails();
const ThumbnailImg = resolveComponent("ThumbnailImg");
const showThumbs = computed(() => props.widget.thumbnails !== false && typeof ThumbnailImg !== "string");

interface ThumbInfo { data?: string | null; width: number; height: number }
function firstThumb(f: GcodeThumbnailItem): ThumbInfo | null {
  const list = (f.thumbnails ?? []) as Array<ThumbInfo>;
  const usable = list.filter((t) => !!t && !!t.data);
  return usable.length ? usable.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0] : null;
}

// The configured folder is the navigation root; the user can drill into sub-folders but not above it.
const root = computed(() => (props.widget.folder || "0:/gcodes").replace(/\/+$/, ""));
const currentDir = ref(root.value);
watch(root, (r) => { currentDir.value = r; }); // reset when the configured folder changes

const dirs = ref<Array<string>>([]);
const files = ref<Array<GcodeThumbnailItem>>([]);
const loading = ref(false);

async function load(): Promise<void> {
  thumbs.cancelInFlight();
  if (!machineStore.isConnected) { dirs.value = []; files.value = []; return; }
  loading.value = true;
  try {
    const list = await machineStore.getFileList(currentDir.value);
    dirs.value = list.filter((f) => f.isDirectory).map((f) => f.name).sort();
    files.value = list
      .filter((f) => !f.isDirectory && /\.(gco|gcode|g|nc)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name)) as Array<GcodeThumbnailItem>;
    // Decorate fetches getFileInfo per gcode file and fills in `thumbnails` reactively.
    if (showThumbs.value && files.value.length) {
      thumbs.decorate(files.value, currentDir.value);
    }
  } catch {
    dirs.value = [];
    files.value = [];
  } finally {
    loading.value = false;
  }
}
watch([() => machineStore.isConnected, currentDir], load, { immediate: true });
onBeforeUnmount(() => thumbs.cancelInFlight());

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

.fl-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid transparent;
  cursor: pointer;
  min-width: 0;
  color: inherit;
  font: inherit;
}
.fl-file:hover:not(:disabled) { border-color: rgba(var(--v-theme-primary), 0.5); }
.fl-file:disabled { opacity: 0.5; cursor: default; }
.fl-thumb { width: 100%; max-height: 88px; aspect-ratio: 1; object-fit: contain; }
.fl-thumb-fallback { margin: 8px 0; }
.fl-name { font-size: 0.7rem; max-width: 100%; }
</style>
