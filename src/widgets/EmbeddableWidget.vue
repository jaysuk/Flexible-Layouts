<template>
	<div class="fill-height flex-embeddable">
		<!-- Plugins that publish a config schema get per-instance config + a setter + host context. -->
		<component :is="comp" v-if="comp && schema" :config="widget.config" :set-config="setConfig" :host="host" />
		<component :is="comp" v-else-if="comp" />
		<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
			{{ $t("plugins.flexibleLayouts.widgets.embeddableMissing", { name: widget.label || widget.id, plugin: widget.pluginId || widget.id }) }}
		</v-alert>
	</div>
</template>

<script setup lang="ts">
import { onErrorCaptured, onMounted, onUnmounted, shallowRef, watchEffect } from "vue";

import { applyDefaults, getWidgetConfig, subscribeToWidgetConfigs, type WidgetConfigSchema } from "dwc-plugin-runtime";

import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

const props = defineProps<{ widget: Extract<Widget, { type: "embeddable" }>; disabled?: boolean }>();

const ui = useUiStore();
const comp = shallowRef<unknown>(null);

// Resolve reactively: the providing plugin may load/unload after the layout renders, so the widget
// flips between the live component and the "needs plugin" placeholder without a reload.
watchEffect(() => {
	const registry = (ui as { embeddableComponents?: Array<{ id: string; component: unknown }> }).embeddableComponents ?? [];
	comp.value = registry.find((c) => c.id === props.widget.id)?.component ?? null;
});

// The widget's config schema (from dwc-plugin-runtime's registry), if the plugin published one. The
// registry is a window-global, so subscribe for late registration (plugin loaded after this mounts).
const schema = shallowRef<WidgetConfigSchema | null>(null);
function refreshSchema(): void {
	const reg = getWidgetConfig(props.widget.id);
	schema.value = reg?.schema ?? null;
	// Seed/backfill per-instance config from the schema defaults, so the component always gets a full
	// config and old layouts pick up new fields. Persisted with the layout (widget.config is reactive).
	if (schema.value) {
		props.widget.config = applyDefaults(schema.value, props.widget.config);
	}
}
let unsubscribe: (() => void) | null = null;
onMounted(() => {
	refreshSchema();
	unsubscribe = subscribeToWidgetConfigs(refreshSchema);
});
onUnmounted(() => { unsubscribe?.(); });

/** Persist a partial config change from the component back into the layout document. */
function setConfig(patch: Record<string, unknown>): void {
	props.widget.config = { ...(props.widget.config ?? {}), ...patch };
}

const host = { isEditing: false };

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
