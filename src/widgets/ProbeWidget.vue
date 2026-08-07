<template>
  <div class="prb-root fill-height d-flex flex-column px-2 py-1" :class="{ 'prb-frozen': disabledNow }">
    <span v-if="widget.label" class="prb-label text-truncate flex-shrink-0">{{ widget.label }}</span>
    <UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

    <div class="d-flex align-center ga-2 mb-1 flex-shrink-0">
      <v-text-field v-model.number="dia" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined"
                    hide-details class="prb-dia" :label="$t('plugins.flexibleLayouts.probe.diameter')" :disabled="disabledNow"
                    @change="patch?.({ diameter: dia })" />
      <v-select v-if="needsCorner" v-model="corner" :items="cornerItems" density="compact" variant="outlined"
                hide-details class="prb-corner" :label="$t('plugins.flexibleLayouts.probe.corner')" :disabled="disabledNow"
                @update:model-value="patch?.({ corner })" />
    </div>

    <div class="prb-ops flex-grow-1">
      <v-btn v-for="op in ops" :key="op.id" size="small" variant="tonal" :color="widget.color || 'primary'"
             class="prb-btn" :disabled="disabledNow" :prepend-icon="op.icon" @click="trigger(op.id)">
        {{ op.label }}
      </v-btn>
    </div>

    <v-dialog v-model="confirmOpen" max-width="420">
      <v-card>
        <v-card-title>{{ $t("plugins.flexibleLayouts.probe.confirmTitle") }}</v-card-title>
        <v-card-text>
          <div class="mb-2">{{ $t("plugins.flexibleLayouts.probe.confirmText") }}</div>
          <UnhomedWarning :axes="unhomedNow" class="mb-2" />
          <pre class="prb-pre">{{ pendingCmd }}</pre>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
          <v-btn color="warning" @click="runPending">{{ $t("plugins.flexibleLayouts.probe.run") }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { buildProbeCommand, DEFAULT_PROBE_COMMANDS, type ProbeOp } from "../util/probe";
import { unhomedAxes } from "../util/homedCheck";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "probe" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const patch = inject(WIDGET_PATCH_KEY, null);

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));
const dia = ref<number>(props.widget.diameter ?? 6);
const corner = ref<string>(props.widget.corner ?? "FL");
const cornerItems = [
  { title: i18n.global.t("plugins.flexibleLayouts.probe.fl"), value: "FL" },
  { title: i18n.global.t("plugins.flexibleLayouts.probe.fr"), value: "FR" },
  { title: i18n.global.t("plugins.flexibleLayouts.probe.bl"), value: "BL" },
  { title: i18n.global.t("plugins.flexibleLayouts.probe.br"), value: "BR" },
];

const t = (k: string): string => i18n.global.t(`plugins.flexibleLayouts.probe.${k}`);
const OP_META: Record<ProbeOp, { icon: string; label: string }> = {
  z: { icon: "mdi-arrow-down-bold", label: t("opZ") },
  x: { icon: "mdi-arrow-left-right-bold", label: t("opX") },
  y: { icon: "mdi-arrow-up-down-bold", label: t("opY") },
  corner: { icon: "mdi-vector-square", label: t("opCorner") },
  centre: { icon: "mdi-image-filter-center-focus", label: t("opCentre") },
};
const enabledOps = computed<Array<ProbeOp>>(() => props.widget.ops?.length ? props.widget.ops : ["z", "x", "y", "corner"]);
const ops = computed(() => enabledOps.value.map((id) => ({ id, ...OP_META[id] })));
const needsCorner = computed(() => enabledOps.value.includes("corner") || enabledOps.value.includes("centre"));

function templateFor(op: ProbeOp): string {
  const w = props.widget;
  const map: Record<ProbeOp, string | undefined> = { z: w.zCmd, x: w.xCmd, y: w.yCmd, corner: w.cornerCmd, centre: w.centreCmd };
  return map[op] || DEFAULT_PROBE_COMMANDS[op];
}

const confirmOpen = ref(false);
const pendingCmd = ref("");

function trigger(op: ProbeOp): void {
  if (disabledNow.value) { return; }
  pendingCmd.value = buildProbeCommand(templateFor(op), { dia: dia.value || 0, corner: corner.value });
  if (props.widget.confirm === false) {
    runPending();
  } else {
    confirmOpen.value = true;
  }
}

function runPending(): void {
  confirmOpen.value = false;
  const code = pendingCmd.value;
  if (!code) { return; }
  void machineStore.sendCode(code, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Probe command failed", (e as Error)?.message ?? String(e)));
}
</script>

<style scoped>
.prb-root { min-height: 0; }
.prb-frozen { opacity: 0.5; pointer-events: none; }
.prb-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.prb-dia { max-width: 110px; }
.prb-corner { max-width: 130px; }
.prb-ops { min-height: 0; overflow-y: auto; display: flex; flex-wrap: wrap; gap: 4px; align-content: flex-start; }
.prb-btn { flex: 1 1 45%; min-width: 0; }
.prb-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; }
</style>
