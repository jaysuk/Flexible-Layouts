<template>
	<GridLayout v-model:layout="layoutModel" class="flex-grid" :style="{ height: liveHeight + 'px' }"
				:col-num="cols" :row-height="rowHeight" :margin="margin"
				:is-draggable="editMode" :is-resizable="editMode"
				:vertical-compact="false" :prevent-collision="false" :use-css-transforms="true"
				:restore-on-drag="restoreOnDrag" :auto-size="false"
				@layout-updated="commitHeight(); emit('changed')">
		<GridItem v-for="item in layout" :key="item.i"
				  :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i"
				  :min-w="1" :min-h="1" drag-allow-from=".flex-drag-handle"
				  :is-draggable="editMode && !item.locked" :is-resizable="editMode && !item.locked"
				  @move="(i: string, x: number, y: number) => emit('itemMove', i, x, y)"
				  @moved="(i: string, x: number, y: number) => emit('itemMoved', i, x, y)">
			<FlexGridItem :item="item" :edit-mode="editMode" :row-height="rowHeight"
						  :selected="selectedIds?.has(item.i)" :page-lock="pageLock"
						  @remove="emit('remove', item.i)" @edit="emit('edit', item.i)"
						  @edit-contents="emit('editContents', item.i)" @export="emit('exportItem', item.i)"
						  @duplicate="emit('duplicate', item.i)" @toggle-lock="emit('toggleLock', item.i)"
						  @toggle-select="emit('toggleSelect', item.i)"
						  @auto-height="(h: number) => emit('autoHeight', item.i, h)"
						  @patch-widget="(patch: Record<string, unknown>) => emit('patchWidget', item.i, patch)" />
		</GridItem>
	</GridLayout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { GridItem, GridLayout } from "grid-layout-plus";

import type { GridItemModel } from "../model/document";
import FlexGridItem from "./FlexGridItem.vue";

const props = defineProps<{
	layout: Array<GridItemModel>;
	cols: number;
	rowHeight: number;
	gap?: number;
	editMode: boolean;
	/** Ids of currently multi-selected items (for the align/distribute highlight). */
	selectedIds?: Set<string>;
	/** Force every item on this page to lock while the printer is printing. */
	pageLock?: boolean;
}>();
const emit = defineEmits<{
	"update:layout": [Array<GridItemModel>];
	changed: [];
	remove: [string];
	edit: [string];
	editContents: [string];
	exportItem: [string];
	duplicate: [string];
	toggleLock: [string];
	toggleSelect: [string];
	autoHeight: [string, number];
	patchWidget: [string, Record<string, unknown>];
	/** Fired continuously while an item is being dragged (group-drag live follow). */
	itemMove: [i: string, x: number, y: number];
	/** Fired once when the drag ends (group-drag commit). */
	itemMoved: [i: string, x: number, y: number];
}>(); 

// Configurable inter-panel gap (px); defaults to 8 for consumers that don't set it.
const margin = computed<[number, number]>(() => {
	const g = Math.max(0, props.gap ?? 8);
	return [g, g];
});

// "Free placement" dragging: with restore-on-drag, neighbours that a dragged panel crosses are
// pushed aside momentarily but snapped back to their original spots, so the dragged panel lands
// where you drop it without permanently disturbing the others (overlap is allowed). We DON'T enable
// it during a multi-select group drag (2+ selected) — that path deliberately moves the followers
// itself (FlexPage.onGroupDragMove), and restoring from the grid's drag-start snapshot would fight it.
const restoreOnDrag = computed(() => (props.selectedIds?.size ?? 0) <= 1);

// grid-layout-plus reassigns the layout array on add/remove and mutates items in place on
// drag/resize; bridge both back to the parent via v-model.
const layoutModel = computed({
	get: () => props.layout,
	set: (v: Array<GridItemModel>) => emit("update:layout", v),
});

// grid-layout-plus's own `autoSize` (on by default) recomputes the grid's CSS height on every single
// drag/resize tick, not just at the end - which makes the whole page visibly reflow live while
// resizing the last (bottom-most) item, both growing AND shrinking, making the drag hard to control.
// We take height over ourselves instead (`:auto-size="false"` above): grow live (a growing
// resize/drag always needs the room, and any non-interactive height increase - e.g. adding a widget
// - should take effect immediately too), but only shrink once the change is actually committed, so
// a shrinking drag never moves the ground under the operator's cursor mid-gesture.
const naturalHeight = computed(() => {
	const bottom = props.layout.reduce((max, it) => Math.max(max, it.y + it.h), 0);
	return bottom * (props.rowHeight + margin.value[1]) + margin.value[1];
});
const liveHeight = ref(naturalHeight.value);
watch(naturalHeight, (nh) => {
	if (nh > liveHeight.value) { liveHeight.value = nh; }
});
/** Settle to the current natural height - allows a shrink to finally take effect. Called on
 *  `layout-updated`, which grid-layout-plus already fires at drag/resize end AND on any
 *  non-interactive reassignment of the `layout` prop (add/remove/undo/redo/page switch all replace
 *  the array by reference), so this alone covers every case without a separate watch. */
function commitHeight(): void {
	liveHeight.value = naturalHeight.value;
}
</script>

<!-- Non-scoped: grid-layout-plus renders the resize grip + placeholder outside our component
	 trees, so scoped styles can't reach them. Scope to .flex-grid so it applies wherever the grid
	 is used (pages, the status bar, and inside group panels). -->
<style>
.flex-grid.vgl-layout {
	--vgl-placeholder-bg: rgb(var(--v-theme-primary));
	--vgl-placeholder-opacity: 18%;
	--vgl-resizer-size: 16px;
	--vgl-resizer-border-width: 3px;
	--vgl-resizer-border-color: rgb(var(--v-theme-primary));
}
/* Let the edit-mode header bar overhang a narrow item without being clipped, and raise the hovered
   item so its overhanging bar draws above its neighbours. */
.flex-grid .vgl-item {
	overflow: visible;
}
.flex-grid .vgl-item:hover {
	z-index: 5;
}
.flex-grid .vgl-item__resizer {
	z-index: 4;
	opacity: 0.75;
}
.flex-grid .vgl-item__resizer:hover {
	opacity: 1;
}
.flex-grid .vgl-item--placeholder {
	border-radius: 4px;
}
</style>
