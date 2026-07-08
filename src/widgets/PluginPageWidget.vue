<template>
	<div class="fill-height flex-plugin-page">
		<component :is="comp" v-if="comp" />
		<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
			{{ $t("plugins.flexibleLayouts.widgets.pluginPageMissing", { name: widget.label || widget.path }) }}
		</v-alert>
	</div>
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";
import { useRouter } from "vue-router";

import { getJobViewTabs, getPluginSettingTabs } from "@/plugins";

import type { Widget } from "../model/document";
import { GCODE_VIEWER_JOB_TAB_KEY, GCODE_VIEWER_PAGE_PATH } from "../model/pluginPages";

const props = defineProps<{ widget: Extract<Widget, { type: "pluginPage" }> }>();

const router = useRouter();

// Resolve the embedded component. For pages we read the router record (setupLayouts flattens each
// route into a layout-switcher parent + a child carrying the real page in components.default - we
// want the child). For Settings/Job tabs we look up the registered tab by key.
function resolve() {
	const w = props.widget;
	// No longer offered in the palette (see model/pluginPages.ts), but a document saved before that
	// change can still have one placed - refuse to mount it rather than reproducing the crash. DWC's
	// GCodeViewer only works with a job actually running or explicit route params neither source
	// gives it, and its failure is async - onErrorCaptured below can't catch it, so this has to be
	// caught before ever attempting to render, not after.
	if ((w.source === "jobTab" && w.tabKey === GCODE_VIEWER_JOB_TAB_KEY)
		|| (w.source === "page" && w.path?.startsWith(GCODE_VIEWER_PAGE_PATH))) {
		return null;
	}
	if (w.source === "settingTab") {
		return getPluginSettingTabs().find((t) => t.key === w.tabKey)?.component ?? null;
	}
	if (w.source === "jobTab") {
		return getJobViewTabs().find((t) => t.key === w.tabKey)?.component ?? null;
	}
	const rec = router.getRoutes().find(
		(r) => r.path === w.path && (r.meta as { isLayout?: boolean })?.isLayout !== true);
	return rec?.components?.default ?? null;
}

const comp = ref<unknown>(resolve());

// A plugin page that assumes a context the cell doesn't provide must not crash the whole canvas.
onErrorCaptured((err) => {
	console.warn(`[FlexibleLayouts] embedded page "${props.widget.path}" failed:`, err);
	comp.value = null;
	return false;
});
</script>

<style scoped>
.flex-plugin-page {
	overflow: auto;
}
</style>
