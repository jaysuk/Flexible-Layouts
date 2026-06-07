<template>
  <div class="np-root fill-height d-flex flex-column pa-1" :class="{ 'np-frozen': disabledNow }">
    <div v-if="widget.title" class="np-title text-truncate flex-shrink-0">{{ widget.title }}</div>

    <div v-if="!activeStrip" class="text-medium-emphasis text-caption pa-2">
      {{ $t("plugins.flexibleLayouts.neopixel.none") }}
    </div>

    <template v-else>
      <!-- Strip selector (optional) + count + Off -->
      <div class="d-flex align-center ga-1 mb-1 flex-shrink-0">
        <v-select v-if="widget.stripMode === 'choose' && strips.length > 1" v-model="chosenIndex"
                  :items="stripItems" density="compact" variant="outlined" hide-details
                  class="np-strip" />
        <span v-else class="text-caption text-medium-emphasis text-truncate flex-grow-1">{{ stripLabel(activeStrip.strip) }}</span>
        <v-text-field v-if="widget.showCount !== false" v-model.number="ledCount" type="number" :min="1"
                      density="compact" variant="outlined" hide-details class="np-count"
                      :label="$t('plugins.flexibleLayouts.neopixel.count')" />
        <v-btn size="small" variant="tonal" color="error" icon="mdi-power" :disabled="disabledNow"
               :title="$t('plugins.flexibleLayouts.neopixel.off')" @click="turnOff" />
      </div>

      <!-- Colour picker -->
      <div class="d-flex justify-center flex-shrink-0">
        <v-color-picker v-model="pickerHex" :modes="['rgb']" hide-inputs :width="pickerWidth"
                        class="np-picker" />
      </div>

      <!-- White channel (RGBW only) -->
      <div v-if="isRGBW" class="d-flex align-center ga-2 mt-1 flex-shrink-0">
        <span class="text-caption" style="width:1.2em">W</span>
        <v-slider v-model="wValue" :min="0" :max="255" :step="1" density="compact" hide-details thumb-size="12" />
        <span class="text-caption np-num">{{ wValue }}</span>
      </div>

      <!-- Brightness -->
      <div class="d-flex align-center ga-2 mt-1 flex-shrink-0">
        <v-icon size="small">mdi-brightness-6</v-icon>
        <v-slider v-model="brightness" :min="0" :max="255" :step="1" density="compact" hide-details thumb-size="12" />
        <span class="text-caption np-num">{{ brightness }}</span>
      </div>

      <!-- Target + per-LED pips -->
      <div v-if="widget.showPerLed !== false" class="np-pips-wrap mt-1">
        <v-chip size="x-small" :variant="target === 'all' ? 'flat' : 'tonal'"
                :color="target === 'all' ? (widget.color || 'primary') : undefined"
                class="mb-1" @click="target = 'all'">{{ $t("plugins.flexibleLayouts.neopixel.all") }}</v-chip>
        <div class="np-pips">
          <button v-for="(c, i) in colors" :key="i" type="button" class="np-pip"
                  :class="{ 'np-pip--sel': target === i }" :style="{ background: pipColor(c) }"
                  :title="`LED ${i}`" @click="target = i" />
        </div>
      </div>

      <v-btn class="mt-1 flex-shrink-0" size="small" variant="flat" :color="widget.color || 'primary'"
             :disabled="disabledNow" block @click="apply">
        {{ $t("plugins.flexibleLayouts.neopixel.apply") }}
      </v-btn>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

interface LedColor { r: number; g: number; b: number; w: number }
interface Strip { type?: string; pin?: string; board?: number; stopMovement?: boolean }

const props = defineProps<{ widget: Extract<Widget, { type: "neopixel" }>; disabled?: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const pickerWidth = 220;

// --- strips ------------------------------------------------------------------------
const strips = computed<Array<{ strip: Strip; eIndex: number }>>(() => {
  const arr = (machineStore.model as unknown as { ledStrips?: Array<Strip | null> }).ledStrips;
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => (s ? { strip: s, eIndex: i } : null)).filter((x): x is { strip: Strip; eIndex: number } => x !== null);
});
const chosenIndex = ref<number | null>(null);
const stripItems = computed(() => strips.value.map((s) => ({ title: `${s.eIndex}: ${stripLabel(s.strip)}`, value: s.eIndex })));
const activeStrip = computed(() => {
  const list = strips.value;
  if (!list.length) return null;
  if (props.widget.stripMode === "fixed") return list.find((x) => x.eIndex === props.widget.stripIndex) ?? list[0];
  if (props.widget.stripMode === "choose" && chosenIndex.value !== null) return list.find((x) => x.eIndex === chosenIndex.value) ?? list[0];
  return list[0];
});
const isRGBW = computed(() => activeStrip.value?.strip.type === "NeoPixel_RGBW");

