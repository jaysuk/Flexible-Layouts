<template>
	<v-dialog :model-value="modelValue" max-width="560" scrollable
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

			<v-text-field v-model="search" class="mx-4" density="compact" variant="outlined"
						  prepend-inner-icon="mdi-magnify" hide-details clearable
						  :placeholder="$t('plugins.flexibleLayouts.editor.searchPanels')" />

			<v-card-text style="max-height: 60vh;">
				<v-list>
					<!-- Freeform widgets -->
					<v-list-subheader>{{ $t("plugins.flexibleLayouts.editor.freeform") }}</v-list-subheader>
					<v-list-item v-for="entry in filteredFreeform" :key="entry.type"
								 :prepend-icon="entry.icon" :title="freeformLabel(entry)"
								 @click="chooseFreeform(entry)" />

					<!-- Pages from other installed plugins -->
					<template v-if="filteredPluginPages.length > 0">
						<v-list-subheader>{{ $t("plugins.flexibleLayouts.editor.pluginPages") }}</v-list-subheader>
						<v-list-item v-for="page in filteredPluginPages" :key="page.path ?? page.tabKey"
									 :prepend-icon="page.icon || 'mdi-puzzle'" :title="page.label"
									 :subtitle="page.pluginId ?? page.source" @click="choosePluginPage(page)" />
					</template>

					<!-- Built-in panels -->
					<v-list-subheader>{{ $t("plugins.flexibleLayouts.editor.builtinPanels") }}</v-list-subheader>
					<v-list-item v-for="entry in filteredPanels" :key="entry.component"
								 :prepend-icon="entry.icon" :title="panelLabel(entry)"
								 :subtitle="entry.component" @click="choosePanel(entry)">
						<template #append>
							<v-chip v-if="entry.mode && entry.mode !== 'any'" size="x-small" variant="tonal">
								{{ entry.mode.toUpperCase() }}
							</v-chip>
						</template>
					</v-list-item>

					<v-list-item v-if="filteredPanels.length === 0 && filteredFreeform.length === 0"
								 :title="$t('plugins.flexibleLayouts.editor.noMatches')" disabled />
				</v-list>
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
import {
	BUILTIN_PANELS,
	FREEFORM_WIDGETS,
	type FreeformCatalogEntry,
	type PanelCatalogEntry,
} from "../widgets/registry";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
	"update:modelValue": [boolean];
	add: [{ widget: Widget; size: { w: number; h: number }; configure: boolean }];
	addItem: [GridItemModel];
}>();

const search = ref("");
const error = ref("");
const panelInput = ref<HTMLInputElement | null>(null);

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

const query = computed(() => (search.value ?? "").trim().toLowerCase());

const filteredPanels = computed(() => {
	const q = query.value;
	if (!q) {
		return BUILTIN_PANELS;
	}
	return BUILTIN_PANELS.filter((e) => panelLabel(e).toLowerCase().includes(q) || e.component.toLowerCase().includes(q));
});

const filteredFreeform = computed(() => {
	const q = query.value;
	if (!q) {
		return FREEFORM_WIDGETS;
	}
	return FREEFORM_WIDGETS.filter((e) => freeformLabel(e).toLowerCase().includes(q));
});

const pluginPages = computed(() => listEmbeddablePages());
const filteredPluginPages = computed(() => {
	const q = query.value;
	if (!q) {
		return pluginPages.value;
	}
	return pluginPages.value.filter((p) => p.label.toLowerCase().includes(q) || (p.path ?? p.tabKey ?? "").toLowerCase().includes(q));
});

function choosePanel(entry: PanelCatalogEntry) {
	emit("add", {
		widget: { type: "builtinPanel", component: entry.component },
		size: entry.defaultSize,
		configure: false,
	});
	emit("update:modelValue", false);
}

function chooseFreeform(entry: FreeformCatalogEntry) {
	// Freeform widgets open their properties editor immediately so the user can configure them.
	emit("add", { widget: createDefaultWidget(entry.type), size: entry.defaultSize, configure: true });
	emit("update:modelValue", false);
}

function choosePluginPage(page: EmbeddablePage) {
	emit("add", {
		widget: {
			type: "pluginPage",
			source: page.source,
			path: page.path,
			tabKey: page.tabKey,
			pluginId: page.pluginId,
			label: page.label,
		},
		size: { w: 6, h: 8 },
		configure: false,
	});
	emit("update:modelValue", false);
}
</script>
