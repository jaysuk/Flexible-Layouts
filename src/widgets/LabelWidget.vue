<template>
	<div class="fill-height d-flex align-center pa-2" :class="justifyClass">
		<template v-if="widget.variant === 'image'">
			<img v-if="imgSrc" :src="imgSrc" class="flex-img" alt="" />
			<div v-else class="text-medium-emphasis text-caption text-center w-100">
				<v-progress-circular v-if="loading" indeterminate size="20" />
				<template v-else>
					<v-icon>mdi-image</v-icon>
					<div>{{ loadError || $t("plugins.flexibleLayouts.widgets.imageUnset") }}</div>
				</template>
			</div>
		</template>

		<div v-else-if="widget.variant === 'spacer'" class="w-100" />

		<div v-else class="w-100 font-weight-medium" :class="alignTextClass" :style="[colorStyle, textStyle]">
			{{ widget.content }}
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";
import { resolveColor } from "../util/color";

const props = defineProps<{ widget: Extract<Widget, { type: "label" }>; overrideColor?: string }>();
const machineStore = useMachineStore();

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
	return c ? { color: resolveColor(c) } : {};
});

// Local blob loaded from the machine's SD card when imageSource === "sd" - same convention and
// loading pattern as PageLayout.background's own SD image (FlexPage.vue's refreshResolvedImage).
// Kept separate from `widget.content` (which stays the plain URL src for imageSource === "url",
// today's only mode) since a blob: URL is per-session and must never be persisted into the document.
const loading = ref(false);
const loadError = ref("");
const blobUrl = ref("");

const imgSrc = computed(() => {
	if (props.widget.variant !== "image") { return ""; }
	if (props.widget.imageSource === "sd") { return blobUrl.value; }
	return props.widget.content || "";
});

function revokeBlob(): void {
	if (blobUrl.value) {
		URL.revokeObjectURL(blobUrl.value);
		blobUrl.value = "";
	}
}

async function loadFromSd(path: string): Promise<void> {
	revokeBlob();
	if (!path || !machineStore.isConnected) { return; }
	loading.value = true;
	loadError.value = "";
	try {
		const blob = await machineStore.download({ filename: path, type: "blob" }, false, false, false) as Blob;
		blobUrl.value = URL.createObjectURL(blob);
	} catch (e) {
		loadError.value = (e as Error)?.message ?? String(e);
	} finally {
		loading.value = false;
	}
}

watch(
	() => [props.widget.variant, props.widget.imageSource, props.widget.imagePath, machineStore.isConnected] as const,
	([variant, source, path]) => {
		if (variant === "image" && source === "sd") {
			void loadFromSd(path || "");
		} else {
			revokeBlob();
		}
	},
	{ immediate: true },
);

onBeforeUnmount(revokeBlob);
</script>

<style scoped>
.flex-img {
	max-width: 100%;
	max-height: 100%;
	object-fit: contain;
}
</style>
