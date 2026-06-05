<template>
	<div class="d-flex align-center ga-2">
		<!-- Visual picker: the current icon is the activator; clicking opens a searchable grid. -->
		<v-menu v-model="open" :close-on-content-click="false" location="bottom start">
			<template #activator="{ props: menuProps }">
				<v-btn v-bind="menuProps" :icon="modelValue || fallback" variant="tonal"
					   size="small" :aria-label="$t('plugins.flexibleLayouts.icons.pick')" />
			</template>

			<v-card width="320">
				<div class="pa-2">
					<v-text-field v-model="search" density="compact" variant="outlined" hide-details
								  autofocus clearable prepend-inner-icon="mdi-magnify"
								  :placeholder="$t('plugins.flexibleLayouts.icons.search')" />
				</div>
				<v-divider />
				<div class="icon-grid pa-2">
					<v-btn v-for="name in filtered" :key="name" :icon="name" variant="text"
						   size="small" :color="name === modelValue ? 'primary' : undefined"
						   :title="name" @click="choose(name)" />
					<div v-if="filtered.length === 0" class="text-medium-emphasis text-body-small pa-2">
						{{ $t("plugins.flexibleLayouts.icons.none") }}
					</div>
				</div>
			</v-card>
		</v-menu>

		<!-- Manual entry for any mdi-* name not in the curated list. -->
		<v-text-field :model-value="modelValue" density="compact" variant="outlined" hide-details
					  class="flex-grow-1" :label="label ?? $t('plugins.flexibleLayouts.pages.icon')"
					  @update:model-value="emit('update:modelValue', $event)" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { ICON_LIST } from "./iconList";

const props = defineProps<{ modelValue: string; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const fallback = "mdi-view-dashboard-outline";
const open = ref(false);
const search = ref("");

const filtered = computed(() => {
	const q = (search.value ?? "").trim().toLowerCase().replace(/^mdi-/, "");
	if (!q) {
		return ICON_LIST;
	}
	return ICON_LIST.filter((name) => name.includes(q));
});

function choose(name: string) {
	emit("update:modelValue", name);
	open.value = false;
}
</script>

<style scoped>
.icon-grid {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 2px;
	max-height: 280px;
	overflow-y: auto;
}
</style>
