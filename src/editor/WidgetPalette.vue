<template>
	<v-dialog :model-value="modelValue" max-width="760" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-plus-box-multiple</v-icon>
				{{ $t("plugins.flexibleLayouts.editor.addWidgetTitle") }}
				<v-spacer />
				<v-btn variant="text" size="small" prepend-icon="mdi-upload" @click="pickPanel">
					{{ $t("plugins.flexibleLayouts.io.importPanel") }}
				</v-btn>
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>
			<input ref="panelInput" type="file" accept=".json,application/json" class="d-none" @change="onPanelFile" />
			<v-alert v-if="error" type="error" variant="tonal" density="compact" class="mx-4 mt-2">{{ error }}</v-alert>

			<div class="px-4 pt-1">
				<v-text-field v-model="search" density="compact" variant="outlined" autofocus
							  prepend-inner-icon="mdi-magnify" hide-details clearable
							  :placeholder="$t('plugins.flexibleLayouts.editor.searchPanels')" />
				<v-chip-group v-model="cat" mandatory selected-class="text-primary" class="palette-chips">
					<v-chip v-for="c in chipCategories" :key="c" :value="c" size="small" variant="tonal" filter>
						{{ $t(`plugins.flexibleLayouts.paletteCategory.${c}`) }}
					</v-chip>
				</v-chip-group>
			</div>

			<v-card-text style="max-height: 60vh;">
				<div v-if="!groups.length" class="text-medium-emphasis text-center py-6">
					{{ $t("plugins.flexibleLayouts.editor.noMatches") }}
				</div>
				<template v-for="g in groups" :key="g.cat">
					<div class="palette-section-head">{{ $t(`plugins.flexibleLayouts.paletteCategory.${g.cat}`) }}</div>
					<div class="palette-grid">
						<v-menu v-for="it in g.items" :key="it.id" open-on-hover location="end" origin="auto"
								:open-delay="300" :close-delay="0" :offset="10" :close-on-content-click="false"
								transition="fade-transition">
							<template #activator="{ props: hov }">
								<button v-bind="hov" type="button" class="palette-tile" @click="it.choose()">
									<v-icon size="26" class="palette-tile-icon">{{ it.icon }}</v-icon>
									<span class="palette-tile-label">{{ it.label }}</span>
									<span v-if="it.sub" class="palette-tile-sub">{{ it.sub }}</span>
									<v-chip v-if="it.mode && it.mode !== 'any'" size="x-small" variant="tonal" class="palette-tile-mode">{{ it.mode.toUpperCase() }}</v-chip>
								</button>
							</template>
							<!-- Live, scaled, inert preview of the widget as it would be added -->
							<v-card class="palette-preview" elevation="10">
								<div class="palette-preview-title">{{ it.label }}</div>
								<div class="palette-preview-frame">
									<ScaleToFit v-if="it.previewWidget">
										<div class="palette-preview-content" :style="previewStyle(it.size)">
											<WidgetView :widget="it.previewWidget" />
										</div>
									</ScaleToFit>
									<div v-else class="palette-preview-empty">
										<v-icon size="40">{{ it.icon }}</v-icon>
										<span>{{ $t("plugins.flexibleLayouts.editor.noPreview") }}</span>
									</div>
								</div>
							</v-card>
						</v-menu>
					</div>
				</template>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import i18n from "@/i18n";

import { createDefaultWidget, type GridItemModel, type Widget } from "../model/document";
import { parsePanelFile } from "../model/io";
import { type EmbeddablePage, listEmbeddablePages } from "../model/pluginPages";
import ScaleToFit from "../widgets/ScaleToFit.vue";
import WidgetView from "../widgets/WidgetView.vue";
import {
	BUILTIN_PANELS,
	FREEFORM_WIDGETS,
	type FreeformCatalogEntry,
	type PanelCatalogEntry,
	WIDGET_CATEGORIES,
} from "../widgets/registry";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
	"update:modelValue": [boolean];
	add: [{ widget: Widget; size: { w: number; h: number }; configure: boolean }];
	addItem: [GridItemModel];
}>();

const search = ref("");
const cat = ref<string>("all");
const error = ref("");
const panelInput = ref<HTMLInputElement | null>(null);

// Category order shown as filter chips and section order in the body.
const SECTION_ORDER = [...WIDGET_CATEGORIES, "panels", "plugins"] as const;
const chipCategories = ["all", ...SECTION_ORDER];

function pickPanel() {
	error.value = "";
	panelInput.value?.click();
}

async function onPanelFile(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	input.value = "";
	if (!file) {
		return;
	}
	try {
		const item = parsePanelFile(await file.text());
		emit("addItem", item);
		emit("update:modelValue", false);
	} catch (e) {
		const code = (e as Error).message;
		const key = code === "invalidJson" || code === "notAPanel" ? code : "generic";
		error.value = i18n.global.t(`plugins.flexibleLayouts.io.error.${key}`);
	}
}

