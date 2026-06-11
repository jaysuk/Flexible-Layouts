<template>
	<div class="thumb-root fill-height d-flex flex-column">
		<div v-if="widget.title" class="thumb-title text-center text-truncate flex-shrink-0">{{ widget.title }}</div>
		<div class="thumb-body flex-grow-1">
			<component :is="ThumbnailImg" v-if="thumbnail" :thumbnail="thumbnail" class="thumb-img"
					   :class="widget.fit === 'cover' ? 'thumb-cover' : 'thumb-contain'" />
			<div v-else class="thumb-empty text-medium-emphasis text-caption">
				<v-icon size="small" class="mb-1">mdi-image-off-outline</v-icon>
				<div>{{ $t("plugins.flexibleLayouts.thumbnail.none") }}</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, resolveComponent, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "thumbnail" }> }>();

const machineStore = useMachineStore();

// DWC's globally-registered thumbnail renderer (handles png/jpeg/qoi); resolved by name so this
// plugin doesn't have to bundle the QOI decoder. Guarded so a missing component just shows the
// empty state instead of throwing.
const ThumbnailImg = resolveComponent("ThumbnailImg");

interface ThumbInfo { data?: string | null; width: number; height: number; format?: unknown }

function largest(list: Array<ThumbInfo> | null | undefined): ThumbInfo | null {
	if (!Array.isArray(list)) {
		return null;
	}
	const usable = list.filter((t) => !!t && !!t.data);
	return usable.length ? usable.slice().sort((a, b) => b.width * b.height - a.width * a.height)[0] : null;
}

// source === "file": fetch a specific gcode file's thumbnail via getFileInfo (slicer metadata).
const fileThumb = ref<ThumbInfo | null>(null);
watch(
	[() => props.widget.source, () => props.widget.path, () => machineStore.isConnected],
	async () => {
		if (props.widget.source !== "file" || !props.widget.path || !machineStore.isConnected) {
			fileThumb.value = null;
			return;
		}
		try {
			const info = await machineStore.getFileInfo(props.widget.path, true);
			fileThumb.value = largest((info?.thumbnails ?? []) as Array<ThumbInfo>);
		} catch {
			fileThumb.value = null;
		}
	},
	{ immediate: true },
);

const thumbnail = computed<ThumbInfo | null>(() => {
	if (typeof ThumbnailImg === "string") {
		return null;
	}
	if (props.widget.source === "file") {
		return fileThumb.value;
	}
	// "job" (default): the running job's slicer thumbnails (DWC fetches the image data async).
	const job = (machineStore.model as { job?: { file?: { thumbnails?: Array<ThumbInfo> } } }).job;
	return largest(job?.file?.thumbnails);
});
</script>

<style scoped>
.thumb-root {
	min-height: 0;
	padding: 2px;
}
.thumb-title {
	font-size: 0.8em;
	font-weight: 600;
	line-height: 1.4;
	opacity: 0.85;
}
.thumb-body {
	position: relative;
	min-height: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
}
.thumb-img {
	max-width: 100%;
	max-height: 100%;
	display: block;
}
.thumb-contain {
	object-fit: contain;
}
.thumb-cover {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.thumb-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
}
</style>
