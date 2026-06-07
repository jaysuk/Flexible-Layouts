<template>
  <div class="cn-root fill-height d-flex flex-column pa-1" :class="{ 'cn-frozen': disabledNow }">
    <div ref="log" class="cn-log flex-grow-1">
      <div v-for="(entry, i) in history" :key="i" class="cn-entry">
        <div class="cn-cmd">&gt; {{ entry.code }}</div>
        <pre v-if="entry.reply" class="cn-reply">{{ entry.reply }}</pre>
      </div>
    </div>
    <v-text-field v-model="cmd" density="compact" variant="outlined" hide-details class="flex-shrink-0 mt-1"
                  :placeholder="widget.placeholder || $t('plugins.flexibleLayouts.console.placeholder')"
                  append-inner-icon="mdi-send" :disabled="disabledNow"
                  @keyup.enter="send" @click:append-inner="send" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "console" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const cmd = ref("");
const history = ref<Array<{ code: string; reply: string }>>([]);
const log = ref<HTMLElement | null>(null);

async function send(): Promise<void> {
  const code = cmd.value.trim();
  if (!code || disabledNow.value) return;
  cmd.value = "";
  const entry = { code, reply: "" };
  history.value.push(entry);
  const max = props.widget.rows ?? 5;
  if (history.value.length > max) history.value.splice(0, history.value.length - max);
  await nextTick();
  if (log.value) log.value.scrollTop = log.value.scrollHeight;
  try {
    entry.reply = (await machineStore.sendCode(code, true, true)) || "";
  } catch (e) {
    entry.reply = (e as Error)?.message ?? String(e);
  }
  await nextTick();
  if (log.value) log.value.scrollTop = log.value.scrollHeight;
}
</script>

<style scoped>
.cn-root { min-height: 0; }
.cn-frozen { opacity: 0.5; pointer-events: none; }
.cn-log { min-height: 0; overflow-y: auto; font-family: monospace; font-size: 0.75rem; }
.cn-entry { margin-bottom: 4px; }
.cn-cmd { color: rgb(var(--v-theme-primary)); }
.cn-reply { white-space: pre-wrap; margin: 0; opacity: 0.85; }
</style>
