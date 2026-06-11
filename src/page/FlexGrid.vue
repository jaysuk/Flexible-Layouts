<template>
	<GridLayout v-model:layout="layoutModel" class="flex-grid"
				:col-num="cols" :row-height="rowHeight" :margin="margin"
				:is-draggable="editMode" :is-resizable="editMode"
				:vertical-compact="false" :prevent-collision="false" :use-css-transforms="true"
				@layout-updated="emit('changed')">
		<GridItem v-for="item in layout" :key="item.i"
				  :x="item.x" :y="item.y" :w="item.w" :h="item.h" :i="item.i"
				  :min-w="1" :min-h="1" drag-allow-from=".flex-drag-handle"
				  :is-draggable="editMode && !item.locked" :is-resizable="editMode && !item.locked"
				  @move="(i: string, x: number, y: number) => emit('itemMove', i, x, y)"
				  @moved="(i: string, x: number, y: number) => emit('itemMoved', i, x, y)">
			<FlexGridItem :item="item" :edit-mode="editMode" :row-height="rowHeight"
						  :selected="selectedIds?.has(item.i)"
						  @remove="emit('remove', item.i)" @edit="emit('edit', item.i)"
						  @edit-contents="emit('editContents', item.i)" @export="emit('exportItem', item.i)"
						  @duplicate="emit('duplicate', item.i)" @toggle-lock="emit('toggleLock', item.i)"
						  @toggle-select="emit('toggleSelect', item.i)"
						  @auto-height="(h: number) => emit('autoHeight', item.i, h)" />
		</GridItem>
	</GridLayout>
</template>

<script setup lang="ts">
import { computed } from "vue";
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

// grid-layout-plus reassigns the layout array on add/remove and mutates items in place on
// drag/resize; bridge both back to the parent via v-model.
const layoutModel = computed({
	get: () => props.layout,
	set: (v: Array<GridItemModel>) => emit("update:layout", v),
});
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