function panelLabel(entry: PanelCatalogEntry): string {
	return i18n.global.t(`plugins.flexibleLayouts.${entry.labelKey}`);
}
function freeformLabel(entry: FreeformCatalogEntry): string {
	return i18n.global.t(`plugins.flexibleLayouts.${entry.labelKey}`);
}

function chooseFreeform(entry: FreeformCatalogEntry) {
	// Freeform widgets open their properties editor immediately so the user can configure them.
	emit("add", { widget: createDefaultWidget(entry.type), size: entry.defaultSize, configure: true });
	emit("update:modelValue", false);
}
function choosePanel(entry: PanelCatalogEntry) {
	emit("add", { widget: { type: "builtinPanel", component: entry.component }, size: entry.defaultSize, configure: false });
	emit("update:modelValue", false);
}
function choosePluginPage(page: EmbeddablePage) {
	emit("add", {
		widget: { type: "pluginPage", source: page.source, path: page.path, tabKey: page.tabKey, pluginId: page.pluginId, label: page.label },
		size: { w: 6, h: 8 },
		configure: false,
	});
	emit("update:modelValue", false);
}

interface PaletteItem {
	id: string; icon: string; label: string; sub?: string; mode?: string; category: string;
	choose: () => void;
	/** Representative footprint (grid units) used to size the hover preview. */
	size: { w: number; h: number };
	/** Widget rendered live in the hover preview; omitted = no live preview (e.g. plugin pages). */
	previewWidget?: Widget;
}

// One flat, categorised list of everything that can be added.
const allItems = computed<Array<PaletteItem>>(() => {
	const items: Array<PaletteItem> = [];
	for (const e of FREEFORM_WIDGETS) {
		items.push({ id: `f:${e.type}`, icon: e.icon, label: freeformLabel(e), category: e.category, choose: () => chooseFreeform(e), size: e.defaultSize, previewWidget: createDefaultWidget(e.type) });
	}
	for (const e of BUILTIN_PANELS) {
		items.push({ id: `p:${e.component}`, icon: e.icon, label: panelLabel(e), sub: e.component, mode: e.mode, category: "panels", choose: () => choosePanel(e), size: e.defaultSize, previewWidget: { type: "builtinPanel", component: e.component } });
	}
	for (const p of listEmbeddablePages()) {
		items.push({ id: `x:${p.path ?? p.tabKey}`, icon: p.icon || "mdi-puzzle", label: p.label, sub: p.pluginId ?? p.source, category: "plugins", choose: () => choosePluginPage(p), size: { w: 6, h: 8 } });
	}
	return items;
});

// Pixel footprint for the preview content, derived from the widget's default grid size and clamped.
function previewStyle(size: { w: number; h: number }) {
	const w = Math.min(360, Math.max(140, size.w * 34));
	const h = Math.min(240, Math.max(90, size.h * 26));
	return { width: `${w}px`, height: `${h}px` };
}

const query = computed(() => (search.value ?? "").trim().toLowerCase());
const visible = computed(() => {
	const q = query.value;
	const c = cat.value;
	return allItems.value.filter((it) =>
		(c === "all" || it.category === c) &&
		(!q || it.label.toLowerCase().includes(q) || (it.sub ?? "").toLowerCase().includes(q)));
});
const groups = computed(() =>
	SECTION_ORDER
		.map((c) => ({ cat: c as string, items: visible.value.filter((it) => it.category === c) }))
		.filter((g) => g.items.length > 0));
</script>

<style scoped>
.palette-chips { margin-top: 4px; }
.palette-section-head {
	font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
	color: rgba(var(--v-theme-on-surface), 0.6); margin: 10px 2px 6px;
}
.palette-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 6px; }
.palette-tile {
	display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
	gap: 3px; padding: 10px 6px; min-height: 84px; cursor: pointer; text-align: center;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.12); border-radius: 8px;
	background: rgba(var(--v-theme-on-surface), 0.02); position: relative;
}
.palette-tile:hover { background: rgba(var(--v-theme-primary), 0.1); border-color: rgba(var(--v-theme-primary), 0.5); }
.palette-tile-icon { color: rgb(var(--v-theme-primary)); }
.palette-tile-label { font-size: 0.78rem; font-weight: 500; line-height: 1.15; }
.palette-tile-sub { font-size: 0.62rem; opacity: 0.55; overflow: hidden; text-overflow: ellipsis; max-width: 100%; white-space: nowrap; }
.palette-tile-mode { position: absolute; top: 3px; right: 3px; }

/* Hover preview popover */
.palette-preview { width: 320px; padding: 8px; overflow: hidden; }
.palette-preview-title { font-size: 0.78rem; font-weight: 600; margin-bottom: 6px; opacity: 0.85; }
.palette-preview-frame {
	height: 200px; display: flex; align-items: center; justify-content: center; overflow: hidden;
	background: rgba(var(--v-theme-on-surface), 0.03); border-radius: 6px;
}
/* Inert: the preview is display-only, so hovering/clicking it never actuates a control. */
.palette-preview-content { pointer-events: none; overflow: hidden; }
.palette-preview-empty {
	display: flex; flex-direction: column; align-items: center; gap: 6px;
	color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.72rem;
}
</style>
