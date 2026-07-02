<template>
	<v-card class="fill-height d-flex flex-column" variant="tonal">
		<v-card-title v-if="widget.title" class="py-1 text-truncate" style="font-size: 0.95em;">
			{{ widget.title }}
		</v-card-title>

		<!-- FREE-POSITION mode: each child is absolutely positioned by % coords. This is the only place a
			 widget escapes FlexGridItem's overlay entirely (edit-mode inertness is still handled at the
			 parent FlexGridItem level via pointer-events, since a group is itself a grid item), so print-
			 lock and access-lock are applied per child here directly. -->
		<div v-if="isFree" class="flex-grow-1 free-group-canvas">
			<div
				v-for="child in sortedItems"
				:key="child.i"
				class="free-group-item"
				:style="freeItemStyle(child)"
			>
				<WidgetView :widget="child.widget" :disabled="childLocked(child)" />
				<div v-if="childLocked(child)" class="flex-interaction-lock"
					 :title="accessLocked ? $t('plugins.flexibleLayouts.access.interactionLocked') : $t('plugins.flexibleLayouts.printLock.locked')">
					<v-icon size="x-small">mdi-lock</v-icon>
				</div>
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

import { useMachineStore } from "@/stores/machine";

import { accessLockedFor, can } from "../model/access";
import type { GridItemModel, Widget } from "../model/document";
import { effectiveLockForItem, isPrintingStatus } from "../util/printLock";
import WidgetView from "./WidgetView.vue";

// Lazy import breaks the FlexGrid -> FlexGridItem -> WidgetView -> GroupWidget -> FlexGrid module
// cycle so neither side can be a temporal-dead-zone undefined at evaluation time.
const FlexGrid = defineAsyncComponent(() => import("../page/FlexGrid.vue"));

const props = defineProps<{ widget: Extract<Widget, { type: "group" }> }>();

const machineStore = useMachineStore();
const isPrinting = computed(() => isPrintingStatus((machineStore.model as { state?: { status?: string } }).state?.status));
const accessLocked = computed(() => !can("interact"));
function childLocked(child: GridItemModel): boolean {
	return accessLockedFor(child.widget) || (isPrinting.value && effectiveLockForItem(child.widget, child.lockWhilePrinting));
}

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

/* Each free child: absolutely positioned within the canvas (position set inline by freeItemStyle,
   which also makes it a valid containing block for the interaction-lock overlay below). */
.free-group-item {
	/* pointer-events handled per-child by the widget itself (shaped buttons manage click-through) */
	pointer-events: auto;
}

/* Interaction-block overlay for a locked free-mode child - same look as FlexGridItem's, scoped to
   just this child's box (its parent .free-group-item is already position:absolute). */
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
</style>
