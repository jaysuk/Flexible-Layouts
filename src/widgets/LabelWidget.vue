<template>
	<div class="fill-height d-flex align-center pa-2" :class="justifyClass">
		<template v-if="widget.variant === 'image'">
			<img v-if="widget.content" :src="widget.content" class="flex-img" alt="" />
			<div v-else class="text-medium-emphasis text-caption text-center w-100">
				<v-icon>mdi-image</v-icon>
				<div>{{ $t("plugins.flexibleLayouts.widgets.imageUnset") }}</div>
			</div>
		</template>

		<div v-else-if="widget.variant === 'spacer'" class="w-100" />

		<div v-else class="w-100 font-weight-medium" :class="alignTextClass" :style="[colorStyle, textStyle]">
			{{ widget.content }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "label" }>; overrideColor?: string }>();

const justifyClass = computed(() => {
	switch (props.widget.align) {
		case "start": return "justify-start";
		case "end": return "justify-end";
		default: return "justify-center";
	}
});

const alignTextClass = computed(() => {
	switch (props.widget.align) {
		case "start": return "text-left";
		case "end": return "text-right";
		default: return "text-center";
	}
});

// Sized in em so the item's typography font-size controls it; heading is larger than body text.
const textStyle = computed(() => ({
	fontSize: props.widget.variant === "heading" ? "1.6em" : "1em",
}));

const colorStyle = computed(() => {
	const c = props.overrideColor || props.widget.color;
	return c ? { color: `rgb(var(--v-theme-${c}))` } : {};
});
</script>

<style scoped>
.flex-img {
	max-width: 100%;
	max-height: 100%;
	object-fit: contain;
}
</style>
