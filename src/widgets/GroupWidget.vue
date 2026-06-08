<template>
	<v-card class="fill-height d-flex flex-column" variant="tonal">
		<v-card-title v-if="widget.title" class="py-1 text-truncate" style="font-size: 0.95em;">
			{{ widget.title }}
		</v-card-title>
		<div class="flex-grow-1" style="min-height: 0; overflow: auto;">
			<FlexGrid v-if="widget.items.length > 0" :layout="widget.items" :cols="widget.cols ?? 12"
					  :row-height="widget.rowHeight ?? 30" :edit-mode="false" />
			<div v-else class="d-flex align-center justify-center text-medium-emphasis pa-4" style="height: 100%">
				<div class="text-center"><v-icon>mdi-group</v-icon>
					<div style="font-size: 0.8em">{{ $t("plugins.flexibleLayouts.widgets.groupEmpty") }}</div></div>
			</div>
		</div>
	</v-card>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from "vue";

import type { Widget } from "../model/document";

// Lazy import breaks the FlexGrid -> FlexGridItem -> WidgetView -> GroupWidget -> FlexGrid module
// cycle so neither side can be a temporal-dead-zone undefined at evaluation time.
const FlexGrid = defineAsyncComponent(() => import("../page/FlexGrid.vue"));

defineProps<{ widget: Extract<Widget, { type: "group" }> }>();
</script>
