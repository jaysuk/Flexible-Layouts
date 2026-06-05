<template>
	<div class="fill-height">
		<iframe v-if="widget.url" :src="widget.url" class="flex-web-frame"
				referrerpolicy="no-referrer" />
		<div v-else class="fill-height d-flex flex-column align-center justify-center text-medium-emphasis">
			<v-icon>mdi-web</v-icon>
			<div class="text-caption">{{ $t("plugins.flexibleLayouts.widgets.webUnset") }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Widget } from "../model/document";

defineProps<{ widget: Extract<Widget, { type: "web" }> }>();
</script>

<style scoped>
.flex-web-frame {
	width: 100%;
	height: 100%;
	border: 0;
	display: block;
}
</style>
