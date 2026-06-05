<template>
	<div class="d-flex align-center ga-1 flex-header-widgets">
		<div v-for="(item, i) in items" :key="item.i" class="header-item" :class="{ editing: editMode }">
			<div v-if="editMode" class="header-item-tools">
				<v-btn icon="mdi-cog" size="x-small" variant="text" density="comfortable" @click="edit(i)" />
				<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable" @click="remove(i)" />
			</div>
			<div class="header-item-body">
				<WidgetView :widget="item.widget" />
			</div>
		</div>

		<v-btn v-if="editMode" icon="mdi-plus" size="x-small" variant="tonal" class="ms-1"
			   :title="$t('plugins.flexibleLayouts.editor.addWidget')" @click="paletteOpen = true" />

		<WidgetPalette v-model="paletteOpen" @add="onAdd" />
		<PropertiesDialog v-model="propsOpen" :item="editingItem" @save="onSave" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import {
	type ConditionRule,
	type GridItemModel,
	type PanelColors,
	type Typography,
	type Widget,
	newItemId,
} from "../model/document";
import { useLayoutStore } from "../model/store";
import { editMode } from "../model/editorState";
import WidgetView from "../widgets/WidgetView.vue";
import WidgetPalette from "../editor/WidgetPalette.vue";
import PropertiesDialog from "../editor/PropertiesDialog.vue";

const store = useLayoutStore();

function headerItems(): Array<GridItemModel> {
	const doc = store.document.value;
	if (!doc.header) {
		doc.header = { items: [] };
	}
	return doc.header.items;
}

const items = computed(() => headerItems());

const paletteOpen = ref(false);
const propsOpen = ref(false);
const editingIndex = ref(-1);
const editingItem = ref<GridItemModel | null>(null);

function onAdd(payload: { widget: Widget; size?: { w: number; h: number }; configure: boolean }) {
	const item: GridItemModel = { i: newItemId(), x: 0, y: 0, w: 2, h: 1, widget: payload.widget };
	headerItems().push(item);
	if (payload.configure) {
		editingIndex.value = headerItems().length - 1;
		editingItem.value = item;
		propsOpen.value = true;
	}
}

function edit(i: number) {
	editingIndex.value = i;
	editingItem.value = headerItems()[i];
	propsOpen.value = true;
}

function onSave(payload: { widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; geometry: { x: number; y: number; w: number; h: number } }) {
	const list = headerItems();
	if (editingIndex.value >= 0 && list[editingIndex.value]) {
		list[editingIndex.value] = {
			...list[editingIndex.value],
			widget: payload.widget,
			conditions: payload.conditions,
			colors: payload.colors,
			typography: payload.typography,
			fit: payload.fit,
		};
	}
}

function remove(i: number) {
	headerItems().splice(i, 1);
}
</script>

<style scoped>
.flex-header-widgets {
	overflow-x: auto;
	max-width: 46vw;
	font-size: 12px;
}
.header-item {
	position: relative;
	height: 48px;
	min-width: 70px;
	max-width: 170px;
	display: flex;
	align-items: center;
	border-radius: 4px;
}
.header-item.editing {
	outline: 1px dashed rgba(var(--v-theme-primary), 0.5);
}
.header-item-body {
	width: 100%;
	height: 100%;
	overflow: hidden;
}
.header-item-tools {
	position: absolute;
	top: -2px;
	right: -2px;
	z-index: 3;
	display: flex;
	background: rgba(var(--v-theme-surface), 0.85);
	border-radius: 4px;
}
</style>
