<template>
	<v-dialog :model-value="modelValue" max-width="640" scrollable
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-file-tree</v-icon>
				{{ $t("plugins.flexibleLayouts.pages.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable"
					   @click="emit('update:modelValue', false)" />
			</v-card-title>

			<v-card-text style="max-height: 70vh;">
				<!-- Startup page: which route opens when this profile/layout loads -->
				<div class="d-flex align-center mb-4 ga-2">
					<v-icon size="small">mdi-home-import-outline</v-icon>
					<v-select v-model="startupPath" :items="startupItems" density="compact" variant="outlined"
							  hide-details clearable class="flex-grow-1"
							  :label="$t('plugins.flexibleLayouts.pages.startupPage')"
							  :hint="$t('plugins.flexibleLayouts.pages.startupPageHint')" persistent-hint />
				</div>

				<!-- Job-start page: jump here when a print starts (supplements DWC's switch-to-Job setting) -->
				<div class="d-flex align-center mb-4 ga-2">
					<v-icon size="small">mdi-play-box-outline</v-icon>
					<v-select v-model="jobStartPath" :items="jobStartItems" density="compact" variant="outlined"
							  hide-details clearable class="flex-grow-1"
							  :label="$t('plugins.flexibleLayouts.pages.jobStartPage')"
							  :hint="$t('plugins.flexibleLayouts.pages.jobStartPageHint')" persistent-hint />
				</div>

				<!-- Add a new page -->
				<v-sheet class="pa-3 mb-4 rounded" border>
					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.pages.addNew") }}</div>
					<v-row dense>
						<v-col cols="12" sm="5">
							<v-text-field v-model="newTitle" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.pages.pageName')" />
						</v-col>
						<v-col cols="12" sm="4">
							<IconPicker v-model="newIcon" />
						</v-col>
						<v-col cols="12" sm="3">
							<v-select v-model="newCategory" :items="categoryItems" density="compact"
									  variant="outlined" hide-details
									  :label="$t('plugins.flexibleLayouts.pages.category')" />
						</v-col>
						<v-col v-if="newCategory === NEW_SECTION" cols="12">
							<v-text-field v-model="newSectionName" density="compact" variant="outlined" hide-details
										  :label="$t('plugins.flexibleLayouts.pages.newSectionName')" autofocus />
						</v-col>
					</v-row>
					<div class="d-flex justify-end mt-2 ga-2">
						<v-btn variant="text" size="small" prepend-icon="mdi-upload" @click="requestImport">
							{{ $t("plugins.flexibleLayouts.io.importPage") }}
						</v-btn>
						<v-btn color="primary" size="small" prepend-icon="mdi-plus"
							   :disabled="!newTitle.trim()" @click="onAdd">
							{{ $t("plugins.flexibleLayouts.pages.create") }}
						</v-btn>
					</div>
				</v-sheet>

				<!-- Existing nav items, grouped by menu section (matching the drawer). Reordering is
					 constrained within a section so it stays consistent with how the shell renders. -->
				<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.pages.allPages") }}</div>
				<v-list density="compact">
					<template v-for="group in grouped" :key="group.key">
						<v-list-subheader>{{ group.label }}</v-list-subheader>
						<v-list-item v-for="(item, index) in group.items" :key="item.path"
									 :prepend-icon="item.icon" :title="caption(item)"
									 :class="{ 'text-medium-emphasis': hidden(item.path) }">
							<template #append>
								<div class="d-flex align-center">
									<v-btn icon="mdi-arrow-up" size="x-small" variant="text" density="comfortable"
										   :disabled="index === 0" @click="move(group.key, index, -1)" />
									<v-btn icon="mdi-arrow-down" size="x-small" variant="text" density="comfortable"
										   :disabled="index === group.items.length - 1" @click="move(group.key, index, 1)" />
									<v-btn :icon="hidden(item.path) ? 'mdi-eye-off' : 'mdi-eye'" size="x-small"
										   variant="text" density="comfortable"
										   :color="hidden(item.path) ? 'warning' : undefined"
										   :title="hidden(item.path)
											   ? $t('plugins.flexibleLayouts.pages.show')
											   : $t('plugins.flexibleLayouts.pages.hide')"
										   @click="toggleHidden(item.path)" />
									<v-btn icon="mdi-eye-check" size="x-small" variant="text" density="comfortable"
										   :color="hasCondition(item.path) ? 'primary' : undefined"
										   :title="$t('plugins.flexibleLayouts.pages.condition')"
										   @click="openCond(item)" />
									<v-btn v-if="hasLayout(item.path)" icon="mdi-content-save" size="x-small"
										   variant="text" density="comfortable"
										   :title="$t('plugins.flexibleLayouts.io.exportPage')"
										   @click="onExportPage(item)" />
									<v-btn v-if="isCustom(item.path)" icon="mdi-pencil" size="x-small" variant="text"
										   density="comfortable" :title="$t('plugins.flexibleLayouts.pages.rename')"
										   @click="startEdit(item)" />
									<v-btn v-if="isCustom(item.path)" icon="mdi-delete" size="x-small" variant="text"
										   density="comfortable" color="error"
										   :title="$t('plugins.flexibleLayouts.pages.delete')" @click="onDelete(item)" />
								</div>
							</template>
						</v-list-item>
					</template>
				</v-list>
			</v-card-text>
		</v-card>

		<!-- Delete page confirmation -->
		<v-dialog v-model="deleteOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pages.delete") }}</v-card-title>
				<v-card-text>{{ $t("plugins.flexibleLayouts.pages.deleteConfirm", { name: deleteName }) }}</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="deleteOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="error" @click="confirmDelete">{{ $t("plugins.flexibleLayouts.pages.delete") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Page visibility condition -->
		<v-dialog v-model="condOpen" max-width="460">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pages.condition") }}</v-card-title>
				<v-card-text>
					<div class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.pages.conditionHelp") }}
					</div>
					<OmPathField v-model="condRule.omPath" class="mb-2"
								 :label="$t('plugins.flexibleLayouts.conditions.omPath')" />
					<div class="d-flex ga-2">
						<v-select v-model="condRule.operator" :items="operatorItems" density="compact"
								  variant="outlined" hide-details style="max-width: 180px"
								  :label="$t('plugins.flexibleLayouts.conditions.operator')" />
						<v-text-field v-if="condNeedsValue" v-model="condRule.value" density="compact"
									  variant="outlined" hide-details
									  :label="$t('plugins.flexibleLayouts.conditions.value')" />
					</div>
				</v-card-text>
				<v-card-actions>
					<v-btn variant="text" color="error" @click="clearCond">{{ $t("plugins.flexibleLayouts.pages.conditionClear") }}</v-btn>
					<v-spacer />
					<v-btn variant="text" @click="condOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="card-actions" @click="saveCond">{{ $t("generic.ok") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Rename sub-dialog -->
		<v-dialog v-model="editOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pages.rename") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="editTitle" density="compact" variant="outlined"
								  :label="$t('plugins.flexibleLayouts.pages.pageName')" autofocus class="mb-2" />
					<IconPicker v-model="editIcon" class="mb-2" />
					<v-select v-model="editCategory" :items="categoryItems" density="compact" variant="outlined"
							  hide-details :label="$t('plugins.flexibleLayouts.pages.category')" />
					<v-text-field v-if="editCategory === NEW_SECTION" v-model="editSectionName" class="mt-2"
								  density="compact" variant="outlined" hide-details
								  :label="$t('plugins.flexibleLayouts.pages.newSectionName')" />
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="editOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="card-actions" :disabled="!editTitle.trim()" @click="saveEdit">
						{{ $t("generic.ok") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import i18n from "@/i18n";
import { type MenuItem, useMenuStore } from "@/stores/menu";

import type { ConditionRule } from "../model/document";

import {
	applyNavOrder,
	addCustomCategory,
	createCustomPage,
	CUSTOM_PAGE_PREFIX,
	deleteCustomPage,
	isHidden,
	listCategories,
	renameCustomPage,
	setHidden,
	setNavOrder,
} from "../model/pageManager";
import { exportPage } from "../model/io";
import { useLayoutStore } from "../model/store";
import IconPicker from "./IconPicker.vue";
import OmPathField from "./OmPathField.vue";

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; "open-import": [] }>();

const menuStore = useMenuStore();
const router = useRouter();
const store = useLayoutStore();

const NEW_SECTION = "__new__";
const newTitle = ref("");
const newIcon = ref("mdi-view-dashboard-outline");
const newCategory = ref<string>("control");
const newSectionName = ref("");
// Importing a page is handled by the shared Backup & share dialog (same mechanism for layouts, pages,
// panels and BtnCmd files: additive by default, with a pre-import backup). We just open it.
function requestImport(): void {
	emit("open-import");
	emit("update:modelValue", false);
}

// Startup page: the route opened when this layout/profile becomes active (see FlexShell). The empty
// option (cleared) restores the normal landing page.
const startupPath = computed<string | undefined>({
	get: () => store.document.value.startupPath,
	set: (v) => { store.document.value.startupPath = v || undefined; },
});
const startupItems = computed(() => [
	{ title: i18n.global.t("plugins.flexibleLayouts.pages.startupDefault"), value: undefined },
	...allNavItems.value.map((i) => ({ title: caption(i), value: i.path })),
]);

// Page to jump to when a print/job starts (empty = don't change page).
const jobStartPath = computed<string | undefined>({
	get: () => store.document.value.jobStartPath,
	set: (v) => { store.document.value.jobStartPath = v || undefined; },
});
const jobStartItems = computed(() => [
	{ title: i18n.global.t("plugins.flexibleLayouts.pages.jobStartNone"), value: undefined },
	...allNavItems.value.map((i) => ({ title: caption(i), value: i.path })),
]);

function hasLayout(path: string): boolean {
	const page = store.getPage(path);
	return !!page && page.items.length > 0;
}

function onExportPage(item: MenuItem) {
	exportPage(item.path, caption(item));
}

// #region Page visibility condition
const condOpen = ref(false);
const condPath = ref("");
const condRule = ref<ConditionRule>({ omPath: "", operator: "truthy" });

const operatorItems = computed(() =>
	(["eq", "ne", "gt", "lt", "gte", "lte", "contains", "truthy", "falsy"] as const)
		.map((op) => ({ title: i18n.global.t(`plugins.flexibleLayouts.conditions.${op}`), value: op })));

const condNeedsValue = computed(() => condRule.value.operator !== "truthy" && condRule.value.operator !== "falsy");

function hasCondition(path: string): boolean {
	return !!store.getPage(path)?.showWhen?.omPath;
}

function openCond(item: MenuItem) {
	condPath.value = item.path;
	const existing = store.getPage(item.path)?.showWhen;
	condRule.value = existing ? JSON.parse(JSON.stringify(existing)) : { omPath: "", operator: "truthy" };
	condOpen.value = true;
}

function pageKind(path: string): "custom" | "override" {
	return isCustom(path) ? "custom" : "override";
}

function saveCond() {
	const page = store.ensurePage(condPath.value, pageKind(condPath.value));
	page.showWhen = condRule.value.omPath.trim() ? condRule.value : undefined;
	condOpen.value = false;
}

function clearCond() {
	const page = store.getPage(condPath.value);
	if (page) {
		page.showWhen = undefined;
	}
	condOpen.value = false;
}
// #endregion


// Built-in + custom sections, plus a "new section" entry that reveals a name field.
const categoryItems = computed(() => [
	...listCategories().map((c) => ({ title: c.name, value: c.key })),
	{ title: i18n.global.t("plugins.flexibleLayouts.pages.addSection"), value: NEW_SECTION },
]);

/** Resolve a section selection to a real category key, creating a custom section for "new". */
function resolveCategory(selected: string, sectionName: string): string | null {
	if (selected !== NEW_SECTION) {
		return selected;
	}
	const name = sectionName.trim();
	return name ? addCustomCategory(name) : null;
}

function caption(item: MenuItem): string {
	return item.translated ? item.caption : i18n.global.t(item.caption);
}

function isCustom(path: string): boolean {
	return path.startsWith(CUSTOM_PAGE_PREFIX);
}

function hidden(path: string): boolean {
	return isHidden(path);
}

// All nav items, unfiltered (so hidden ones still appear here to be unhidden), deduped by path.
const allNavItems = computed<Array<MenuItem>>(() => {
	const map = new Map<string, MenuItem>();
	for (const item of [...menuStore.routeItems, ...menuStore.pluginItems]) {
		if (!map.has(item.path)) {
			map.set(item.path, item);
		}
	}
	return [...map.values()];
});

interface NavGroup { key: string; label: string; items: Array<MenuItem> }

// Items grouped by menu section, in category order, each section ordered by the persisted nav
// order. Mirrors how the shell's drawer renders, so reorder here matches reorder there.
const grouped = computed<Array<NavGroup>>(() => {
	const byCat = new Map<string, Array<MenuItem>>();
	for (const item of allNavItems.value) {
		if (!byCat.has(item.category)) {
			byCat.set(item.category, []);
		}
		byCat.get(item.category)!.push(item);
	}
	const categories = menuStore.categories.slice().sort((a, b) => a.order - b.order);
	const groups: Array<NavGroup> = [];
	for (const cat of categories) {
		const items = byCat.get(cat.key);
		if (!items || items.length === 0) {
			continue;
		}
		const byPath = new Map(items.map((i) => [i.path, i]));
		const ordered = applyNavOrder(items.map((i) => i.path)).map((p) => byPath.get(p)!).filter(Boolean);
		groups.push({ key: cat.key, label: i18n.global.t(cat.captionKey), items: ordered });
	}
	return groups;
});

function move(categoryKey: string, index: number, dir: -1 | 1) {
	const group = grouped.value.find((g) => g.key === categoryKey);
	if (!group) {
		return;
	}
	const paths = group.items.map((i) => i.path);
	const target = index + dir;
	if (target < 0 || target >= paths.length) {
		return;
	}
	[paths[index], paths[target]] = [paths[target], paths[index]];
	// Write a complete, total order across every section so the shell reproduces it exactly.
	const full: Array<string> = [];
	for (const g of grouped.value) {
		full.push(...(g.key === categoryKey ? paths : g.items.map((i) => i.path)));
	}
	setNavOrder(full);
}

function toggleHidden(path: string) {
	setHidden(path, !isHidden(path));
}

function onAdd() {
	const title = newTitle.value.trim();
	if (!title) {
		return;
	}
	const category = resolveCategory(newCategory.value, newSectionName.value);
	if (category === null) {
		return; // "new section" chosen but no name given
	}
	const path = createCustomPage({ title, icon: newIcon.value.trim() || undefined, category });
	newTitle.value = "";
	newIcon.value = "mdi-view-dashboard-outline";
	newCategory.value = "control";
	newSectionName.value = "";
	emit("update:modelValue", false);
	router.push(path);
}

const deleteOpen = ref(false);
const deletePath = ref("");
const deleteName = ref("");
function onDelete(item: MenuItem) {
	deletePath.value = item.path;
	deleteName.value = caption(item);
	deleteOpen.value = true;
}
function confirmDelete() {
	deleteCustomPage(deletePath.value);
	deleteOpen.value = false;
}

// Rename / move sub-dialog
const editOpen = ref(false);
const editPath = ref("");
const editTitle = ref("");
const editIcon = ref("");
const editCategory = ref<string>("control");
const editSectionName = ref("");

function startEdit(item: MenuItem) {
	editPath.value = item.path;
	editTitle.value = item.translated ? item.caption : i18n.global.t(item.caption);
	editIcon.value = item.icon;
	editCategory.value = store.getPage(item.path)?.category ?? item.category ?? "control";
	editSectionName.value = "";
	editOpen.value = true;
}

function saveEdit() {
	const category = resolveCategory(editCategory.value, editSectionName.value);
	if (category === null) {
		return; // "new section" chosen but no name given
	}
	renameCustomPage(editPath.value, editTitle.value.trim(), editIcon.value.trim() || undefined, category);
	editOpen.value = false;
}
</script>
