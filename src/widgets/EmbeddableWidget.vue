<template>
	<div class="fill-height flex-embeddable">
		<component :is="comp" v-if="comp" />
		<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
			{{ $t("plugins.flexibleLayouts.widgets.embeddableMissing", { name: widget.label || widget.id, plugin: widget.pluginId || widget.id }) }}
		</v-alert>
	</div>
</template>

<script setup lang="ts">
import { onErrorCaptured, shallowRef, watchEffect } from "vue";

import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "embeddable" }> }>();

const ui = useUiStore();
const comp = shallowRef<unknown>(null);

// Resolve reactively: the providing plugin may load/unload after the layout renders, so the widget
// flips between the live component and the "needs plugin" placeholder without a reload. The `?? []`
// guards a DWC build that predates the embeddable-components registry (the field simply won't exist).
watchEffect(() => {
	const registry = (ui as { embeddableComponents?: Array<{ id: string; component: unknown }> }).embeddableComponents ?? [];
	comp.value = registry.find((c) => c.id === props.widget.id)?.component ?? null;
});

// A third-party component that assumes a context the cell doesn't provide must not crash the canvas.
onErrorCaptured((err) => {
	console.warn(`[FlexibleLayouts] embeddable "${props.widget.id}" failed:`, err);
	comp.value = null;
	return false;
});
</script>

<style scoped>
.flex-embeddable {
	overflow: auto;
}
</style>
