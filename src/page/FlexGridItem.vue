<template>
	<!-- Native tooltip outside edit mode only, so it doesn't fight the editor buttons' own titles. -->
	<div class="flex-grid-item fill-height"
		 :class="{ 'is-editing': editMode, 'is-selected': selected, 'is-shaped-btn': isShapedButton && !editMode }"
		 :style="[colorVars, itemZStyle]"
		 :title="!editMode && item.tooltip ? item.tooltip : undefined">
		<!-- Edit-mode header: drag handle + title + settings + delete. The `flex-drag-handle` class is
			 what the grid item's drag-allow-from targets, so dragging only starts from this bar. -->
		<!-- Compact: only drag + configure + delete + an overflow menu stay inline (the rest moved into
			 the menu), and the bar grows to its content (overhanging) so a widget can be made very narrow. -->
		<div v-if="editMode" class="flex-item-header flex-drag-handle"
			 :class="{ 'has-header-color': !!item.colors?.header, 'is-selected-head': selected }">
			<v-icon size="small" class="me-1">mdi-drag</v-icon>
			<v-icon size="small" class="me-1">{{ meta.icon }}</v-icon>
			<span class="flex-item-title text-truncate">{{ meta.title }}</span>
			<v-icon v-if="effects.hidden" size="x-small" class="ms-1" color="warning"
					:title="$t('plugins.flexibleLayouts.conditions.hiddenHint')">mdi-eye-off</v-icon>
			<v-spacer />
			<v-btn icon="mdi-cog" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.editor.configureWidget')" @click="emit('edit')" />
			<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable"
				   :title="$t('plugins.flexibleLayouts.editor.removeWidget')" @click="emit('remove')" />
			<v-menu location="bottom end">
				<template #activator="{ props: menuProps }">
					<v-btn v-bind="menuProps" icon="mdi-dots-vertical" size="x-small" variant="text"
						   density="comfortable" :title="$t('plugins.flexibleLayouts.shell.more')" />
				</template>
				<v-list density="compact">
					<v-list-item :prepend-icon="selected ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'"
								 :title="$t('plugins.flexibleLayouts.editor.selectItem')" @click="emit('toggleSelect')" />
					<v-list-item v-if="item.widget.type === 'group'" prepend-icon="mdi-view-grid-plus"
								 :title="$t('plugins.flexibleLayouts.group.editContents')" @click="emit('editContents')" />
					<v-list-item :prepend-icon="item.locked ? 'mdi-lock' : 'mdi-lock-open-variant'"
								 :title="item.locked ? $t('plugins.flexibleLayouts.editor.unlock') : $t('plugins.flexibleLayouts.editor.lock')"
								 @click="emit('toggleLock')" />
					<v-list-item prepend-icon="mdi-content-copy"
								 :title="$t('plugins.flexibleLayouts.editor.duplicate')" @click="emit('duplicate')" />
					<v-list-item prepend-icon="mdi-content-save"
								 :title="$t('plugins.flexibleLayouts.io.exportPanel')" @click="emit('export')" />
				</v-list>
			</v-menu>
		</div>

		<!-- In edit mode the body becomes pointer-inert (so dragging/clicking the tile never actuates
			 the live widget underneath, e.g. firing G-code while arranging). Done with
			 pointer-events:none rather than an overlay, so it doesn't swallow the resize grip. -->
		<div class="flex-item-body" :class="{ 'with-header': editMode, 'is-inert': editMode, 'has-bg': !!item.colors?.background, 'has-text': !!item.colors?.text, 'has-header-color': !!item.colors?.header, 'no-scroll': fitEnabled, 'is-builtin-panel': item.widget.type === 'builtinPanel' && !fitEnabled, 'is-chrome-panel': chromeOn && !fitEnabled, 'has-label-size': !!item.typography?.labelFontSize, 'has-label-family': !!item.typography?.labelFontFamily }"
			 :style="typographyStyle">
			<!-- A condition can hide the widget at runtime. In edit mode it stays visible (dimmed) so
				 it remains selectable; in view mode it renders nothing. -->
			<div v-if="effects.hidden && !editMode" class="fill-height" />
			<div v-else class="fill-height" :class="{ 'condition-dimmed': effects.hidden && editMode }">
				<WidgetErrorBoundary :reset-key="widgetKey">
					<!-- DWC-consistent panel chrome: wrap the widget in DWC's own PanelCard (the same v-card +
						 icon/title header bar every built-in panel uses) so custom widgets match built-in ones.
						 Kept as a genuine v-if/v-else (not a shared template) so chrome-off widgets - shape/
						 nestling-oriented controls in particular - get exactly the same bare DOM as before,
						 with zero risk from an extra wrapper div. -->
					<PanelCard v-if="chromeOn" class="fill-height d-flex flex-column" :icon="meta.icon" :title="meta.title">
						<div class="flex-grow-1 flex-chrome-slot">
							<ScaleToFit v-if="fitEnabled">
								<WidgetView :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled || interactionLocked" />
							</ScaleToFit>
							<div v-else-if="autoMeasure" ref="measureRef" class="flex-auto-measure">
								<WidgetView :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled || interactionLocked" />
							</div>
							<WidgetView v-else :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled || interactionLocked" />
						</div>
					</PanelCard>
					<template v-else>
						<ScaleToFit v-if="fitEnabled">
							<WidgetView :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled || interactionLocked" />
						</ScaleToFit>
						<!-- Auto-height (view mode only): render at natural content height in a measuring wrapper
							 so the cell can be resized to fit and the panels below reflow. -->
						<div v-else-if="autoMeasure" ref="measureRef" class="flex-auto-measure">
							<WidgetView :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled || interactionLocked" />
						</div>
						<WidgetView v-else :widget="item.widget" :override-color="effects.color" :disabled="effects.disabled || interactionLocked" />
					</template>

					<!-- Guaranteed interaction block while print-locked or access-restricted (covers widgets
						 that ignore `disabled`). Access takes tooltip precedence when both apply, since it's
						 the broader restriction. -->
					<div v-if="interactionLocked" class="flex-print-lock"
						 :title="accessLocked ? $t('plugins.flexibleLayouts.access.interactionLocked') : $t('plugins.flexibleLayouts.printLock.locked')">
						<v-icon size="x-small">mdi-lock</v-icon>
					</div>

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
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";

