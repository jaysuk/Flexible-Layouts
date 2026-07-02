<template>
	<div class="d-flex align-center ga-1 flex-header-widgets">
		<div v-for="(item, i) in items" :key="item.i" class="header-item"
			 :class="{ editing: editMode, dragging: dragIndex === i, 'pushed-right': i === firstEndIndex }"
			 :style="itemStyle(item)"
			 :draggable="editMode"
			 @dragstart="onDragStart(i, $event)" @dragover.prevent="onDragOver(i)" @dragend="onDragEnd" @drop="onDrop">
			<div v-if="editMode" class="header-item-tools">
				<v-icon class="drag-grip" size="x-small">mdi-drag-vertical</v-icon>
				<v-btn :icon="item.headerAlign === 'end' ? 'mdi-format-horizontal-align-right' : 'mdi-format-horizontal-align-left'"
					   size="x-small" variant="text" density="comfortable"
					   :title="item.headerAlign === 'end' ? $t('plugins.flexibleLayouts.editor.headerAlignLeft') : $t('plugins.flexibleLayouts.editor.headerAlignRight')"
					   @click="toggleAlign(i)" />
				<v-btn icon="mdi-cog" size="x-small" variant="text" density="comfortable" @click="edit(i)" />
				<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable" @click="remove(i)" />
			</div>
			<div class="header-item-body" :style="bodyStyle(item)">
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
			</div>
			<!-- right-edge handle to set this widget's width within the bar -->
			<div v-if="editMode" class="header-resizer" @mousedown.stop.prevent="startResize(i, $event)" />
		</div>

		<v-btn v-if="editMode" icon="mdi-plus" size="x-small" variant="tonal" class="ms-1"
			   :title="$t('plugins.flexibleLayouts.editor.addWidget')" @click="paletteOpen = true" />

		<WidgetPalette v-model="paletteOpen" @add="onAdd" />
		<PropertiesDialog v-model="propsOpen" :item="editingItem" @save="onSave" />
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

const store = useLayoutStore();
const machineStore = useMachineStore();

// Lock a header widget while printing (same policy as grid items: explicit choice, else type default)
// or while access-restricted (Observer, or Operator without `interact`).
const isPrinting = computed(() => isPrintingStatus((machineStore.model as { state?: { status?: string } }).state?.status));
const accessLocked = computed(() => !can("interact"));
function itemLocked(item: GridItemModel): boolean {
	return accessLockedFor(item.widget) || (isPrinting.value && effectiveLockForItem(item.widget, item.lockWhilePrinting));
}

const DEFAULT_WIDTH = 110;
const MIN_WIDTH = 48;
const MAX_WIDTH = 400;

function headerItems(): Array<GridItemModel> {
	const doc = store.document.value;
	if (!doc.header) {
		doc.header = { items: [] };
	}
	return doc.header.items;
}

const items = computed(() => headerItems());

// The first right-aligned item (in array order) gets `margin-left:auto`, pushing it and everything
// after it to the right edge — a left group and a right group from a single flat array.
const firstEndIndex = computed(() => items.value.findIndex((it) => it.headerAlign === "end"));

// Flip an item between the left (start) and right (end) groups, moving it within the array so the two
// groups stay contiguous (start items first, then end items) and the push-right stays clean.
function toggleAlign(i: number) {
	const list = headerItems();
	const [item] = list.splice(i, 1);
	if (item.headerAlign === "end") {
		item.headerAlign = undefined;
		const firstEnd = list.findIndex((it) => it.headerAlign === "end");
		list.splice(firstEnd === -1 ? list.length : firstEnd, 0, item);
	} else {
		item.headerAlign = "end";
		list.push(item);
	}
}

const paletteOpen = ref(false);
const propsOpen = ref(false);
const editingIndex = ref(-1);
const editingItem = ref<GridItemModel | null>(null);

// Per-item width + typography (so font edits actually take effect in the bar, which the old fixed
// strip ignored).
function itemStyle(item: GridItemModel) {
	return { width: `${Math.round(item.headerWidth ?? DEFAULT_WIDTH)}px` };
}
function bodyStyle(item: GridItemModel) {
	const t = item.typography;
	const s: Record<string, string> = {};
	if (t?.fontSize) s.fontSize = `${t.fontSize}px`;
	if (t?.fontFamily) s.fontFamily = t.fontFamily;
	return s;
}

