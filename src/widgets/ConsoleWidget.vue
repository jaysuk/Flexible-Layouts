<template>
  <div class="cn-root fill-height d-flex flex-column pa-1" :class="{ 'cn-frozen': disabledNow }">
    <div ref="log" class="cn-log flex-grow-1">
      <div v-for="(m, i) in entries" :key="i" class="cn-entry" :class="`cn-${m.type}`">
        <div v-if="m.title" class="cn-title">{{ m.title }}</div>
        <pre v-if="m.message" class="cn-msg">{{ m.message }}</pre>
      </div>
      <div v-if="!entries.length" class="cn-empty text-medium-emphasis text-caption">
        {{ widget.placeholder || $t("plugins.flexibleLayouts.console.placeholder") }}
      </div>
    </div>
    <!-- Native, self-styled input pinned at the bottom (a v-text-field could be clipped by a large
         panel font or a short tile). Enter sends; ↑/↓ recall recent commands. -->
    <div class="cn-input-row flex-shrink-0">
      <input v-model="cmd" class="cn-input" type="text" autocomplete="off" spellcheck="false"
             :placeholder="widget.placeholder || $t('plugins.flexibleLayouts.console.placeholder')"
             :disabled="disabledNow"
             @keydown.enter="send" @keydown.up.prevent="recall(1)" @keydown.down.prevent="recall(-1)" />
      <button type="button" class="cn-send" :disabled="disabledNow || !cmd.trim()"
              :title="$t('plugins.flexibleLayouts.console.send')" @click="send">
        <v-icon size="small">mdi-send</v-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { useAutoScroll, useConsoleEntries, useConsoleSend } from "../util/consoleLog";

const props = defineProps<{ widget: Extract<Widget, { type: "console" }>; disabled?: boolean }>();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const log = ref<HTMLElement | null>(null);

const entries = useConsoleEntries(() => props.widget.rows ?? 5);
useAutoScroll(entries, log);
const { cmd, recall, send } = useConsoleSend(() => disabledNow.value);
</script>

<style scoped>
.cn-root { min-height: 0; }
.cn-frozen { opacity: 0.5; pointer-events: none; }
.cn-log { min-height: 0; overflow-y: auto; font-family: monospace; font-size: 0.75em; }
.cn-entry { margin-bottom: 4px; }
.cn-title { color: rgb(var(--v-theme-primary)); font-weight: 600; }
.cn-msg { white-space: pre-wrap; margin: 0; opacity: 0.9; }
.cn-error .cn-title, .cn-error .cn-msg { color: rgb(var(--v-theme-error)); opacity: 1; }
.cn-warning .cn-title, .cn-warning .cn-msg { color: rgb(var(--v-theme-warning)); opacity: 1; }

.cn-input-row { display: flex; align-items: stretch; gap: 4px; margin-top: 4px; }
.cn-input {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box;
  font: inherit; font-size: 0.85em; line-height: 1.4;
  padding: 3px 6px; color: inherit;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3); border-radius: 4px;
}
.cn-input:focus { outline: none; border-color: rgb(var(--v-theme-primary)); }
.cn-send {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  padding: 0 8px; border-radius: 4px; cursor: pointer; color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12); border: 1px solid rgba(var(--v-theme-primary), 0.4);
}
.cn-send:disabled { opacity: 0.4; cursor: default; }
.cn-send:hover:not(:disabled) { background: rgba(var(--v-theme-primary), 0.22); }
</style>