import { SETTINGS_SCOPE_KEY } from "@/composables/useComponentSettings";
import { useMachineStore } from "@/stores/machine";

import { buildReport, downloadReport } from "dwc-plugin-runtime";

import type { GridItemModel } from "../model/document";
import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { evaluateConditions } from "../util/conditions";
import { accessLockedFor } from "../model/access";
import { effectiveChromeForItem } from "../util/panelChrome";
import { effectiveLockForItem, isPrintingStatus } from "../util/printLock";
import { describeWidget } from "../widgets/registry";
import ScaleToFit from "../widgets/ScaleToFit.vue";
import WidgetErrorBoundary from "../widgets/WidgetErrorBoundary.vue";
import WidgetView from "../widgets/WidgetView.vue";

const props = defineProps<{ item: GridItemModel; editMode: boolean; rowHeight?: number; selected?: boolean; pageLock?: boolean }>();
const emit = defineEmits<{ remove: []; edit: []; editContents: []; export: []; duplicate: []; toggleLock: []; toggleSelect: []; autoHeight: [number] }>();

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

// Lock-while-printing: block interaction during a print so the machine can't be moved unexpectedly.
// Active only in view mode (edit must always be usable). The page-level flag forces it for every
// widget; otherwise it's the item's explicit choice or the per-widget-type default.
const isPrinting = computed(() => isPrintingStatus((machineStore.model as { state?: { status?: string } }).state?.status));
const printLocked = computed(() =>
	!props.editMode && isPrinting.value
	&& (props.pageLock || effectiveLockForItem(props.item.widget, props.item.lockWhilePrinting)));

