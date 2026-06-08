<template>
  <div class="tt-root fill-height d-flex align-center px-2">
    <template v-if="widget.variant === 'button'">
      <v-btn variant="tonal" block class="text-none" :prepend-icon="dark ? 'mdi-weather-night' : 'mdi-weather-sunny'"
             @click="toggle">{{ widget.label || (dark ? $t('plugins.flexibleLayouts.themeToggle.dark') : $t('plugins.flexibleLayouts.themeToggle.light')) }}</v-btn>
    </template>
    <template v-else>
      <v-icon size="small" class="me-1">{{ dark ? "mdi-weather-night" : "mdi-weather-sunny" }}</v-icon>
      <span class="tt-label text-truncate">{{ widget.label }}</span>
      <v-spacer />
      <v-switch :model-value="dark" color="primary" density="compact" hide-details @update:model-value="set($event === true)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { useSettingsStore } from "@/stores/settings";

import type { Widget } from "../model/document";

defineProps<{ widget: Extract<Widget, { type: "themeToggle" }>; disabled?: boolean }>();

const settings = useSettingsStore();
const dark = computed(() => settings.darkTheme);

function set(on: boolean): void { settings.darkTheme = on; }
function toggle(): void { settings.darkTheme = !settings.darkTheme; }
</script>

<style scoped>
.tt-root { min-height: 0; }
.tt-label { font-size: 0.8rem; font-weight: 500; }
</style>
