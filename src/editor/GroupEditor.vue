<template>
	<v-dialog :model-value="modelValue" max-width="900" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card v-if="draft">
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-group</v-icon>
				{{ $t("plugins.flexibleLayouts.group.editTitle") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="height: 70vh;">
				<div class="d-flex align-center ga-2 mb-2">
					<v-text-field v-model="draft.title" density="compact" variant="outlined" hide-details
								  style="max-width: 260px" :label="$t('plugins.flexibleLayouts.group.name')" />
					<v-btn color="primary" variant="flat" size="small" prepend-icon="mdi-plus"
						   @click="paletteOpen = true">
						{{ $t("plugins.flexibleLayouts.editor.addWidget") }}
					</v-btn>
					<v-spacer />
					<v-chip size="small" variant="tonal">
						{{ $t("plugins.flexibleLayouts.editor.itemCount", { count: draft.items.length }) }}
					</v-chip>
				</div>

				<FlexGrid v-if="draft.items.length > 0" v-model:layout="draft.items"
						  :cols="draft.cols ?? 12" :row-height="draft.rowHeight ?? 30" :edit-mode="true"
						  @remove="removeItem" @edit="openProperties" @export-item="exportChild"
						  @duplicate="duplicateChild" @toggle-lock="toggleChildLock" />
				<v-container v-else class="text-center py-12 text-medium-emphasis">
					<v-icon size="48">mdi-group</v-icon>
					<div>{{ $t("plugins.flexibleLayouts.group.empty") }}</div>
				</v-container>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="primary" @click="save">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>

		<WidgetPalette v-model="paletteOpen" @add="addWidget" @add-item="addItem" />
		<PropertiesDialog v-model="propertiesOpen" :item="editingItem" @save="saveProperties" />
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

import {
	type ConditionRule,
	type GridItemModel,
	type PanelColors,
	type Typography,
	type Widget,
	newItemId,
	reidItem,
} from "../model/document";
import { exportPanel } from "../model/io";
import { describeWidget } from "../widgets/registry";
import FlexGrid from "../page/FlexGrid.vue";
import WidgetPalette from "./WidgetPalette.vue";
import PropertiesDialog from "./PropertiesDialog.vue";

type GroupWidget = Extract<Widget, { type: "group" }>;

const props = defineProps<{ modelValue: boolean; group: GroupWidget | null }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; save: [GroupWidget] }>();

const draft = ref<GroupWidget | null>(null);
const paletteOpen = ref(false);

watch(
	() => props.modelValue,
	(open) => {
		if (open && props.group) {
			draft.value = JSON.parse(JSON.stringify(props.group));
		}
	},
	{ immediate: true },
);

function nextY(): number {
	return (draft.value?.items ?? []).reduce((max, it) => Math.max(max, it.y + it.h), 0);
}

function addWidget(payload: { widget: Widget; size: { w: number; h: number }; configure: boolean }) {
	if (!draft.value) {
		return;
	}
	const item: GridItemModel = {
		i: newItemId(), x: 0, y: nextY(), w: payload.size.w, h: payload.size.h, widget: payload.widget,
	};
	draft.value.items = [...draft.value.items, item];
	if (payload.configure) {
		openProperties(item.i);
	}
}

function addItem(item: GridItemModel) {
	if (draft.value) {
		draft.value.items = [...draft.value.items, { ...item, x: 0, y: nextY() }];
	}
}

function removeItem(id: string) {
	if (draft.value) {
		draft.value.items = draft.value.items.filter((it) => it.i !== id);
	}
}

function exportChild(id: string) {
	const item = draft.value?.items.find((it) => it.i === id);
	if (item) {
		exportPanel(item, describeWidget(item.widget).title);
	}
}

function duplicateChild(id: string) {
	if (!draft.value) {
		return;
	}
	const item = draft.value.items.find((it) => it.i === id);
	if (item) {
		draft.value.items = [...draft.value.items, { ...reidItem(item), x: 0, y: nextY() }];
	}
}

function toggleChildLock(id: string) {
	if (draft.value) {
		draft.value.items = draft.value.items.map((it) => (it.i === id ? { ...it, locked: !it.locked } : it));
	}
}

const propertiesOpen = ref(false);
const editingId = ref<string | null>(null);
const editingItem = ref<GridItemModel | null>(null);

function openProperties(id: string) {
	const item = draft.value?.items.find((it) => it.i === id);
	if (!item) {
		return;
	}
	editingId.value = id;
	editingItem.value = item;
	propertiesOpen.value = true;
}

function saveProperties(payload: { widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; geometry: { x: number; y: number; w: number; h: number } }) {
	if (!draft.value) {
		return;
	}
	draft.value.items = draft.value.items.map((it) =>
		it.i === editingId.value
			? { ...it, widget: payload.widget, conditions: payload.conditions, colors: payload.colors, typography: payload.typography, fit: payload.fit, ...payload.geometry }
			: it);
}

function save() {
	if (draft.value) {
		emit("save", draft.value);
	}
	emit("update:modelValue", false);
}
</script>
