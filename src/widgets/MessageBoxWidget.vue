<template>
  <div class="mb-root fill-height d-flex flex-column justify-center pa-2" :class="{ 'mb-frozen': disabledNow }">
    <template v-if="box">
      <div v-if="box.title" class="mb-title text-truncate">{{ box.title }}</div>
      <div class="mb-msg">{{ box.message }}</div>

      <!-- numeric / string input -->
      <v-text-field v-if="isInput" v-model="input" :type="box.mode === 7 ? 'text' : 'number'"
                    density="compact" variant="outlined" hide-details class="mt-2" autofocus
                    @keyup.enter="ok" />

      <!-- multiple choice -->
      <div v-if="box.mode === 4 && box.choices" class="d-flex flex-wrap ga-1 mt-2">
        <v-btn v-for="(c, i) in box.choices" :key="i" size="small" variant="tonal" color="primary"
               class="text-none" :disabled="disabledNow" @click="choose(i)">{{ c }}</v-btn>
      </div>

      <!-- ok / cancel -->
      <div v-else class="d-flex ga-2 mt-2">
        <v-btn size="small" variant="flat" color="primary" class="flex-grow-1" :disabled="disabledNow" @click="ok">
          {{ box.mode === 1 ? $t("plugins.flexibleLayouts.messageBox.close") : $t("generic.ok") }}
        </v-btn>
        <v-btn v-if="hasCancel" size="small" variant="tonal" class="flex-grow-1" :disabled="disabledNow" @click="cancel">
          {{ $t("generic.cancel") }}
        </v-btn>
      </div>
    </template>

    <div v-else class="text-medium-emphasis text-caption text-center">
      <v-icon size="small" class="mb-1">mdi-message-outline</v-icon>
      <div>{{ $t("plugins.flexibleLayouts.messageBox.idle") }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

defineProps<{ widget: Extract<Widget, { type: "messageBox" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => uiStore.uiFrozen);

interface Box { mode: number; title: string; message: string; cancelButton?: boolean; choices?: Array<string> | null; default?: number | string | null; seq?: number }
const box = computed<Box | null>(() => {
  const mb = resolveOmPath(machineStore.model, "state.messageBox");
  return mb && typeof mb === "object" ? (mb as Box) : null;
});
// Modes: 4 = multipleChoice, 5 = intInput, 6 = floatInput, 7 = stringInput.
const isInput = computed(() => !!box.value && box.value.mode >= 5);
const hasCancel = computed(() => !!box.value && (box.value.mode === 3 || box.value.cancelButton === true));

const input = ref<string>("");
watch(box, (b) => { input.value = b && b.default != null ? String(b.default) : ""; });

function send(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "M292 failed", (e as Error)?.message ?? String(e)));
}
function ok(): void {
  if (!box.value) return;
  if (box.value.mode === 7) send(`M292 S"${input.value.replace(/"/g, '""')}"`);
  else if (isInput.value) send(`M292 R${Number(input.value) || 0}`);
  else send("M292");
}
function cancel(): void { send("M292 P1"); }
function choose(i: number): void { send(`M292 R${i}`); }
</script>

<style scoped>
.mb-root { min-height: 0; overflow-y: auto; }
.mb-frozen { opacity: 0.5; pointer-events: none; }
.mb-title { font-size: 0.85em; font-weight: 700; }
.mb-msg { font-size: 0.82em; white-space: pre-wrap; }
</style>
