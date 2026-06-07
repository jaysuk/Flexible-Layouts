<template>
  <div class="el-root fill-height pa-1">
    <div ref="log" class="el-log">
      <div v-if="!entries.length" class="text-medium-emphasis text-caption">{{ $t("plugins.flexibleLayouts.eventLog.empty") }}</div>
      <div v-for="(e, i) in entries" :key="i" class="el-line" :class="`el-${e.kind}`">{{ e.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import Events from "@/utils/events";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "eventLog" }>; disabled?: boolean }>();

interface Entry { kind: string; text: string }
const entries = ref<Array<Entry>>([]);
const log = ref<HTMLElement | null>(null);

function push(kind: string, text: string): void {
  if (!text) return;
  entries.value.push({ kind, text });
  const max = props.widget.rows ?? 8;
  if (entries.value.length > max) entries.value.splice(0, entries.value.length - max);
  void nextTick(() => { if (log.value) log.value.scrollTop = log.value.scrollHeight; });
}

function onMessage(m: { type?: unknown; content?: string }): void { push("msg", m?.content ?? ""); }
function onCode(c: { code?: string; reply?: string | null }): void {
  if (c?.code) push("cmd", `> ${c.code}`);
  if (c?.reply) push("reply", c.reply);
}

onMounted(() => {
  Events.on("message", onMessage);
  Events.on("codeExecuted", onCode);
});
onBeforeUnmount(() => {
  Events.off("message", onMessage);
  Events.off("codeExecuted", onCode);
});
</script>

<style scoped>
.el-root { min-height: 0; }
.el-log { height: 100%; overflow-y: auto; font-family: monospace; font-size: 0.72rem; line-height: 1.35; }
.el-line { white-space: pre-wrap; word-break: break-word; }
.el-cmd { color: rgb(var(--v-theme-primary)); }
.el-reply { opacity: 0.85; }
.el-msg { opacity: 0.9; }
</style>