function stripLabel(s: Strip): string {
  const names: Record<string, string> = { NeoPixel_RGB: "NeoPixel RGB", NeoPixel_RGBW: "NeoPixel RGBW", DotStar: "DotStar" };
  return (s.type && names[s.type]) || s.type || "LED strip";
}

// --- LED state ---------------------------------------------------------------------
const ledCount = computed({
  get: () => props.widget.ledCount ?? 30,
  set: (v: number) => { props.widget.ledCount = Math.max(1, Math.round(Number(v) || 1)); },
});
const colors = ref<Array<LedColor>>([]);
function syncLen(): void {
  const n = ledCount.value;
  const cur = colors.value;
  if (cur.length === n) return;
  if (cur.length < n) {
    while (cur.length < n) cur.push({ r: 255, g: 255, b: 255, w: 0 });
  } else {
    cur.splice(n);
  }
  if (typeof target.value === "number" && target.value >= n) target.value = "all";
}
watch(ledCount, syncLen, { immediate: true });

const brightness = ref(255);
const target = ref<"all" | number>("all");

// --- colour helpers ----------------------------------------------------------------
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(hex || "");
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}
function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function targetColors(): Array<LedColor> {
  return target.value === "all" ? colors.value : [colors.value[target.value]].filter(Boolean);
}

const pickerHex = computed({
  get: () => {
    const c = target.value === "all" ? colors.value[0] : colors.value[target.value];
    return c ? rgbToHex(c.r, c.g, c.b) : "#ffffff";
  },
  set: (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    for (const c of targetColors()) { c.r = r; c.g = g; c.b = b; }
  },
});
const wValue = computed({
  get: () => (target.value === "all" ? colors.value[0]?.w : colors.value[target.value]?.w) ?? 0,
  set: (v: number) => { for (const c of targetColors()) c.w = Number(v) || 0; },
});

// Preview a pip at the current master brightness (white channel folded in).
function pipColor(c: LedColor): string {
  const f = brightness.value / 255;
  const w = isRGBW.value ? c.w : 0;
  return rgbToHex((c.r + w) * f, (c.g + w) * f, (c.b + w) * f);
}

// --- send (RRF M150) ---------------------------------------------------------------
function scaleCh(v: number): number { return Math.round((v * brightness.value) / 255); }
function line(e: number, c: LedColor): string {
  let s = `M150 E${e} R${scaleCh(c.r)} U${scaleCh(c.g)} B${scaleCh(c.b)}`;
  if (isRGBW.value) s += ` W${scaleCh(c.w)}`;
  return s;
}
function send(code: string): void {
  if (disabledNow.value) return;
  void machineStore.sendCode(code).catch((e: unknown) => uiStore.makeNotification(LogLevel.error, "M150 failed", (e as Error)?.message ?? String(e)));
}
function uniform(): boolean {
  const a = colors.value[0];
  return !!a && colors.value.every((c) => c.r === a.r && c.g === a.g && c.b === a.b && c.w === a.w);
}
function apply(): void {
  const strip = activeStrip.value;
  if (!strip || !colors.value.length) return;
  const e = strip.eIndex;
  const n = ledCount.value;
  if (props.widget.showPerLed === false || uniform()) {
    send(`${line(e, colors.value[0])} S${n} F0`);
  } else {
    const lines = colors.value.map((c, i) => `${line(e, c)} S1 ${i < n - 1 ? "F1" : "F0"}`);
    send(lines.join("\n"));
  }
}
function turnOff(): void {
  const strip = activeStrip.value;
  if (!strip) return;
  let cmd = `M150 E${strip.eIndex} R0 U0 B0`;
  if (isRGBW.value) cmd += " W0";
  send(`${cmd} S${ledCount.value} F0`);
  for (const c of colors.value) { c.r = 0; c.g = 0; c.b = 0; c.w = 0; }
}
</script>

<style scoped>
.np-root { min-height: 0; }
.np-title { font-size: 0.8rem; font-weight: 600; line-height: 1.4; opacity: 0.85; }
.np-frozen { opacity: 0.5; pointer-events: none; }
.np-strip { max-width: 9rem; }
.np-count :deep(input) { text-align: center; }
.np-count { max-width: 4.5rem; }
.np-num { width: 2.2em; text-align: right; font-variant-numeric: tabular-nums; }
.np-picker { box-shadow: none; background: transparent; max-width: 100%; }
.np-pips-wrap { min-height: 0; overflow-y: auto; }
.np-pips { display: flex; flex-wrap: wrap; gap: 3px; }
.np-pip {
  width: 16px; height: 16px; border-radius: 3px; cursor: pointer; flex: 0 0 auto;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.25);
}
.np-pip--sel { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 1px; }
</style>
