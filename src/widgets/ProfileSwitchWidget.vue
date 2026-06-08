<template>
  <div class="ps-root fill-height d-flex flex-column justify-center px-2">
    <span v-if="widget.label" class="ps-label text-truncate">{{ widget.label }}</span>
    <v-select v-if="widget.variant !== 'buttons'" :model-value="active" :items="items" density="compact"
              variant="outlined" hide-details @update:model-value="switchTo" />
    <div v-else class="d-flex flex-wrap ga-1 mt-1">
      <v-btn v-for="p in profiles" :key="p.id" size="small" :variant="p.id === active ? 'flat' : 'tonal'"
             :color="p.id === active ? 'primary' : undefined" class="text-none ps-btn" @click="switchTo(p.id)">{{ p.name }}</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";
import { getActiveProfileId, listProfiles } from "../model/store";
import { switchProfile } from "../model/profiles";

defineProps<{ widget: Extract<Widget, { type: "profileSwitch" }>; disabled?: boolean }>();

const profiles = computed(() => listProfiles());
const items = computed(() => profiles.value.map((p) => ({ title: p.name, value: p.id })));
const active = computed(() => getActiveProfileId());

function switchTo(id: string): void {
  if (id && id !== active.value) switchProfile(id);
}
</script>

<style scoped>
.ps-root { min-height: 0; }
.ps-label { font-size: 0.78em; opacity: 0.7; margin-bottom: 2px; }
.ps-btn { min-width: 0; }
</style>
