<template>
	<div class="fill-height">
		<iframe v-if="src" :src="src" class="flex-web-frame" referrerpolicy="no-referrer" />
		<div v-else class="fill-height d-flex flex-column align-center justify-center text-medium-emphasis">
			<v-icon>mdi-web</v-icon>
			<div class="text-caption">{{ $t("plugins.flexibleLayouts.widgets.webUnset") }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";
import { resolveExternalUrl } from "../util/url";

const props = defineProps<{ widget: Extract<Widget, { type: "web" }> }>();

// Normalise so a bare host (e.g. "example.com") loads the external site rather than being resolved
// against the Duet's origin (which would try to load it from the SD card).
const src = computed(() => resolveExternalUrl(props.widget.url));
</script>

<style scoped>
.flex-web-frame {
	width: 100%;
	height: 100%;
	border: 0;
	display: block;
}
</style>
