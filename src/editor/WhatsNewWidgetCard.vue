<template>
	<div class="wnw-card">
		<div class="wnw-frame">
			<div class="wnw-stage" :style="previewTransform(size, FRAME)">
				<WidgetView :widget="highlight.widget" />
			</div>
		</div>
		<div class="wnw-body">
			<v-icon size="16" class="wnw-icon">{{ desc.icon }}</v-icon>
			<span class="wnw-title text-truncate">{{ desc.title }}</span>
		</div>
		<div class="wnw-blurb">{{ $t(highlight.blurbKey) }}</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import { previewTransform } from "../composables/useWidgetPreviewFrame";
import type { WhatsNewWidgetHighlight } from "../model/whatsNewWidgets";
import { defaultSizeForWidget, describeWidget } from "../widgets/registry";
import WidgetView from "../widgets/WidgetView.vue";

const props = defineProps<{ highlight: WhatsNewWidgetHighlight }>();

// Smaller than WidgetPalette's own hover-preview frame (236x204) - several of these sit side by
// side in a wrapping row here, rather than filling a dedicated preview pane alone.
const FRAME = { w: 200, h: 130 };

const size = computed(() => defaultSizeForWidget(props.highlight.widget));
const desc = computed(() => describeWidget(props.highlight.widget));
</script>

<style scoped>
.wnw-card {
	width: 200px;
	flex: 0 0 auto;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
	border-radius: 8px;
	overflow: hidden;
	background: rgba(var(--v-theme-on-surface), 0.02);
}
.wnw-frame {
	position: relative;
	width: 200px;
	height: 130px;
	overflow: hidden;
	background: rgba(var(--v-theme-on-surface), 0.04);
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
/* Rendered live but purely decorative here - a preview card must never be clickable/draggable. */
.wnw-stage { position: absolute; top: 50%; left: 50%; pointer-events: none; }
.wnw-body { display: flex; align-items: center; gap: 4px; padding: 6px 8px 0; }
.wnw-icon { color: rgb(var(--v-theme-primary)); flex-shrink: 0; }
.wnw-title { font-size: 0.82rem; font-weight: 600; }
.wnw-blurb { padding: 2px 8px 8px; font-size: 0.74rem; line-height: 1.3; color: rgba(var(--v-theme-on-surface), 0.7); }
</style>
