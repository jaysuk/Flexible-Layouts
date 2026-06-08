<template>
  <div class="ex-root fill-height d-flex flex-column justify-center px-2 py-1" :class="{ 'ex-frozen': disabledNow }">
    <span v-if="widget.label" class="ex-label text-truncate">{{ widget.label }}</span>
    <div class="d-flex flex-wrap ga-1 my-1">
      <v-chip v-for="a in amounts" :key="a" size="x-small" :variant="a === amount ? 'flat' : 'tonal'"
              :color="a === amount ? (widget.color || 'primary') : undefined" @click="amount = a">{{ a }}</v-chip>
      <v-text-field v-model.number="feedrate" type="number" density="compact" variant="outlined" hide-details
                    class="ex-feed" suffix="mm/min" />
    </div>
    <div class="d-flex ga-1">
      <v-btn size="small" variant="tonal" :color="widget.color || 'primary'" class="flex-grow-1" :disabled="disabledNow"
             prepend-icon="mdi-arrow-down" @click="move(1)">{{ $t("plugins.flexibleLayouts.extruder.extrude") }}</v-btn>
      <v-btn size="small" variant="tonal" color="warning" class="flex-grow-1" :disabled="disabledNow"
             prepend-icon="mdi-arrow-up" @click="move(-1)">{{ $t("plugins.flexibleLayouts.extruder.retract") }}</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "extruder" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const amounts = computed(() => (props.widget.amounts?.length ? props.widget.amounts : [1, 5, 10, 50]));
const amount = ref<number>(amounts.value[1] ?? amounts.value[0] ?? 5);
const feedrate = ref<number>(props.widget.feedrate ?? 300);

function move(dir: number): void {
  if (disabledNow.value) return;
  const lines: Array<string> = [];
  if (props.widget.tool !== null && props.widget.tool !== undefined) lines.push(`T${props.widget.tool}`);
  lines.push("M83");
  lines.push(`G1 E${dir * amount.value} F${feedrate.value}`);
  void machineStore.sendCode(lines.join("\n"), false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Extrude failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.ex-root { min-height: 0; }
.ex-frozen { opacity: 0.5; pointer-events: none; }
.ex-label { font-size: 0.8em; font-weight: 500; }
.ex-feed { max-width: 7rem; }
</style>
