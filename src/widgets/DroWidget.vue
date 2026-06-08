<template>
  <div class="dro-root fill-height d-flex flex-column pa-1">
    <div class="d-flex align-center mb-1 flex-shrink-0">
      <span v-if="widget.title" class="dro-title text-truncate">{{ widget.title }}</span>
      <v-spacer />
      <v-btn-toggle v-model="coord" density="compact" variant="outlined" mandatory divided>
        <v-btn size="x-small" value="work">{{ $t("plugins.flexibleLayouts.dro.work") }}</v-btn>
        <v-btn size="x-small" value="machine">{{ $t("plugins.flexibleLayouts.dro.machine") }}</v-btn>
      </v-btn-toggle>
    </div>
    <div class="dro-body flex-grow-1">
      <div v-for="a in axes" :key="a.letter" class="dro-row">
        <v-icon size="x-small" :color="a.homed ? 'success' : 'warning'" :title="a.homed ? 'homed' : 'not homed'">
          {{ a.homed ? "mdi-circle" : "mdi-circle-outline" }}
        </v-icon>
        <span class="dro-letter">{{ a.letter }}</span>
        <span class="dro-pos">{{ a.pos }}</span>
      </div>
      <div v-if="!axes.length" class="text-medium-emphasis text-caption">{{ $t("plugins.flexibleLayouts.dro.none") }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveOmPath } from "../util/omPath";

const props = defineProps<{ widget: Extract<Widget, { type: "dro" }>; disabled?: boolean }>();
const machineStore = useMachineStore();

const coord = ref<"work" | "machine">(props.widget.coord ?? "work");
const precision = computed(() => props.widget.precision ?? 2);

interface RawAxis { letter?: string; homed?: boolean; visible?: boolean; machinePosition?: number | null; userPosition?: number | null }

const axes = computed(() => {
  const arr = resolveOmPath(machineStore.model, "move.axes");
  if (!Array.isArray(arr)) return [] as Array<{ letter: string; homed: boolean; pos: string }>;
  const want = (props.widget.axes ?? []).map((l) => l.toUpperCase());
  return (arr as Array<RawAxis>)
    .filter((a) => a && (want.length ? want.includes((a.letter ?? "").toUpperCase()) : a.visible !== false))
    .map((a) => {
      const v = coord.value === "machine" ? a.machinePosition : a.userPosition;
      return { letter: a.letter ?? "?", homed: !!a.homed, pos: typeof v === "number" ? v.toFixed(precision.value) : "—" };
    });
});
</script>

<style scoped>
.dro-root { min-height: 0; }
.dro-title { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.dro-body { min-height: 0; overflow-y: auto; }
.dro-row { display: flex; align-items: baseline; gap: 6px; padding: 1px 2px; }
.dro-letter { font-weight: 700; width: 1.4em; }
.dro-pos { margin-left: auto; font-family: monospace; font-size: 1em; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
