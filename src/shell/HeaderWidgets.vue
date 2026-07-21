<template>
	<div ref="canvasRef" class="fl-header-canvas">
		<div v-for="item in items" :key="item.i" class="fl-header-item" :class="{ 'is-editing': editMode }"
			 :style="itemStyle(item)" @pointerdown="onItemPointerDown($event, item)">
			<WidgetView :widget="item.widget" :disabled="!editMode && itemLocked(item)" />
			<!-- Physical overlay, not just `disabled`: several widget types (ProfileSwitchWidget,
				 MessageBoxWidget, ThemeToggleWidget, GroupWidget, PluginPageWidget, EmbeddableWidget,
				 WebWidget) never receive `disabled` from WidgetView at all, and one of them ignores it
				 even where it is passed - so this is the only mechanism guaranteed to actually block a
				 pinned header widget. -->
			<div v-if="!editMode && itemLocked(item)" class="flex-interaction-lock"
				 :title="accessLocked ? $t('plugins.flexibleLayouts.access.interactionLocked') : $t('plugins.flexibleLayouts.printLock.locked')">
				<v-icon size="x-small">mdi-lock</v-icon>
			</div>

			<div v-if="editMode" class="fl-header-item-tools" @pointerdown.stop>
				<v-btn icon="mdi-cog" size="x-small" variant="text" density="comfortable"
					   :title="$t('plugins.flexibleLayouts.editor.configureWidget')" @click="openProperties(item.i)" />
				<v-btn v-if="!isProtected(item)" icon="mdi-delete" size="x-small" variant="text" density="comfortable"
					   :title="$t('plugins.flexibleLayouts.editor.removeWidget')" @click="removeItem(item)" />
			</div>
			<div v-if="editMode" class="fl-header-resizer" @pointerdown.stop="onResizePointerDown($event, item)" />
		</div>

		<WidgetPalette v-model="paletteOpen" @add="onAddWidget" @add-item="onAddItem" />
		<PropertiesDialog v-model="propertiesOpen" :item="editingItem" @save="onSaveProperties" />
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

import {
	type ConditionRule,
	type GridItemModel,
	type PanelColors,
	type Typography,
	type Widget,
	newItemId,
} from "../model/document";
import { useLayoutStore } from "../model/store";
import { useMachineStore } from "@/stores/machine";
import { editMode } from "../model/editorState";
import { accessLockedFor, can } from "../model/access";
import { effectiveLockForItem, isPrintingStatus } from "../util/printLock";
import WidgetView from "../widgets/WidgetView.vue";
import WidgetPalette from "../editor/WidgetPalette.vue";
import PropertiesDialog from "../editor/PropertiesDialog.vue";

const props = defineProps<{ hideTypes?: Array<Widget["type"]> }>();

const store = useLayoutStore();
const machineStore = useMachineStore();

function headerItems(): Array<GridItemModel> {
	const doc = store.document.value;
	if (!doc.header) {
		doc.header = { items: [] };
	}
	return doc.header.items;
}

// hideTypes only filters what's rendered here - drag/resize/remove all look items up by id from the
// full headerItems() list, so a hidden type (e.g. the mobile-only editModeToggle exclusion in
// FlexShell) stays fully intact in the document, just not drawn or interactable from this instance.
const items = computed(() => headerItems().filter((item) => !(props.hideTypes ?? []).includes(item.widget.type)));

// Lock a header widget while printing (same policy as grid items: explicit choice, else type default)
// or while access-restricted (Observer, or Operator without `interact`).
const isPrinting = computed(() => isPrintingStatus((machineStore.model as { state?: { status?: string } }).state?.status));
const accessLocked = computed(() => !can("interact"));
function itemLocked(item: GridItemModel): boolean {
	return accessLockedFor(item.widget) || (isPrinting.value && effectiveLockForItem(item.widget, item.lockWhilePrinting));
}

// Widget types that can never be deleted from the header: removing the edit-mode button would be an
// unrecoverable dead end for anyone who doesn't already know about the Settings-tab fallback, so it
// isn't offered as an option at all here rather than relying on people finding that fallback.
const PROTECTED_TYPES = new Set<Widget["type"]>(["editModeToggle"]);
function isProtected(item: GridItemModel): boolean {
	return PROTECTED_TYPES.has(item.widget.type);
}

