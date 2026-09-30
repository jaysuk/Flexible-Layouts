<template>
	<v-dialog :model-value="modelValue" max-width="760" scrollable :attach="props.attach"
			  :aria-label="$t('plugins.flexibleLayouts.tabsEditor.title')"
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card v-if="draft">
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-tab</v-icon>
				{{ $t("plugins.flexibleLayouts.tabsEditor.title") }}
				<v-spacer />
				<v-btn :aria-label="$t('plugins.flexibleLayouts.a11y.close')" icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<v-row dense class="mb-2">
					<v-col cols="12" sm="6">
						<v-text-field v-model="draft.title" density="compact" variant="outlined" hide-details
									  :label="$t('plugins.flexibleLayouts.group.name')" />
					</v-col>
					<v-col cols="12" sm="6">
						<v-select v-model="position" :items="positionItems" density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.tabsEditor.position')" />
					</v-col>
				</v-row>
				<v-switch :model-value="!!draft.collapsible" color="primary" density="compact" hide-details class="tabs-collapsible"
						  :label="$t('plugins.flexibleLayouts.container.collapsible')" @update:model-value="draft.collapsible = $event === true ? true : undefined" />
				<div class="text-caption text-medium-emphasis mb-3">{{ $t("plugins.flexibleLayouts.container.collapsibleHint") }}</div>

				<div class="d-flex align-center mb-1">
					<span class="text-title-small">{{ $t("plugins.flexibleLayouts.tabsEditor.tabs") }}</span>
					<v-spacer />
					<v-btn size="small" variant="tonal" prepend-icon="mdi-plus" class="tab-add" @click="addTab">
						{{ $t("plugins.flexibleLayouts.tabsEditor.addTab") }}
					</v-btn>
				</div>

				<v-sheet v-for="(tab, i) in draft.tabs" :key="tab.id" border rounded class="tab-row pa-2 mb-2" :data-tab="tab.id">
					<div class="d-flex align-center ga-2">
						<IconPicker :model-value="tab.icon ?? ''" fallback="mdi-tab" @update:model-value="tab.icon = $event || undefined" />
						<v-text-field v-model="tab.title" density="compact" variant="outlined" hide-details class="tab-title"
									  :label="$t('plugins.flexibleLayouts.tabsEditor.tabName')" />
						<v-chip size="x-small" variant="tonal" class="flex-shrink-0">{{ $t("plugins.flexibleLayouts.editor.itemCount", { count: tab.items.length }) }}</v-chip>
						<v-btn icon="mdi-arrow-up" size="x-small" variant="text" density="comfortable" class="tab-up" :disabled="i === 0"
							   :title="$t('plugins.flexibleLayouts.a11y.moveUp')" :aria-label="$t('plugins.flexibleLayouts.a11y.moveUp')" @click="move(i, -1)" />
						<v-btn icon="mdi-arrow-down" size="x-small" variant="text" density="comfortable" class="tab-down" :disabled="i === draft.tabs.length - 1"
							   :title="$t('plugins.flexibleLayouts.a11y.moveDown')" :aria-label="$t('plugins.flexibleLayouts.a11y.moveDown')" @click="move(i, 1)" />
						<v-btn icon="mdi-delete" size="x-small" variant="text" density="comfortable" color="error" class="tab-delete" :disabled="draft.tabs.length <= 1"
							   :title="$t('plugins.flexibleLayouts.a11y.delete')" :aria-label="$t('plugins.flexibleLayouts.a11y.delete')" @click="removeTab(i)" />
					</div>
					<div class="d-flex align-center ga-2 mt-2 flex-wrap">
						<v-btn size="small" variant="tonal" prepend-icon="mdi-view-grid-plus" class="tab-contents" @click="editContents(tab.id)">
							{{ $t("plugins.flexibleLayouts.group.editContents") }}
						</v-btn>
						<v-switch :model-value="!!tab.showWhen" color="primary" density="compact" hide-details class="tab-when"
								  :label="$t('plugins.flexibleLayouts.tabsEditor.showWhen')" @update:model-value="setShowWhen(tab, $event === true)" />
					</div>
					<div v-if="tab.showWhen" class="mt-2">
						<OmPathField v-model="tab.showWhen.omPath" :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
						<div class="d-flex ga-2 mt-2">
							<v-select v-model="tab.showWhen.operator" :items="operatorOptions" density="compact" variant="outlined" hide-details
									  style="max-width: 170px" :label="$t('plugins.flexibleLayouts.conditions.operator')" />
							<v-text-field v-if="needsValue(tab.showWhen.operator)" v-model="tab.showWhen.value" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.conditions.value')" />
						</div>
					</div>
				</v-sheet>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="card-actions" class="tabs-save" @click="save">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>

		<GroupEditor v-if="contentsMounted" v-model="contentsOpen" :group="contentsGroup" grid-only @save="saveContents" />
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import i18n from "@/i18n";

