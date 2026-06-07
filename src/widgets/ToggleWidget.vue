<template>
  <div class="tg-root fill-height d-flex align-center px-2" :class="{ 'tg-frozen': disabledNow }">
    <template v-if="widget.variant === 'button'">
      <v-btn :color="isOn ? (widget.color || 'primary') : undefined" :variant="isOn ? 'flat' : 'tonal'"
             block class="text-none" :disabled="disabledNow" @click="toggle">
        <v-icon start>{{ isOn ? "mdi-toggle-switch" : "mdi-toggle-switch-off-outline" }}</v-icon>
        {{ widget.label }}
      </v-btn>
    </template>
    <template v-else>
      <span class="tg-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <v-switch :model-value="isOn" :color="widget.color || 'primary'" density="compact" hide-details
                :disabled="disabledNow" @update:model-value="set($event === true)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "toggle" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// State follows the OM value's truthiness when a path is set; otherwise a local latch.
const localOn = ref(false);
const isOn = computed(() => {
  if (!props.widget.omPath) return localOn.value;
  const v = resolveOmPath(machineStore.model, props.widget.omPath);
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  if (typeof v === "string") return v !== "" && v !== "false" && v !== "0";
  return !!v;
});

function send(code: string | undefined): void {
  if (disabledNow.value || !code) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Command failed", (e as Error)?.message ?? String(e)));
}
function set(on: boolean): void {
  localOn.value = on;
  send(on ? props.widget.onCommand : props.widget.offCommand);
}
function toggle(): void { set(!isOn.value); }
</script>

<style scoped>
.tg-root { min-height: 0; }
.tg-frozen { opacity: 0.5; pointer-events: none; }
.tg-label { font-size: 0.8rem; font-weight: 500; }
</style>