// --- drag to reorder ---------------------------------------------------------------
const dragIndex = ref(-1);
function onDragStart(i: number, ev: DragEvent) {
	if (!editMode.value) {
		return;
	}
	dragIndex.value = i;
	ev.dataTransfer?.setData("text/plain", String(i));
	if (ev.dataTransfer) {
		ev.dataTransfer.effectAllowed = "move";
	}
}
function onDragOver(i: number) {
	const from = dragIndex.value;
	if (from < 0 || from === i) {
		return;
	}
	const list = headerItems();
	const [moved] = list.splice(from, 1);
	list.splice(i, 0, moved);
	dragIndex.value = i;
}
function onDrop() { dragIndex.value = -1; }
function onDragEnd() { dragIndex.value = -1; }

// --- drag the right edge to resize width -------------------------------------------
let resizeIndex = -1;
let resizeStartX = 0;
let resizeStartW = DEFAULT_WIDTH;
function startResize(i: number, ev: MouseEvent) {
	resizeIndex = i;
	resizeStartX = ev.clientX;
	resizeStartW = headerItems()[i].headerWidth ?? DEFAULT_WIDTH;
	window.addEventListener("mousemove", onResizeMove);
	window.addEventListener("mouseup", onResizeUp);
}
function onResizeMove(ev: MouseEvent) {
	if (resizeIndex < 0) {
		return;
	}
	const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartW + ev.clientX - resizeStartX));
	headerItems()[resizeIndex].headerWidth = Math.round(w);
}
function onResizeUp() {
	resizeIndex = -1;
	window.removeEventListener("mousemove", onResizeMove);
	window.removeEventListener("mouseup", onResizeUp);
}
onBeforeUnmount(onResizeUp);

function onAdd(payload: { widget: Widget; size?: { w: number; h: number }; configure: boolean }) {
	const item: GridItemModel = { i: newItemId(), x: 0, y: 0, w: 2, h: 1, widget: payload.widget, headerWidth: DEFAULT_WIDTH };
	headerItems().push(item);
	if (payload.configure) {
		editingIndex.value = headerItems().length - 1;
		editingItem.value = item;
		propsOpen.value = true;
	}
}

function edit(i: number) {
	editingIndex.value = i;
	editingItem.value = headerItems()[i];
	propsOpen.value = true;
}

function onSave(payload: { widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; lockWhilePrinting: boolean | undefined; geometry: { x: number; y: number; w: number; h: number } }) {
	const list = headerItems();
	if (editingIndex.value >= 0 && list[editingIndex.value]) {
		list[editingIndex.value] = {
			...list[editingIndex.value],
			widget: payload.widget,
			conditions: payload.conditions,
			colors: payload.colors,
			typography: payload.typography,
			fit: payload.fit,
			lockWhilePrinting: payload.lockWhilePrinting,
		};
	}
}

function remove(i: number) {
	headerItems().splice(i, 1);
}
</script>

<style scoped>
.flex-header-widgets {
	overflow-x: auto;
	max-width: 46vw;
	font-size: 12px;
}
/* The first right-aligned header item starts the right-hand group: the auto left margin eats the
   free space so it (and everything after it) sits against the right edge of the bar. */
.header-item.pushed-right {
	margin-left: auto;
}
.header-item {
	position: relative;
	height: 52px;
	min-width: 48px;
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	border-radius: 4px;
}
.header-item.editing {
	outline: 1px dashed rgba(var(--v-theme-primary), 0.5);
	cursor: grab;
}
.header-item.dragging {
	opacity: 0.5;
}
.header-item-body {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: hidden;
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
.header-item-tools {
	position: absolute;
	top: -2px;
	right: -2px;
	z-index: 3;
	display: flex;
	align-items: center;
	background: rgba(var(--v-theme-surface), 0.85);
	border-radius: 4px;
}
.drag-grip {
	cursor: grab;
	opacity: 0.6;
}
.header-resizer {
	position: absolute;
	top: 0;
	right: 0;
	width: 6px;
	height: 100%;
	cursor: ew-resize;
	z-index: 2;
}
.header-resizer:hover {
	background: rgba(var(--v-theme-primary), 0.4);
}

/* Same as the grid: let form controls grow with the font instead of clipping a large value. */
.header-item-body :deep(.v-input) {
	--v-input-control-height: 2.6em;
}
.header-item-body :deep(.v-field__input) {
	min-height: 2.6em;
	line-height: 1.5;
	padding-top: 0.4em;
	padding-bottom: 0.3em;
}
.header-item-body :deep(.v-field__input input),
.header-item-body :deep(.v-field__input textarea),
.header-item-body :deep(.v-field__input .v-select__selection) {
	line-height: 1.5;
}
</style>
