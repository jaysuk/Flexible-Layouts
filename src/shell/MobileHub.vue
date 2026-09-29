<template>
	<v-container class="pa-3">
		<!-- DWC's phone home screen: a grid of tiles to every page (stock: components/misc/HubTiles.vue), fed
			 from the same list as the side drawer so hidden/reordered/custom pages carry over. A page's menu
			 badge (unread notifications, modified editors, ...) sits in the tile's corner, as on the stock tile. -->
		<v-row density="compact">
			<v-col v-for="item in items" :key="item.path" cols="6" sm="3">
				<v-card :to="tilePath(item)" min-height="110" variant="flat" :style="tileStyle(item)"
						class="fl-hub-tile d-flex flex-column align-center justify-center pa-3 h-100 position-relative">
					<!-- `no-clear`: a tile is a link, so a badge on it only ever shows a count - it can't be dismissed from here (stock passes the same). -->
					<NavMenuBadge v-if="resolveBadge(item)" :badge="resolveBadge(item)!" size="default" no-clear
								  class="fl-hub-tile-badge" />
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
import { type MenuBadge, type MenuItem } from "@/stores/menu";

import { useNavGroups } from "./useNavGroups";

const groups = useNavGroups();
const items = computed(() => groups.value.flatMap((g) => g.items.map((item) => ({ ...item, categoryColor: g.category.color }))));

type HubItem = MenuItem & { categoryColor?: string };

function title(item: HubItem): string {
	return item.translated ? item.caption : i18n.global.t(item.caption);
}

// A page's badge, if it has one (`MenuItem.badge` is read fresh, so the count follows the store). Optional
// call: a DWC build with no badges simply has no `badge` on its items.
function resolveBadge(item: HubItem): MenuBadge | null {
	return item.badge?.() ?? null;
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

<style scoped>
.fl-hub-tile-badge {
	position: absolute;
	top: 6px;
	right: 6px;
}
</style>