// Access-restriction: blocks interaction when the current level (Observer, or Operator without
// `interact`) doesn't grant it. Admin (or no lock configured) always has `interact`, and edit mode
// itself requires Admin, so this is inert whenever editing is actually possible.
const accessLocked = computed(() => !props.editMode && accessLockedFor(props.item.widget));
const interactionLocked = computed(() => printLocked.value || accessLocked.value);

// DWC-consistent panel chrome: wrap the widget in DWC's own PanelCard (see util/panelChrome for the
// per-widget-type default and the reasoning behind it).
const chromeOn = computed(() => effectiveChromeForItem(props.item.widget, props.item.panelChrome));

// Shaped button detection: when a codeButton has a non-rect shape, remove the rectangular
// chrome (no border-radius, no background box) in view mode so the shape itself is the button.
const isShapedButton = computed(() =>
	props.item.widget.type === "codeButton"
	&& !!(props.item.widget as Extract<typeof props.item.widget, { type: "codeButton" }>).shape
	&& (props.item.widget as Extract<typeof props.item.widget, { type: "codeButton" }>).shape!.kind !== "rect");

// Z-index for shaped buttons (so they stack correctly when overlapping).
const itemZStyle = computed((): Record<string, string> => {
	if (!isShapedButton.value || props.editMode) { return {}; }
	const z = (props.item.widget as Extract<typeof props.item.widget, { type: "codeButton" }>).z;
	return z != null ? { zIndex: String(z) } : {};
});

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
	if (t?.fontSize) {
		// Responsive: the configured size is the cap; text scales down with the viewport (to a legible
		// floor) so it stays readable on phones/tablets. ~1200px viewport reproduces the set px size.
		style.fontSize = t.responsive
			? `clamp(${Math.max(10, Math.round(t.fontSize * 0.6))}px, ${(t.fontSize / 12).toFixed(2)}vw, ${t.fontSize}px)`
			: `${t.fontSize}px`;
	}
	if (t?.fontFamily) style.fontFamily = t.fontFamily;
	if (t?.labelFontSize) style["--flex-label-size"] = `${t.labelFontSize}px`;
	if (t?.labelFontFamily) style["--flex-label-family"] = t.labelFontFamily;
	return style;
});

// Scale-to-fit defaults OFF — widgets size to their cell, panels scroll if they overflow. The user
// can turn it on per panel in properties when they'd rather shrink the content to fit.
const fitEnabled = computed(() => props.item.fit ?? false);

// --- Auto-height -----------------------------------------------------------------------------------
// View-mode only (so manual resizing in edit mode is never fought), and not while scale-to-fit owns
// the sizing. The wrapper renders the widget at its natural height; a ResizeObserver on it reports
// that height (independent of the cell's height, so there's no feedback loop) and we ask the parent
// to resize the grid cell to match — which reflows the panels below, like the stock dashboard.
const autoMeasure = computed(() => !!props.item.autoHeight && !props.editMode && !fitEnabled.value);
const measureRef = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;
let raf = 0;

function measure(): void {
	const el = measureRef.value;
	const rh = props.rowHeight ?? 30;
	if (!el || rh <= 0) {
		return;
	}
	cancelAnimationFrame(raf);
	raf = requestAnimationFrame(() => {
		const headerPx = props.editMode ? 28 : 0; // edit header isn't shown in view mode
		// The measured element sits inside PanelCard's slot (below its title bar), so its own height
		// doesn't include the title bar - add a fixed estimate for it when chrome is on.
		const chromePx = chromeOn.value ? 48 : 0;
		const margin = 8; // grid item vertical margin
		const rows = Math.max(1, Math.ceil((el.offsetHeight + headerPx + chromePx + margin) / (rh + margin)));
		if (rows !== props.item.h) {
			emit("autoHeight", rows);
		}
	});
}

function setupObserver(): void {
	ro?.disconnect();
	ro = null;
	if (autoMeasure.value && measureRef.value) {
		ro = new ResizeObserver(() => measure());
		ro.observe(measureRef.value);
		measure();
	}
}
onMounted(setupObserver);
// Runs after the DOM updates (the measure wrapper mounts/unmounts), so the ref is current.
watch(autoMeasure, setupObserver, { flush: "post" });

