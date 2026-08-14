<template>
  <div class="tg-root fill-height d-flex align-center px-2" :class="{ 'tg-frozen': disabledNow }">
    <template v-if="widget.variant === 'button'">
      <v-btn :color="isOn ? (widget.color || 'primary') : undefined" :variant="isOn ? 'flat' : 'tonal'"
             block class="text-none fill-height tg-btn" :disabled="disabledNow" @click="toggle">
        <div class="d-flex align-center justify-center ga-1" :class="iconLayoutClass">
          <v-icon>{{ isOn ? "mdi-toggle-switch" : "mdi-toggle-switch-off-outline" }}</v-icon>
          <span class="text-truncate">{{ widget.label }}</span>
        </div>
      </v-btn>
    </template>
    <template v-else-if="widget.labelPosition === 'right'">
      <!-- Extra end padding: the switch's Material ripple extends past its own control box, and
           without room to expand inside this widget's own bounds it gets clipped by the grid item's
           ancestor overflow instead. -->
      <v-switch :model-value="isOn" :color="widget.color || 'primary'" :base-color="widget.offColor"
                density="compact" hide-details class="tg-switch-pad-start"
                :disabled="disabledNow" @update:model-value="set($event === true)" />
      <v-spacer />
      <span class="tg-label text-truncate text-right ml-1">{{ widget.label }}</span>
    </template>
    <template v-else>
      <span class="tg-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <v-switch :model-value="isOn" :color="widget.color || 'primary'" :base-color="widget.offColor"
                density="compact" hide-details class="tg-switch-pad-end"
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

// Matches CommandButtonWidget's own iconLayoutClass exactly, for the same configurability in button mode.
const iconLayoutClass = computed(() => {
  switch (props.widget.iconPosition) {
    case "left": return "flex-row";
    case "right": return "flex-row-reverse";
    case "bottom": return "flex-column-reverse";
    default: return "flex-column";
  }
});

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
.tg-label { font-size: 0.8em; font-weight: 500; }
.tg-btn { min-height: 100%; }
.tg-btn :deep(.v-btn__content) { max-width: 100%; }
/* Gives the switch's ripple room to expand within the widget's own box before it would otherwise hit
   the grid item's ancestor overflow:hidden and get visibly clipped. */
.tg-switch-pad-start :deep(.v-selection-control) { padding-left: 6px; }
.tg-switch-pad-end :deep(.v-selection-control) { padding-right: 6px; }
</style>
