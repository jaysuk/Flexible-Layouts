<template>
  <div class="wc-root fill-height d-flex align-center justify-center">
    <div v-if="!widget.url" class="text-medium-emphasis text-caption pa-2">
      {{ $t("plugins.flexibleLayouts.webcam.unset") }}
    </div>
    <img v-else :src="src" class="wc-img" :style="{ objectFit: widget.fit || 'contain' }"
         :class="{ 'wc-click': widget.fullscreen !== false }"
         @click="widget.fullscreen !== false && (full = true)" @error="onError" />

    <v-dialog v-model="full" max-width="90vw">
      <v-card>
        <img :src="src" style="width:100%;height:auto;display:block" />
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "webcam" }>; disabled?: boolean }>();

const tick = ref(0);
const full = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

// >0 ms = snapshot: append a cache-busting param and refresh on a timer. 0 = live stream (as-is).
const src = computed(() => {
  const url = props.widget.url ?? "";
  if (!url || !(props.widget.refreshMs && props.widget.refreshMs > 0)) return url;
  return url + (url.includes("?") ? "&" : "?") + "_t=" + tick.value;
});

function onError(): void { /* keep the broken-image icon; refresh will retry */ }

onMounted(() => {
  const ms = props.widget.refreshMs ?? 0;
  if (ms > 0) timer = setInterval(() => { tick.value = Date.now(); }, ms);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.wc-root { min-height: 0; overflow: hidden; }
.wc-img { max-width: 100%; max-height: 100%; }
.wc-click { cursor: zoom-in; }
</style>