onBeforeUnmount(() => {
	ro?.disconnect();
	ro = null;
	cancelAnimationFrame(raf);
});
</script>

<style scoped>
/* Auto-height: render the widget at its natural content height so it can be measured. */
.flex-auto-measure {
	width: 100%;
	height: auto;
}

/* Shaped button grid items: remove the rectangular box chrome so the SVG shape shows cleanly.
   The shape itself provides the visual boundary; the bounding-box background is transparent. */
.flex-grid-item.is-shaped-btn {
	background: transparent;
	border-radius: 0;
	outline: none;
}
.flex-grid-item.is-shaped-btn .flex-item-body {
	background: transparent;
	/* Clip the shape to its own tile so it can't bleed across the page; with aspect-correct
	   rendering the shape fits inside the tile, and overlap/nestling works via z-index, not overflow. */
	overflow: hidden;
}

.flex-grid-item {
	display: flex;
	flex-direction: column;
	border-radius: 4px;
	/* Anchor the edit header, which is an overlay (see below) rather than a row that consumes space. */
	position: relative;
}
.flex-grid-item.is-editing {
	outline: 1px dashed rgba(var(--v-theme-primary), 0.6);
	outline-offset: -1px;
}
/* Multi-select highlight: a solid ring so selected panels stand out from the dashed edit outline
   while align/distribute acts on them. */
.flex-grid-item.is-selected {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: -2px;
}
/* The edit-mode modify bar floats OVER the top of the panel instead of pushing the content down, so a
   panel is exactly the same size (and renders identically) in edit and view modes - "like it's not
   there". Semi-transparent so the panel shows through; opaque on hover for easy use. */
.flex-item-header {
	position: absolute;
	top: 0;
	left: 0;
	/* Grow to fit the (now compact) controls but never narrower than the panel; on a narrow panel the
	   bar overhangs to the right rather than clipping the buttons, so panels can be made very small. */
	right: auto;
	width: max-content;
	max-width: 320px;
	min-width: 100%;
	z-index: 4;
	display: flex;
	align-items: center;
	padding: 2px 4px;
	background: rgba(var(--v-theme-surface), 0.5);
	backdrop-filter: blur(2px);
	border-radius: 4px 4px 0 0;
	cursor: move;
	user-select: none;
	min-height: 28px;
	opacity: 0.7;
	transition: opacity 0.12s ease, background 0.12s ease;
}
.flex-item-header:hover {
	opacity: 1;
	background: rgba(var(--v-theme-surface), 0.92);
	z-index: 6;
}
.flex-item-header.is-selected-head {
	box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
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
/* Built-in DWC panels are v-cards whose elevation shadow gives them their "raised panel" look. The
   body normally clips that shadow (flat panels); let it show so they match the stock dashboard. The
   panel's own content is still clipped/scrolled by its inner container, so nothing bleeds out. */
.flex-item-body.is-builtin-panel,
.flex-item-body.is-chrome-panel {
	overflow: visible;
}
/* The chromed PanelCard's slot area is what actually scrolls/clips the widget's own content, now
   that the card's shadow/elevation is allowed to show past `.flex-item-body`. */
.flex-chrome-slot {
	min-height: 0;
	overflow: auto;
}
.flex-item-body.is-inert {
	pointer-events: none;
}
.condition-dimmed {
	opacity: 0.4;
}

/* Print-lock overlay: a transparent layer that swallows clicks (so the widget can't be operated mid
   print) with a faint lock badge in the corner. Sits above the widget but below the edit header. */
.flex-print-lock {
	position: absolute;
	inset: 0;
	z-index: 3;
	cursor: not-allowed;
	display: flex;
	align-items: flex-start;
	justify-content: flex-end;
	padding: 3px;
	background: rgba(var(--v-theme-surface), 0.04);
}
.flex-print-lock .v-icon {
	opacity: 0.45;
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
/* The header colour now also tints the chromed PanelCard's title bar (previously only reached the
   edit-mode drag-handle bar, since there was no view-mode title bar to apply it to). */
.flex-item-body.has-header-color :deep(.v-card-title) {
	background: var(--flex-header);
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
