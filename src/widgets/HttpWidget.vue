<template>
  <div class="hp-root fill-height d-flex flex-column justify-center px-2">
    <span v-if="widget.label" class="hp-label text-truncate">{{ widget.label }}</span>
    <span class="hp-value text-truncate" :title="value">{{ widget.prefix || "" }}{{ value }}{{ widget.suffix || "" }}</span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "http" }>; disabled?: boolean }>();

const value = ref("—");
let timer: ReturnType<typeof setInterval> | null = null;

function pick(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (!seg) continue;
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

async function poll(): Promise<void> {
  if (!props.widget.url) { value.value = "—"; return; }
  try {
    const res = await fetch(props.widget.url, { mode: "cors" });
    const text = await res.text();
    if (props.widget.jsonPath) {
      try {
        const v = pick(JSON.parse(text), props.widget.jsonPath);
        value.value = v === undefined || v === null ? "—" : (typeof v === "object" ? JSON.stringify(v) : String(v));
      } catch { value.value = text.slice(0, 80); }
    } else {
      value.value = text.slice(0, 120);
    }
  } catch (e) {
    value.value = "⚠";
  }
}

onMounted(() => {
  void poll();
  const ms = props.widget.pollMs ?? 0;
  if (ms > 0) timer = setInterval(poll, Math.max(500, ms));
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.hp-root { min-height: 0; }
.hp-label { font-size: 0.75em; opacity: 0.7; }
.hp-value { font-size: 1.05em; font-weight: 600; }
</style>
