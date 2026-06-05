<template>
	<div class="flex-grid-item fill-height" :class="{ 'is-editing': editMode }" :style="colorVars">
		<!-- Edit-mode header: drag handle + title + settings + delete. The `flex-drag-handle` class is
			 what the grid item's drag-allow-from targets, so dragging only starts from this bar. -->
		<div v-if="editMode" class="flex-item-header flex-drag-handle" :class="{ 'has-header-color': !!item.colors?.header }">
			<v-icon size="small" class="me-1">mdi-drag</v-icon>
			<v-icon size="small" class="me-1">{{ meta.icon }}</v-icon>
			<span class="flex-item-title text-truncate">{{ meta.title }}</span>
			<v-icon v-if="effects.hidden" size="x-small" class="ms-1" color="warning"
					:title="$t('plugins.flexibleLayouts.conditions.hiddenHint')">mdi-eye-off</v-icon>
			<v-spacer />
			<v-btn v-if="item.widget.type === 'group'" icon="mdi-view-grid-plus" size="x-small" variant="text"
				   density="comfortable" :title="$t('plugins.flexibleLayouts.group.editContents')"
				   @click="emit('editContents')" />
			<v-btn :icon="item.locked ? 'mdi-lock' : 'mdi-lock-open-variant'" size="x-small" variant="text"
				   density="comfortable" :color="item.locked ? 'warning' : undefined"
				   :title="item.locked ? $t('plugins.flexibleLayouts.editor.unlock') : $t('plugins.flexibleLayouts.editor.lock')"
				   @click="emit('toggleLock')" />
			<v-btn icon="mdi-content-copy" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.editor.duplicate')" @click="emit('duplicate')" />
			<v-btn icon="mdi-content-save" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.io.exportPanel')" @click="emit('export')" />
			<v-btn icon="mdi-cog" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.editor.configureWidget')"
				   @click="emit('edit')" />
			<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.editor.removeWidget')"
				   @click="emit('remove')" />
		</div>

		<!-- In edit mode the body becomes pointer-inert (so dragging/clicking the tile never actuates
			 the live widget underneath, e.g. firing G-code while arranging). Done with
			 pointer-events:none rather than an overlay, so it doesn't swallow the resize grip. -->
		<div class="flex-item-body" :class="{ 'with-header': editMode, 'is-inert': editMode, 'has-bg': !!item.colors?.background, 'has-text': !!item.colors?.text, 'no-scroll': fitEnabled }"
			 :style="typographyStyle">
			<!-- A condition can hide the widget at runtime. In edit mode it stays visible (dimmed) so
				 it remains selectable; in view mode it renders nothing. -->
			<div v-if="effects.hidden && !editMode" class="fill-height" />
			<div v-else class="fill-height" :class="{ 'condition-dimmed': effects.hidden && editMode }">
				<ScaleToFit v-if="fitEnabled">
					<WidgetView :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled" />
				</ScaleToFit>
				<WidgetView v-else :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, provide } from "vue";

import { SETTINGS_SCOPE_KEY } from "@/plugins";
import { useMachineStore } from "@/stores/machine";

import type { GridItemModel } from "../model/document";
import { evaluateConditions } from "../util/conditions";
import { describeWidget } from "../widgets/registry";
import ScaleToFit from "../widgets/ScaleToFit.vue";
import WidgetView from "../widgets/WidgetView.vue";

const props = defineProps<{ item: GridItemModel; editMode: boolean }>();
const emit = defineEmits<{ remove: []; edit: []; editContents: []; export: []; duplicate: []; toggleLock: [] }>();

// Give every placed widget its own component-settings scope keyed by the grid item's GUID, so a
// built-in DWC panel rendered inside (which calls useComponentSettings with no explicit id) derives
// a unique, move-stable identity instead of colliding with other instances of the same panel. The
// grid keys each FlexGridItem by item.i, so this scope is fixed for the instance's lifetime.
// Guarded so the plugin still loads on a DWC build that predates this exported key.
if (SETTINGS_SCOPE_KEY) {
	provide(SETTINGS_SCOPE_KEY, { segments: [props.item.i], childCounter: {} });
}

const machineStore = useMachineStore();

const meta = computed(() => {
	const described = describeWidget(props.item.widget);
	return { title: props.item.title || described.title, icon: described.icon };
});

// Reactive condition effects (colour / hide / disable) driven by the live object model.
const effects = computed(() => evaluateConditions(machineStore.model, props.item.conditions));

// Per-panel colour overrides exposed as CSS variables consumed by the styles below.
const colorVars = computed(() => {
	const c = props.item.colors;
	if (!c) {
		return {};
	}
	const vars: Record<string, string> = {};
	if (c.background) vars["--flex-bg"] = c.background;
	if (c.header) vars["--flex-header"] = c.header;
	if (c.text) vars["--flex-text"] = c.text;
	return vars;
});

// Typography overrides applied to the widget body (font-family cascades to everything; freeform
// widgets size their text in em so they follow the base font-size set here).
const typographyStyle = computed(() => {
	const t = props.item.typography;
	const style: Record<string, string> = {};
	if (t?.fontSize) style.fontSize = `${t.fontSize}px`;
	if (t?.fontFamily) style.fontFamily = t.fontFamily;
	return style;
});

// Scale-to-fit defaults on for content that tends to overflow a small cell (built-in panels,
// embedded plugin pages); freeform widgets are sized to their cell already. The item can override.
const fitEnabled = computed(() =>
	props.item.fit ?? (props.item.widget.type === "builtinPanel" || props.item.widget.type === "pluginPage"));
</script>

<style scoped>
.flex-grid-item {
	display: flex;
	flex-direction: column;
	border-radius: 4px;
}
.flex-grid-item.is-editing {
	outline: 1px dashed rgba(var(--v-theme-primary), 0.6);
	outline-offset: -1px;
}
.flex-item-header {
	display: flex;
	align-items: center;
	padding: 2px 4px;
	background: rgba(var(--v-theme-primary), 0.12);
	cursor: move;
	user-select: none;
	min-height: 28px;
}
.flex-item-title {
	font-size: 0.8rem;
	font-weight: 500;
	min-width: 0;
}
.flex-item-body {
	position: relative;
	flex: 1 1 auto;
	min-height: 0;
	overflow: hidden;
}
.flex-item-body.with-header {
	overflow: auto;
}
.flex-item-body.no-scroll,
.flex-item-body.no-scroll.with-header {
	overflow: hidden;
}
.flex-item-body.is-inert {
	pointer-events: none;
}
.condition-dimmed {
	opacity: 0.4;
}

/* Per-panel colour overrides. background + text reach built-in panel cards via :deep. */
.flex-item-header.has-header-color {
	background: var(--flex-header);
}
.flex-item-body.has-bg {
	background: var(--flex-bg);
}
.flex-item-body.has-bg :deep(.v-card) {
	background: var(--flex-bg);
}
.flex-item-body.has-text {
	color: var(--flex-text);
}
.flex-item-body.has-text :deep(.v-card),
.flex-item-body.has-text :deep(.v-card-title),
.flex-item-body.has-text :deep(.v-card-text) {
	color: var(--flex-text);
}
</style>