import { type ConditionOperator, type TabDef, type Widget, newItemId } from "../model/document";
import { useLazyDialog } from "../composables/useLazyDialog";
import GroupEditor from "./GroupEditor.vue";
import IconPicker from "./IconPicker.vue";
import OmPathField from "./OmPathField.vue";

type TabsWidget = Extract<Widget, { type: "tabs" }>;
type GroupWidget = Extract<Widget, { type: "group" }>;

// `attach` is a plain pass-through to v-dialog's own prop, left unset in real use (tests only).
const props = defineProps<{ modelValue: boolean; widget: TabsWidget | null; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; save: [TabsWidget] }>();

const draft = ref<TabsWidget | null>(null);
watch(
	() => props.modelValue,
	(open) => {
		if (open && props.widget) {
			draft.value = JSON.parse(JSON.stringify(props.widget));
		}
	},
	{ immediate: true },
);

const position = computed({
	get: () => draft.value?.tabPosition ?? "top",
	set: (v: "top" | "bottom" | "left") => { if (draft.value) { draft.value.tabPosition = v === "top" ? undefined : v; } },
});
const positionItems = computed(() => (["top", "bottom", "left"] as const).map((p) => ({ title: i18n.global.t(`plugins.flexibleLayouts.tabsEditor.pos.${p}`), value: p })));

const t = (key: string) => i18n.global.t(`plugins.flexibleLayouts.${key}`);
const operatorOptions = computed<Array<{ title: string; value: ConditionOperator }>>(() => [
	{ title: t("conditions.eq"), value: "eq" }, { title: t("conditions.ne"), value: "ne" }, { title: t("conditions.gt"), value: "gt" },
	{ title: t("conditions.lt"), value: "lt" }, { title: t("conditions.gte"), value: "gte" }, { title: t("conditions.lte"), value: "lte" },
	{ title: t("conditions.contains"), value: "contains" }, { title: t("conditions.truthy"), value: "truthy" }, { title: t("conditions.falsy"), value: "falsy" },
]);
const needsValue = (op: ConditionOperator) => op !== "truthy" && op !== "falsy";

function addTab() {
	if (!draft.value) { return; }
	const n = draft.value.tabs.length + 1;
	draft.value.tabs.push({ id: newItemId(), title: `${t("tabsEditor.defaultTabName")} ${n}`, items: [] });
}
function removeTab(i: number) {
	if (draft.value && draft.value.tabs.length > 1) { draft.value.tabs.splice(i, 1); }
}
function move(i: number, delta: -1 | 1) {
	const tabs = draft.value?.tabs;
	const j = i + delta;
	if (!tabs || j < 0 || j >= tabs.length) { return; }
	[tabs[i], tabs[j]] = [tabs[j], tabs[i]];
}
function setShowWhen(tab: TabDef, on: boolean) {
	tab.showWhen = on ? { omPath: "", operator: "eq", value: "" } : undefined;
}

// ---- a tab's contents: the existing group editor, pointed at one tab's item list ----------------------
const contentsOpen = ref(false);
const contentsMounted = useLazyDialog(contentsOpen);
const contentsTabId = ref<string | null>(null);
const contentsGroup = ref<GroupWidget | null>(null);

function editContents(tabId: string) {
	const tab = draft.value?.tabs.find((x) => x.id === tabId);
	if (!draft.value || !tab) { return; }
	contentsTabId.value = tabId;
	contentsGroup.value = { type: "group", title: tab.title, items: tab.items, cols: draft.value.cols ?? 12, rowHeight: draft.value.rowHeight ?? 30 };
	contentsOpen.value = true;
}
function saveContents(group: GroupWidget) {
	const tab = draft.value?.tabs.find((x) => x.id === contentsTabId.value);
	if (tab) { tab.items = group.items; }
}

function save() {
	if (draft.value) { emit("save", draft.value); }
	emit("update:modelValue", false);
}
</script>
