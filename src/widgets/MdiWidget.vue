<template>
  <div class="mdi-root fill-height d-flex flex-column px-2 py-1" :class="{ 'mdi-frozen': disabledNow }">
    <span v-if="widget.label" class="mdi-label text-truncate flex-shrink-0">{{ widget.label }}</span>
    <div class="d-flex align-center ga-1 flex-shrink-0">
      <v-text-field v-model="entry" density="compact" variant="outlined" hide-details class="mdi-input"
                    :placeholder="$t('plugins.flexibleLayouts.mdi.placeholder')" :disabled="disabledNow"
                    spellcheck="false" autocapitalize="characters" autocomplete="off"
                    @keydown.enter="send" @keydown.up.prevent="recall(-1)" @keydown.down.prevent="recall(1)" />
      <v-btn size="small" :color="widget.color || 'primary'" variant="flat" :disabled="disabledNow || !entry.trim()"
             icon="mdi-send" :title="$t('plugins.flexibleLayouts.mdi.send')" @click="send" />
    </div>
    <div v-if="history.length" class="mdi-history flex-grow-1">
      <v-chip v-for="(h, i) in history" :key="i" size="x-small" variant="tonal" class="mdi-chip"
              :disabled="disabledNow" @click="entry = h; send()">{{ h }}</v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "mdi" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const cap = computed(() => Math.max(1, props.widget.historyLength ?? 8));

const entry = ref("");
const history = ref<Array<string>>([]);
let recallIdx = -1; // -1 = current (live) entry; 0..n = into history

function send(): void {
  const code = entry.value.trim();
  if (disabledNow.value || !code) { return; }
  // Most recent first, de-duplicated, capped.
  history.value = [code, ...history.value.filter((h) => h !== code)].slice(0, cap.value);
  recallIdx = -1;
  entry.value = "";
  // fromInput=true so it shows in the G-code console like a typed command; logReply=true.
  void machineStore.sendCode(code, true, true).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "MDI command failed", (e as Error)?.message ?? String(e)));
}

/** Up/Down arrows step through the command history into the input box. */
function recall(dir: number): void {
  if (!history.value.length) { return; }
  recallIdx = Math.max(-1, Math.min(history.value.length - 1, recallIdx + dir));
  entry.value = recallIdx < 0 ? "" : history.value[recallIdx];
}
</script>

<style scoped>
.mdi-root { min-height: 0; }
.mdi-frozen { opacity: 0.5; pointer-events: none; }
.mdi-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.mdi-input :deep(input) { font-family: monospace; }
.mdi-history { min-height: 0; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.mdi-chip { font-family: monospace; }
</style>