// Items are laid out by x/w percentages of the bar only - y/h are ignored so every item always fills
// the bar's full height. That's a deliberate, narrower interaction than the free 2D canvas used
// elsewhere (groups): the top bar is one row, so only horizontal position and width are editable.
function itemStyle(item: GridItemModel): Record<string, string> {
	return {
		position: "absolute",
		left: `${item.x}%`,
		top: "0",
		width: `${item.w}%`,
		height: "100%",
		boxSizing: "border-box",
	};
}

const canvasRef = ref<HTMLElement | null>(null);
function canvasWidth(): number {
	return canvasRef.value?.clientWidth || 1;
}

// ── Drag to reposition (x only) ───────────────────────────────────────────────
// Movement only turns into a drag past a small threshold, and pointer capture is deferred until
// then - otherwise every plain click on a widget's own controls (e.g. the edit-mode Done button
// pinned in the header) would be hijacked into a zero-distance "drag" and never reach the button.
const DRAG_THRESHOLD_PX = 4;
interface DragState { id: string; pointerId: number; target: HTMLElement; startX: number; origX: number; dragging: boolean }
let dragState: DragState | null = null;

function onItemPointerDown(e: PointerEvent, item: GridItemModel): void {
	if (!editMode.value) {
		return;
	}
	dragState = {
		id: item.i,
		pointerId: e.pointerId,
		target: e.currentTarget as HTMLElement,
		startX: e.clientX,
		origX: item.x,
		dragging: false,
	};
	window.addEventListener("pointermove", onDragMove);
	window.addEventListener("pointerup", onDragUp, { once: true });
	// A cancelled gesture (the item unmounts mid-drag, a browser/OS gesture interrupts pointer
	// tracking, etc.) never fires "pointerup" - without this, onDragMove's window listener leaks
	// permanently and keeps mutating stale state on every future mouse movement on the page.
	window.addEventListener("pointercancel", onDragUp, { once: true });
}
function onDragMove(e: PointerEvent): void {
	if (!dragState) {
		return;
	}
	if (!dragState.dragging) {
		if (Math.abs(e.clientX - dragState.startX) < DRAG_THRESHOLD_PX) {
			return;
		}
		dragState.dragging = true;
		dragState.target.setPointerCapture(dragState.pointerId);
	}
	const it = headerItems().find((i) => i.i === dragState!.id);
	if (!it) {
		return;
	}
	const dx = ((e.clientX - dragState.startX) / canvasWidth()) * 100;
	it.x = Math.max(0, Math.min(100 - it.w, dragState.origX + dx));
}
function onDragUp(): void {
	dragState = null;
	window.removeEventListener("pointermove", onDragMove);
}

// ── Resize the right edge only (width, never height) ─────────────────────────
interface ResizeState { id: string; startX: number; origW: number }
let resizeState: ResizeState | null = null;

