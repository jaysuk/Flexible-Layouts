<template>
  <div class="hs-root fill-height" :class="{ 'hs-frozen': disabledNow }">
    <div v-if="!widget.url" class="text-medium-emphasis text-caption pa-2">
      {{ $t("plugins.flexibleLayouts.hotspot.unset") }}
    </div>
    <div v-else ref="stageRef" class="hs-stage">
      <img ref="imgRef" :src="widget.url" class="hs-img" @load="measure" />
      <template v-for="(r, i) in regions" :key="i">
        <!-- Non-rect shape: an inline SVG path fills the region's box, click-through outside the
             shape itself (pointer-events live on the <path>, not the <svg>) - same convention as
             CommandButtonWidget's shaped buttons. Rect (shape unset) keeps the plain <button>. -->
        <svg v-if="isShaped(r)" class="hs-region-svg" :class="{ 'hs-region-svg--edit': editMode }"
             :style="regionStyle(r)" viewBox="0 0 100 100" :preserveAspectRatio="shapeAspect(r)">
          <title>{{ r.label || r.command }}</title>
          <path :d="regionPathD(r)" class="hs-region-path" @click="fire(r)" />
        </svg>
        <button v-else type="button" class="hs-region"
                :class="{ 'hs-region--edit': editMode }" :disabled="disabledNow"
                :style="regionStyle(r)"
                :title="r.label || r.command" @click="fire(r)">
          <span v-if="editMode && r.label" class="hs-tag">{{ r.label }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { editMode } from "../model/editorState";
import { buttonShapeToParams, shapePath, shapePreservesAspect } from "../util/shapes";

type HotspotRegion = NonNullable<Extract<Widget, { type: "hotspot" }>["regions"]>[number];

const props = defineProps<{ widget: Extract<Widget, { type: "hotspot" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const regions = computed(() => props.widget.regions ?? []);

function fire(r: { command?: string }): void {
  if (disabledNow.value || !r.command) return;
  void machineStore.sendCode(r.command, false, false).catch((e: unknown) =>
    uiStore.makeNotification(LogLevel.error, "Command failed", (e as Error)?.message ?? String(e)));
}

// --- Non-rectangular regions --------------------------------------------------------------------
// `shape` unset (or kind === "rect") keeps today's plain rectangular <button> region unchanged.

function isShaped(r: HotspotRegion): boolean {
  return !!r.shape && r.shape.kind !== "rect";
}
function regionPathD(r: HotspotRegion): string {
  return r.shape ? shapePath(buttonShapeToParams(r.shape), { w: 100, h: 100 }) : "";
}
function shapeAspect(r: HotspotRegion): string {
  return r.shape && shapePreservesAspect(r.shape.kind) ? "xMidYMid meet" : "none";
}

// --- Region positioning -----------------------------------------------------------------------
//
// Regions are authored as percentages of the DRAWING, but `.hs-img` only ever gets max-width/
// max-height (no object-fit, no explicit width/height), so its rendered box is letterboxed within
// `.hs-stage` at whatever size preserves aspect ratio - it does not necessarily fill `.hs-stage`
// on both axes. Resolving region percentages as plain CSS percentages against `.hs-stage` itself
// put them outside the actual image on whichever axis isn't fully filled - measuring the image's
// own rendered rect and positioning regions in pixels against THAT is what keeps them aligned with
// what's actually on screen, on every axis, at every widget size.

const stageRef = ref<HTMLElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);
const imgRect = ref<{ left: number; top: number; width: number; height: number } | null>(null);

function measure(): void {
  const stage = stageRef.value;
  const img = imgRef.value;
  if (!stage || !img || !img.naturalWidth || !img.naturalHeight) {
    imgRect.value = null;
    return;
  }
  const stageBox = stage.getBoundingClientRect();
  const box = img.getBoundingClientRect();
  imgRect.value = { left: box.left - stageBox.left, top: box.top - stageBox.top, width: box.width, height: box.height };
}

function regionStyle(r: { x: number; y: number; w: number; h: number }): Record<string, string> {
  const box = imgRect.value;
  // Nothing measured yet - stay hidden rather than flash a region at the wrong spot.
  if (!box) return { display: "none" };
  return {
    left: `${box.left + (r.x / 100) * box.width}px`,
    top: `${box.top + (r.y / 100) * box.height}px`,
    width: `${(r.w / 100) * box.width}px`,
    height: `${(r.h / 100) * box.height}px`,
  };
}

let resizeObserver: ResizeObserver | null = null;
watch(stageRef, (el) => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!el) return;
  resizeObserver = new ResizeObserver(() => measure());
  resizeObserver.observe(el);
  measure();
}, { immediate: true });

// A cached image (already `complete` before this component mounts) never fires `load` again -
// measure once more right after the ref attaches in case that already happened.
watch(imgRef, (el) => { if (el?.complete) measure(); });

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
.hs-root { min-height: 0; overflow: hidden; display: flex; }
.hs-frozen { opacity: 0.5; pointer-events: none; }
/* flex:1 1 auto (in a flex .hs-root) gives .hs-stage a definite height so it can actually center
   the image - the old inline-block/max-height:100% pairing left .hs-stage with an auto height,
   which per CSS's percentage-height rule meant .hs-img's max-height:100% never resolved at all. */
.hs-stage { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; }
.hs-img { display: block; max-width: 100%; max-height: 100%; }
.hs-region { position: absolute; background: transparent; border: none; cursor: pointer; padding: 0; }
.hs-region--edit { border: 1px dashed rgba(var(--v-theme-primary), 0.8); background: rgba(var(--v-theme-primary), 0.12); }
.hs-tag { font-size: 0.65em; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); padding: 0 3px; border-radius: 2px; }
.hs-region-svg { position: absolute; overflow: visible; }
.hs-region-path { fill: transparent; pointer-events: fill; cursor: pointer; }
.hs-region-svg--edit .hs-region-path { fill: rgba(var(--v-theme-primary), 0.12); stroke: rgba(var(--v-theme-primary), 0.8); stroke-width: 2; }
</style>
