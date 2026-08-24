<template>
	<div v-if="url" ref="stageRef" class="hre-stage">
		<img :src="url" class="hre-img" alt="" @dragstart.prevent />
		<div v-for="(r, i) in regions" :key="i" class="hre-region" :class="{ 'hre-region--selected': selected === i }"
			 :style="boxStyle(r)" @pointerdown="onMovePointerDown($event, i)">
			<div class="hre-handle" @pointerdown="onResizePointerDown($event, i)" />
		</div>
	</div>
	<div v-else class="hre-empty text-medium-emphasis text-caption pa-4 text-center">
		{{ $t("plugins.flexibleLayouts.hotspot.editorNeedsUrl") }}
	</div>
</template>

<script setup lang="ts">
import { ref } from "vue";

// A region as authored on the widget: x/y/w/h are percentages of the drawing, matching
// HotspotWidget.vue's own storage convention exactly (no separate editor-only coordinate space).
interface Region { x: number; y: number; w: number; h: number }

const props = defineProps<{ url?: string; regions: Array<Region> }>();

const stageRef = ref<HTMLElement | null>(null);
const selected = ref<number | null>(null);

function boxStyle(r: Region): Record<string, string> {
	return { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` };
}

// `.hre-stage` shrink-wraps the <img> exactly (width:100%, height:auto, no centering/letterboxing),
// so plain CSS percentages against it land in the same place a plain percentage style would in
// HotspotWidget.vue's own (letterboxed) stage - unlike that widget, nothing here needs pixel
// measurement against the image's own rendered rect.
function stagePx(): { w: number; h: number } {
	const el = stageRef.value;
	return { w: el?.clientWidth || 1, h: el?.clientHeight || 1 };
}

// --- Move (drag anywhere on the region body) ------------------------------------------------------
// Pointer-event pattern (pointerdown -> window pointermove/pointerup, delta as % of container)
// adapted from useFreeCanvas.ts's onItemPointerDown/onDragMove/onDragUp; regions are indexed by
// array position instead of a GridItemModel's `i` id, and there's no rotation/z-order here.
interface DragState { index: number; startX: number; startY: number; origX: number; origY: number }
let dragState: DragState | null = null;

function onMovePointerDown(e: PointerEvent, index: number): void {
	selected.value = index;
	(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	const r = props.regions[index];
	dragState = { index, startX: e.clientX, startY: e.clientY, origX: r.x, origY: r.y };
	window.addEventListener("pointermove", onMoveMove);
	window.addEventListener("pointerup", onMoveUp, { once: true });
	window.addEventListener("pointercancel", onMoveUp, { once: true });
}
function onMoveMove(e: PointerEvent): void {
	if (!dragState) { return; }
	const { w, h } = stagePx();
	const dx = ((e.clientX - dragState.startX) / w) * 100;
	const dy = ((e.clientY - dragState.startY) / h) * 100;
	const r = props.regions[dragState.index];
	if (!r) { return; }
	r.x = Math.max(0, Math.min(100 - r.w, dragState.origX + dx));
	r.y = Math.max(0, Math.min(100 - r.h, dragState.origY + dy));
}
function onMoveUp(): void {
	dragState = null;
	window.removeEventListener("pointermove", onMoveMove);
}

// --- Resize (bottom-right grip) -------------------------------------------------------------------
interface ResizeState { index: number; startX: number; startY: number; origW: number; origH: number }
let resizeState: ResizeState | null = null;

function onResizePointerDown(e: PointerEvent, index: number): void {
	e.stopPropagation();
	selected.value = index;
	(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	const r = props.regions[index];
	resizeState = { index, startX: e.clientX, startY: e.clientY, origW: r.w, origH: r.h };
	window.addEventListener("pointermove", onResizeMove);
	window.addEventListener("pointerup", onResizeUp, { once: true });
	window.addEventListener("pointercancel", onResizeUp, { once: true });
}
function onResizeMove(e: PointerEvent): void {
	if (!resizeState) { return; }
	const { w, h } = stagePx();
	const dw = ((e.clientX - resizeState.startX) / w) * 100;
	const dh = ((e.clientY - resizeState.startY) / h) * 100;
	const r = props.regions[resizeState.index];
	if (!r) { return; }
	r.w = Math.max(2, Math.min(100 - r.x, resizeState.origW + dw));
	r.h = Math.max(2, Math.min(100 - r.y, resizeState.origH + dh));
}
function onResizeUp(): void {
	resizeState = null;
	window.removeEventListener("pointermove", onResizeMove);
}
</script>

<style scoped>
.hre-stage { position: relative; display: inline-block; max-width: 100%; user-select: none; }
.hre-img { display: block; width: 100%; height: auto; max-width: 100%; border-radius: 4px; }
.hre-empty { border: 1px dashed rgba(var(--v-border-color), 0.4); border-radius: 4px; }
.hre-region {
	position: absolute;
	box-sizing: border-box;
	border: 1px dashed rgba(var(--v-theme-primary), 0.8);
	background: rgba(var(--v-theme-primary), 0.12);
	cursor: move;
	touch-action: none;
}
.hre-region--selected { border-style: solid; background: rgba(var(--v-theme-primary), 0.2); }
.hre-handle {
	position: absolute;
	right: -5px;
	bottom: -5px;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: rgb(var(--v-theme-primary));
	border: 1px solid rgb(var(--v-theme-surface));
	cursor: nwse-resize;
	touch-action: none;
}
</style>
