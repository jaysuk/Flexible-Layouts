<template>
	<!-- DWC's phone home screen: a grid of tiles to every page (stock: components/misc/HubTiles.vue), fed
		 from the same list as the side drawer so hidden/reordered/custom pages carry over. -->
	<v-container class="pa-3">
		<v-row density="compact">
			<v-col v-for="item in items" :key="item.path" cols="6" sm="3">
				<v-card :to="tilePath(item)" min-height="110" variant="flat" :style="tileStyle(item)"
						class="fl-hub-tile d-flex flex-column align-center justify-center pa-3 h-100">
					<v-icon :icon="item.icon" size="36" class="mb-2" />
					<span class="text-title-medium text-center">{{ title(item) }}</span>
				</v-card>
			</v-col>
		</v-row>
	</v-container>
</template>

<script setup lang="ts">
import { computed } from "vue";

import i18n from "@/i18n";
import { type MenuItem } from "@/stores/menu";

import { useNavGroups } from "./useNavGroups";

const groups = useNavGroups();
const items = computed(() => groups.value.flatMap((g) => g.items.map((item) => ({ ...item, categoryColor: g.category.color }))));

type HubItem = MenuItem & { categoryColor?: string };

function title(item: HubItem): string {
	return item.translated ? item.caption : i18n.global.t(item.caption);
}

// The Dashboard entry's path is `/`, the hub's own route: linking to it would be a self-navigation
// vue-router ignores, so route through `/Dashboard` (same page) - as the stock hub does.
function tilePath(item: HubItem): string {
	return item.path === "/" ? "/Dashboard" : item.path;
}

// Category colour -> the `--dwc-category-<name>` palette var DWC defines; a faint tint, and an
// unknown name simply leaves the tile untinted.
function tileStyle(item: HubItem): Record<string, string> {
	const color = item.color ?? item.categoryColor;
	return color ? { backgroundColor: `rgba(var(--dwc-category-${color}), 0.08)` } : {};
}
</script>
