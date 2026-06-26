<template>
	<v-card class="fill-height d-flex flex-column" variant="tonal">
		<v-card-title v-if="widget.title" class="py-1 text-truncate" style="font-size: 0.95em;">
			{{ widget.title }}
		</v-card-title>

		<!-- FREE-POSITION mode: each child is absolutely positioned by % coords -->
		<div v-if="isFree" class="flex-grow-1 free-group-canvas">
			<div
				v-for="child in sortedItems"
				:key="child.i"
				class="free-group-item"
				:style="freeItemStyle(child)"
			>
				<WidgetView :widget="child.widget" />
			</div>
		</div>

		<!-- GRID mode (default): existing nested FlexGrid, completely unchanged -->
		<div v-else-if="widget.items.length > 0" class="flex-grow-1" style="min-height: 0; overflow: auto;">
			<FlexGrid :layout="widget.items" :cols="widget.cols ?? 12"
					  :row-height="widget.rowHeight ?? 30" :edit-mode="false" />
		</div>

		<div v-else class="flex-grow-1 d-flex align-center justify-center text-medium-emphasis pa-4" style="height: 100%">
			<div class="text-center"><v-icon>mdi-group</v-icon>
				<div style="font-size: 0.8em">{{ $t("plugins.flexibleLayouts.widgets.groupEmpty") }}</div></div>
		</div>
	</v-card>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from "vue";

import type { GridItemModel, Widget } from "../model/document";
import WidgetView from "./WidgetView.vue";

// Lazy import breaks the FlexGrid -> FlexGridItem -> WidgetView -> GroupWidget -> FlexGrid module
// cycle so neither side can be a temporal-dead-zone undefined at evaluation time.
const FlexGrid = defineAsyncComponent(() => import("../page/FlexGrid.vue"));

const props = defineProps<{ widget: Extract<Widget, { type: "group" }> }>();

/** True when this group uses the free-position layout mode. */
const isFree = computed(() => props.widget.layoutMode === "free");

/**
 * Sort items by freeZ (ascending) so higher-z items are rendered last (on top).
 * Items without freeZ default to z=0.
 */
const sortedItems = computed<Array<GridItemModel>>(() => {
	if (!isFree.value) return props.widget.items;
	return [...props.widget.items].sort((a, b) => (a.freeZ ?? 0) - (b.freeZ ?? 0));
});

/**
 * Compute the CSS style for a free-mode child item.
 * x/y/w/h are in percent (0–100) of the group canvas area.
 * freeRotation is in degrees, freeZ drives z-index.
 */
function freeItemStyle(item: GridItemModel): Record<string, string> {
	const z = item.freeZ ?? 0;
	const rot = item.freeRotation ?? 0;
	const style: Record<string, string> = {
		position: "absolute",
		left: `${item.x}%`,
		top: `${item.y}%`,
		width: `${item.w}%`,
		height: `${item.h}%`,
		zIndex: String(z),
	};
	if (rot !== 0) {
		style.transform = `rotate(${rot}deg)`;
		style.transformOrigin = "center center";
	}
	return style;
}
</script>

<style scoped>
/* The free-position canvas: fills the card body and serves as the 100%×100% reference frame. */
.free-group-canvas {
	position: relative;
	min-height: 0;
	overflow: hidden;
}

/* Each free child: absolutely positioned within the canvas. */
.free-group-item {
	/* pointer-events handled per-child by the widget itself (shaped buttons manage click-through) */
	pointer-events: auto;
}
</style>
