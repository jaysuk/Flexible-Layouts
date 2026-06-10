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
		<div class="flex-item-body" :class="{ 'with-header': editMode, 'is-inert': editMode, 'has-bg': !!item.colors?.background, 'has-text': !!item.colors?.text, 'no-scroll': fitEnabled, 'has-label-size': !!item.typography?.labelFontSize, 'has-label-family': !!item.typography?.labelFontFamily }"
			 :style="typographyStyle">
			<!-- A condition can hide the widget at runtime. In edit mode it stays visible (dimmed) so
				 it remains selectable; in view mode it renders nothing. -->
			<div v-if="effects.hidden && !editMode" class="fill-height" />
			<div v-else class="fill-height" :class="{ 'condition-dimmed': effects.hidden && editMode }">
				<WidgetErrorBoundary :reset-key="widgetKey">
					<ScaleToFit v-if="fitEnabled">
						<WidgetView :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled" />
					</ScaleToFit>
					<WidgetView v-else :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled" />

					<template #error="{ message, reset }">
						<div class="flex-widget-error fill-height">
							<v-icon color="warning" size="small">mdi-alert-circle-outline</v-icon>
							<div class="text-caption font-weight-medium mt-1">{{ meta.title }} — {{ $t("plugins.flexibleLayouts.widgetError.title") }}</div>
							<div class="text-caption text-medium-emphasis flex-widget-error-msg">{{ message }}</div>
							<div class="d-flex ga-2 mt-2">
								<v-btn size="x-small" variant="tonal" prepend-icon="mdi-refresh" @click="reset">{{ $t("plugins.flexibleLayouts.widgetError.retry") }}</v-btn>
								<v-btn size="x-small" variant="tonal" prepend-icon="mdi-bug" @click="reportWidgetError(message)">{{ $t("plugins.flexibleLayouts.diagnostics.report") }}</v-btn>
								<v-btn size="x-small" variant="tonal" color="error" prepend-icon="mdi-delete" @click="emit('remove')">{{ $t("plugins.flexibleLayouts.widgetError.remove") }}</v-btn>
							</div>
						</div>
					</template>
				</WidgetErrorBoundary>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, provide } from "vue";

import { SETTINGS_SCOPE_KEY } from "@/composables/useComponentSettings";
import { useMachineStore } from "@/stores/machine";

import { buildReport, downloadReport } from "dwc-plugin-runtime";

import type { GridItemModel } from "../model/document";
import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { evaluateConditions } from "../util/conditions";
import { describeWidget } from "../widgets/registry";
import ScaleToFit from "../widgets/ScaleToFit.vue";
import WidgetErrorBoundary from "../widgets/WidgetErrorBoundary.vue";
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

// Download a diagnostic report scoped to this failing widget (its config + the error + a scrubbed
// object model), so a bug report carries exactly what's needed to reproduce it as a test.
function reportWidgetError(message: string): void {
	downloadReport(buildReport({
		pluginId: PLUGIN_MANIFEST_ID,
		model: machineStore.model,
		state: { widget: props.item.widget, title: props.item.title },
		note: `widget render error: ${message}`,
	}));
}

const meta = computed(() => {
	const described = describeWidget(props.item.widget);
	return { title: props.item.title || described.title, icon: described.icon };
});

// Re-render (clear a caught error) when the widget's config changes, so fixing it in the
// properties dialog recovers the tile automatically.
const widgetKey = computed(() => JSON.stringify(props.item.widget));

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
// widgets size their text in em so they follow the base font-size set here). Label font/size are
// exposed as CSS variables so widget labels can scale independently of their values.
const typographyStyle = computed(() => {
	const t = props.item.typography;
	const style: Record<string, string> = {};
	if (t?.fontSize) style.fontSize = `${t.fontSize}px`;
	if (t?.fontFamily) style.fontFamily = t.fontFamily;
	if (t?.labelFontSize) style["--flex-label-size"] = `${t.labelFontSize}px`;
	if (t?.labelFontFamily) style["--flex-label-family"] = t.labelFontFamily;
	return style;
});

// Scale-to-fit defaults OFF — widgets size to their cell, panels scroll if they overflow. The user
// can turn it on per panel in properties when they'd rather shrink the content to fit.
const fitEnabled = computed(() => props.item.fit ?? false);
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

.flex-widget-error {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	text-align: center;
	padding: 8px;
	overflow: auto;
}
.flex-widget-error-msg {
	font-family: monospace;
	font-size: 0.7rem;
	max-height: 4.5em;
	overflow: auto;
	word-break: break-word;
}

/* Panel typography scales a widget's read-outs by raising the body font-size, which also enlarges
   text inside Vuetify form controls. Their height is normally fixed by density, so a large value is
   clipped. Size the field from the font instead (em min-height + generous line-height) so the field
   grows to fit the text rather than cropping it. `--v-input-control-height` is overridden in em so
   Vuetify's own min-height tracks the font too. */
.flex-item-body :deep(.v-input) {
	--v-input-control-height: 2.6em;
}
.flex-item-body :deep(.v-field__input) {
	min-height: 2.6em;
	line-height: 1.5;
	padding-top: 0.4em;
	padding-bottom: 0.3em;
}
.flex-item-body :deep(.v-field__input input),
.flex-item-body :deep(.v-field__input textarea),
.flex-item-body :deep(.v-field__input .v-select__selection) {
	line-height: 1.5;
}

/* Separate label typography: when a label font/size is configured, apply it to labels — Vuetify
   field/section labels (.v-label), the `flex-label` convention, and any element whose class ends in
   "-label" (the per-widget label classes) — independently of the value text. */
.flex-item-body.has-label-size :deep(.v-label),
.flex-item-body.has-label-size :deep(.flex-label),
.flex-item-body.has-label-size :deep([class$="-label"]) {
	font-size: var(--flex-label-size) !important;
}
.flex-item-body.has-label-family :deep(.v-label),
.flex-item-body.has-label-family :deep(.flex-label),
.flex-item-body.has-label-family :deep([class$="-label"]) {
	font-family: var(--flex-label-family) !important;
}
</style>