function onResizePointerDown(e: PointerEvent, item: GridItemModel): void {
	if (!editMode.value) {
		return;
	}
	(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	resizeState = { id: item.i, startX: e.clientX, origW: item.w };
	window.addEventListener("pointermove", onResizeMove);
	window.addEventListener("pointerup", onResizeUp, { once: true });
	window.addEventListener("pointercancel", onResizeUp, { once: true });
}
function onResizeMove(e: PointerEvent): void {
	if (!resizeState) {
		return;
	}
	const it = headerItems().find((i) => i.i === resizeState!.id);
	if (!it) {
		return;
	}
	const dw = ((e.clientX - resizeState.startX) / canvasWidth()) * 100;
	it.w = Math.max(4, Math.min(100 - it.x, resizeState.origW + dw));
}
function onResizeUp(): void {
	resizeState = null;
	window.removeEventListener("pointermove", onResizeMove);
}
onBeforeUnmount(() => {
	onDragUp();
	onResizeUp();
});

// ── Add / remove / configure ──────────────────────────────────────────────────
const paletteOpen = ref(false);

function placeNew(): { x: number; y: number; w: number; h: number } {
	const w = 20;
	const x = Math.min(100 - w, (headerItems().length * 12) % 80);
	return { x, y: 0, w, h: 100 };
}
function onAddWidget(payload: { widget: Widget; size?: { w: number; h: number }; configure: boolean }): void {
	const item: GridItemModel = { i: newItemId(), ...placeNew(), widget: payload.widget };
	headerItems().push(item);
	if (payload.configure) {
		openProperties(item.i);
	}
}
function onAddItem(item: GridItemModel): void {
	headerItems().push({ ...item, ...placeNew() });
}

function removeItem(item: GridItemModel): void {
	if (isProtected(item)) {
		return;
	}
	const list = headerItems();
	const idx = list.findIndex((it) => it.i === item.i);
	if (idx >= 0) {
		list.splice(idx, 1);
	}
}

const propertiesOpen = ref(false);
const editingId = ref<string | null>(null);
const editingItem = ref<GridItemModel | null>(null);
function openProperties(id: string): void {
	const item = headerItems().find((it) => it.i === id);
	if (!item) {
		return;
	}
	editingId.value = id;
	editingItem.value = item;
	propertiesOpen.value = true;
}
function onSaveProperties(payload: { widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; lockWhilePrinting: boolean | undefined; panelChrome: boolean | undefined }): void {
	const list = headerItems();
	const idx = list.findIndex((it) => it.i === editingId.value);
	if (idx < 0) {
		return;
	}
	list[idx] = {
		...list[idx],
		widget: payload.widget,
		conditions: payload.conditions,
		colors: payload.colors,
		typography: payload.typography,
		fit: payload.fit,
		lockWhilePrinting: payload.lockWhilePrinting,
		// Header-pinned widgets never render panel chrome (the top bar is too slim for a title bar),
		// but the field is stored anyway in case an item is later promoted to the page grid.
		panelChrome: payload.panelChrome,
	};
}

// The "+ add widget" trigger lives in FlexShell's app bar (a normal flex sibling with guaranteed
// space) rather than floating over/outside this canvas, since items can occupy the full 0-100%
// width and there's no space that's reliably free for it to sit in on its own.
defineExpose({ openPalette: () => { paletteOpen.value = true; } });
</script>

<style scoped>
/* Fills the remaining app-bar width/height (its parent sizes it via flex), and is the percentage
   reference frame for every pinned item's x/w. No overflow/scroll: drag and resize both clamp to
   0-100%, so nothing can ever spill outside this box or force a scrollbar. */
.fl-header-canvas {
	position: relative;
	flex: 1 1 auto;
	min-width: 0;
	height: 52px;
	font-size: 12px;
}
.fl-header-item {
	overflow: hidden;
}
.fl-header-item.is-editing {
	outline: 1px dashed rgba(var(--v-theme-primary), 0.5);
	cursor: move;
}
.fl-header-item-tools {
	position: absolute;
	top: -2px;
	right: -2px;
	z-index: 3;
	display: flex;
	align-items: center;
	background: rgba(var(--v-theme-surface), 0.85);
	border-radius: 4px;
}
.fl-header-resizer {
	position: absolute;
	top: 0;
	right: 0;
	width: 6px;
	height: 100%;
	cursor: ew-resize;
	z-index: 2;
}
.fl-header-resizer:hover {
	background: rgba(var(--v-theme-primary), 0.4);
}
.flex-interaction-lock {
	position: absolute;
	inset: 0;
	z-index: 3;
	cursor: not-allowed;
	display: flex;
	align-items: flex-start;
	justify-content: flex-end;
	padding: 3px;
	background: rgba(var(--v-theme-surface), 0.04);
}
.flex-interaction-lock .v-icon {
	opacity: 0.45;
}

/* Same as the grid: let form controls grow with the font instead of clipping a large value. */
.fl-header-item :deep(.v-input) {
	--v-input-control-height: 2.6em;
}
.fl-header-item :deep(.v-field__input) {
	min-height: 2.6em;
	line-height: 1.5;
	padding-top: 0.4em;
	padding-bottom: 0.3em;
}
.fl-header-item :deep(.v-field__input input),
.fl-header-item :deep(.v-field__input textarea),
.fl-header-item :deep(.v-field__input .v-select__selection) {
	line-height: 1.5;
}
</style>
