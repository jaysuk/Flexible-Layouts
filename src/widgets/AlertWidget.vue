<template>
  <div class="al-root fill-height d-flex align-center px-1">
    <!-- Errors and warnings interrupt a screen reader (role=alert); info and success are polite (role=status). -->
    <v-alert v-if="show" :type="widget.severity || 'warning'" :icon="widget.icon || undefined" :role="alertRole"
             density="compact" variant="tonal" class="al-box">
      {{ widget.message }}
    </v-alert>
    <div v-else-if="editMode" class="al-hint text-caption text-medium-emphasis">
      <v-icon size="x-small" class="me-1">mdi-eye-off-outline</v-icon>{{ $t("plugins.flexibleLayouts.alert.hidden") }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { evaluateRule } from "../util/conditions";
import { editMode } from "../model/editorState";
import { useCueOnRise } from "../composables/useCueOnRise";

const props = defineProps<{ widget: Extract<Widget, { type: "alert" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const alertRole = computed(() => (props.widget.severity === "info" || props.widget.severity === "success" ? "status" : "alert"));

const show = computed(() => {
  if (!props.widget.omPath) return false;
  return evaluateRule(machineStore.model, {
    omPath: props.widget.omPath,
    operator: props.widget.operator ?? "truthy",
    value: props.widget.value,
  });
});

// Sound the cue when the alert APPEARS (not on every page load while it is already up); never while editing.
useCueOnRise(
  () => (show.value && props.widget.sound ? [{ key: "alert", cue: props.widget.sound, repeatSeconds: props.widget.soundRepeat }] : []),
  () => !editMode.value,
);
</script>

<style scoped>
.al-root { min-height: 0; }
.al-box { width: 100%; }
.al-hint { width: 100%; text-align: center; }
</style>
