<template>
	<div class="flex-page" :style="backgroundStyle">
		<!-- Edit toolbar. Shown only while editing; editing is always entered from the shell's top-bar
			 Edit button (the single entry point), so no standalone edit button floats over the page. -->
		<div v-if="editMode" class="flex-page-toolbar">
			<v-btn :color="editMode ? 'primary' : undefined" :variant="editMode ? 'flat' : 'tonal'"
				   size="small" :prepend-icon="editMode ? 'mdi-check' : 'mdi-pencil-ruler'"
				   @click="attemptToggleEdit">
				{{ editMode
					? $t("plugins.flexibleLayouts.shell.done")
					: $t("plugins.flexibleLayouts.editor.editLayout") }}
			</v-btn>
			<v-btn v-if="editMode" color="primary" variant="flat" size="small" prepend-icon="mdi-plus"
				   @click="paletteOpen = true">
				{{ $t("plugins.flexibleLayouts.editor.addWidget") }}
			</v-btn>
			<v-btn v-if="editMode" variant="tonal" size="small" prepend-icon="mdi-cog"
				   @click="bgDialogOpen = true">
				{{ $t("plugins.flexibleLayouts.pageSettings.button") }}
			</v-btn>
			<v-btn v-if="editMode" icon="mdi-undo" size="small" variant="text" :disabled="!canUndo"
				   :title="$t('plugins.flexibleLayouts.editor.undo')" @click="undo" />
			<v-btn v-if="editMode" icon="mdi-redo" size="small" variant="text" :disabled="!canRedo"
				   :title="$t('plugins.flexibleLayouts.editor.redo')" @click="redo" />
			<v-btn v-if="editMode" icon="mdi-view-compact-outline" size="small" variant="text"
				   :disabled="layout.length < 2"
				   :title="$t('plugins.flexibleLayouts.editor.rearrange')" @click="rearrangeAll" />
			<v-spacer />
			<v-btn-toggle v-if="editMode" v-model="editingBp" mandatory density="compact" variant="outlined"
						  divided class="me-2">
				<v-btn v-for="bp in bpOptions" :key="bp.value" :value="bp.value" :icon="bp.icon" size="small"
					   :title="bp.title" />
			</v-btn-toggle>
			<v-chip v-if="editMode && inheritsLarger" size="small" variant="tonal" color="info" class="me-2">
				{{ $t("plugins.flexibleLayouts.responsive.inherits") }}
			</v-chip>
			<v-btn v-if="editMode && activeBp !== 'lg' && !inheritsLarger" size="small" variant="text"
				   color="warning" prepend-icon="mdi-backup-restore" class="me-2" @click="resetBreakpoint">
				{{ $t("plugins.flexibleLayouts.responsive.resetInherit") }}
			</v-btn>
			<v-chip v-if="editMode" size="small" variant="tonal">
				{{ $t("plugins.flexibleLayouts.editor.itemCount", { count: layout.length }) }}
			</v-chip>
		</div>

		<!-- Live grid -->
		<FlexGrid v-if="layout.length > 0" v-model:layout="layout"
				  :cols="grid.cols" :row-height="grid.rowHeight" :edit-mode="editMode"
				  @changed="onLayoutUpdated" @remove="removeItem" @edit="openProperties"
				  @edit-contents="openGroupEditor" @export-item="exportPanelById"
				  @duplicate="duplicateItem" @toggle-lock="toggleLock" />

		<!-- Empty page: render the built-in fallback when not editing, else prompt to add. -->
		<template v-else>
			<component v-if="!editMode && fallback" :is="fallback" />

			<!-- First-edit choice on a page that has stock content: start blank or adopt it. -->
			<v-container v-else-if="editMode && seed && !seedDismissed" class="text-center py-12">
				<v-icon size="64" color="medium-emphasis" class="mb-4">mdi-view-dashboard-edit</v-icon>
				<div class="text-title-medium mb-2">{{ $t("plugins.flexibleLayouts.editor.seedTitle") }}</div>
				<div class="text-body-2 text-medium-emphasis mb-4">{{ $t("plugins.flexibleLayouts.editor.seedHelp") }}</div>
				<div class="d-flex justify-center ga-3">
					<v-btn color="primary" prepend-icon="mdi-import" @click="applySeed">
						{{ $t("plugins.flexibleLayouts.editor.seedUseCurrent") }}
					</v-btn>
					<v-btn variant="tonal" prepend-icon="mdi-file-outline" @click="seedDismissed = true">
						{{ $t("plugins.flexibleLayouts.editor.seedStartBlank") }}
					</v-btn>
				</div>
			</v-container>

			<v-container v-else class="text-center py-12">
				<v-icon size="64" color="medium-emphasis" class="mb-4">mdi-view-dashboard-outline</v-icon>
				<div class="text-title-medium mb-2">
					{{ editMode
						? $t("plugins.flexibleLayouts.editor.emptyEditing")
						: $t("plugins.flexibleLayouts.editor.emptyView") }}
				</div>
				<v-btn v-if="editMode" color="primary" prepend-icon="mdi-plus" @click="paletteOpen = true">
					{{ $t("plugins.flexibleLayouts.editor.addFirstWidget") }}
				</v-btn>
			</v-container>
		</template>

		<WidgetPalette v-model="paletteOpen" @add="addWidget" @add-item="addItem" />
		<PropertiesDialog v-model="propertiesOpen" :item="editingItem" @save="saveProperties" />
		<GroupEditor v-model="groupEditorOpen" :group="editingGroup" @save="saveGroup" />

		<!-- Reset-to-default: choose which breakpoint(s) to clear -->
		<v-dialog v-model="resetDialogOpen" max-width="440">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pageSettings.resetTitle") }}</v-card-title>
				<v-card-text>
					<div class="text-body-2 text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.pageSettings.resetHelp") }}
					</div>
					<v-radio-group v-model="resetTarget" hide-details>
						<v-radio v-for="o in resetOptions" :key="o.value" :value="o.value" :label="o.label" />
					</v-radio-group>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="resetDialogOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="error" prepend-icon="mdi-backup-restore" @click="confirmReset">
						{{ $t("plugins.flexibleLayouts.pageSettings.reset") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Page settings (grid + background) -->
		<v-dialog v-model="bgDialogOpen" max-width="440">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.pageSettings.title") }}</v-card-title>
				<v-card-text>
					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.pageSettings.grid") }}</div>
					<v-row dense class="mb-3">
						<v-col cols="6">
							<v-text-field :model-value="grid.cols" type="number" density="compact" variant="outlined"
										  hide-details :label="$t('plugins.flexibleLayouts.pageSettings.columns')"
										  @update:model-value="setGridCols" />
						</v-col>
						<v-col cols="6">
							<v-text-field :model-value="grid.rowHeight" type="number" density="compact" variant="outlined"
										  hide-details :label="$t('plugins.flexibleLayouts.pageSettings.rowHeight')" suffix="px"
										  @update:model-value="setGridRowHeight" />
						</v-col>
					</v-row>
					<div class="text-title-small mb-2">{{ $t("plugins.flexibleLayouts.background.title") }}</div>
					<div class="d-flex align-center mb-3 ga-3">
						<input type="color" class="flex-bg-color" :value="bgColor || '#222222'"
							   @input="setBgColor(($event.target as HTMLInputElement).value)" />
						<span class="flex-grow-1">{{ $t("plugins.flexibleLayouts.background.color") }}</span>
						<v-btn v-if="bgColor" icon="mdi-close" size="x-small" variant="text" @click="setBgColor(undefined)" />
					</div>
					<v-text-field :model-value="bgImage" density="compact" variant="outlined" hide-details clearable
								  class="mb-2" :label="$t('plugins.flexibleLayouts.background.image')" placeholder="https://…"
								  @update:model-value="setBgImage" />
					<v-select v-if="bgImage" :model-value="bgSize" :items="bgSizeOptions" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.background.size')"
							  @update:model-value="setBgSize" />
				</v-card-text>
				<v-card-actions>
					<v-btn variant="text" color="error" prepend-icon="mdi-backup-restore" @click="openResetDialog">
						{{ $t("plugins.flexibleLayouts.pageSettings.reset") }}
					</v-btn>
					<v-spacer />
					<v-btn color="primary" @click="bgDialogOpen = false">{{ $t("generic.close") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";

import i18n from "@/i18n";

import { type Breakpoint, type ConditionRule, type GridItemModel, type PageLayout, type PanelColors, type Typography, type Widget, newItemId, reidItem } from "../model/document";
import { useLayoutStore } from "../model/store";
import { useFlexDisplay } from "../composables/useFlexDisplay";
import { recomputeDependencies } from "../model/dependencies";
import { exportPanel } from "../model/io";
import { attemptToggleEdit, editMode } from "../model/editorState";
import { describeWidget } from "../widgets/registry";
import FlexGrid from "./FlexGrid.vue";
import WidgetPalette from "../editor/WidgetPalette.vue";
import PropertiesDialog from "../editor/PropertiesDialog.vue";
import GroupEditor from "../editor/GroupEditor.vue";

const props = defineProps<{
	/** Document key for this page - a route path (`/`, `/Console`) or a custom-page id. */
	pageId: string;
	/** "override" for an editable copy of a built-in page, "custom" for a user-created page. */
	kind?: PageLayout["kind"];
	/** Built-in component to show when this page has no saved layout and we're not editing. */
	fallback?: Component;
	/** Editable approximation of the stock content, offered as "use current layout" on first edit. */
	seed?: () => Array<GridItemModel>;
}>();

const store = useLayoutStore();
const paletteOpen = ref(false);

// #region Page background
const bgDialogOpen = ref(false);
const pageBg = computed(() => store.getPage(props.pageId)?.background);
const bgColor = computed(() => pageBg.value?.color);
const bgImage = computed(() => pageBg.value?.image);
const bgSize = computed(() => pageBg.value?.size ?? "cover");
const bgSizeOptions = computed(() => [
	{ title: i18n.global.t("plugins.flexibleLayouts.background.cover"), value: "cover" },
	{ title: i18n.global.t("plugins.flexibleLayouts.background.contain"), value: "contain" },
	{ title: i18n.global.t("plugins.flexibleLayouts.background.tile"), value: "auto" },
]);

function updateBg(patch: Partial<NonNullable<PageLayout["background"]>>) {
	const current = store.getPage(props.pageId)?.background ?? {};
	store.setPageBackground(props.pageId, props.kind ?? "custom", { ...current, ...patch });
}
function setGridCols(v: string) {
	const cols = Math.max(1, Math.min(48, Math.round(Number(v) || 12)));
	grid.value = { ...grid.value, cols };
	store.ensurePage(props.pageId, props.kind ?? "custom").grid = { ...grid.value };
}
function setGridRowHeight(v: string) {
	const rowHeight = Math.max(5, Math.min(200, Math.round(Number(v) || 30)));
	grid.value = { ...grid.value, rowHeight };
	store.ensurePage(props.pageId, props.kind ?? "custom").grid = { ...grid.value };
}

function resetBreakpoint() {
	if (activeBp.value === "lg") {
		return;
	}
	const page = store.getPage(props.pageId);
	if (page?.variants) {
		delete page.variants[activeBp.value];
	}
	load();
}

// "Return to default": clear widgets and revert to the stock fallback (built-in pages) or empty
// (custom pages). The user picks the scope - a single breakpoint, or everything.
const resetDialogOpen = ref(false);
const resetTarget = ref<Breakpoint | "all">("lg");
const resetOptions = computed(() => [
	{ value: "lg", label: i18n.global.t("plugins.flexibleLayouts.responsive.desktop") },
	{ value: "md", label: i18n.global.t("plugins.flexibleLayouts.responsive.tablet") },
	{ value: "sm", label: i18n.global.t("plugins.flexibleLayouts.responsive.phone") },
	{ value: "all", label: i18n.global.t("plugins.flexibleLayouts.pageSettings.resetAll") },
]);

function openResetDialog() {
	resetTarget.value = activeBp.value;
	resetDialogOpen.value = true;
}

function confirmReset() {
	if (resetTarget.value === "all") {
		store.clearPageLayout(props.pageId);
	} else {
		store.clearBreakpoint(props.pageId, resetTarget.value);
	}
	resetDialogOpen.value = false;
	bgDialogOpen.value = false;
	load();
}

function setBgColor(v: string | undefined) { updateBg({ color: v || undefined }); }
function setBgImage(v: string | null) { updateBg({ image: v || undefined }); }
function setBgSize(v: "cover" | "contain" | "auto") { updateBg({ size: v }); }

const backgroundStyle = computed(() => {
	const bg = pageBg.value;
	if (!bg) {
		return {};
	}
	const s: Record<string, string> = {};
	if (bg.color) {
		s.backgroundColor = bg.color;
	}
	if (bg.image) {
		s.backgroundImage = `url("${bg.image}")`;
		s.backgroundSize = bg.size ?? "cover";
		s.backgroundPosition = "center";
		s.backgroundRepeat = bg.size === "auto" ? "repeat" : "no-repeat";
	}
	return s;
});
// #endregion

// Local working copy of the layout. grid-layout-plus mutates item geometry in place during
// drag/resize; we persist back to the store (debounced) on every layout-updated. Keeping a local
// copy (rather than binding the store array directly) avoids writing to the persisted settings -
// and triggering the board-side settings save - on every animation frame of a drag.
const layout = ref<Array<GridItemModel>>([]);
const grid = ref({ cols: 12, rowHeight: 30 });

// Responsive breakpoints. While viewing, the layout follows the actual viewport width; while
// editing, it follows the breakpoint the user has selected to edit (so a phone layout can be
// arranged on a desktop). lg = base/desktop, md = tablet, sm = phone.
const { smAndUp, mdAndUp } = useFlexDisplay();
const currentBp = computed<Breakpoint>(() => (mdAndUp.value ? "lg" : smAndUp.value ? "md" : "sm"));
const editingBp = ref<Breakpoint>("lg");
const activeBp = computed<Breakpoint>(() => (editMode.value ? editingBp.value : currentBp.value));
const bpOptions = computed(() => [
	{ value: "lg", icon: "mdi-monitor", title: i18n.global.t("plugins.flexibleLayouts.responsive.desktop") },
	{ value: "md", icon: "mdi-tablet", title: i18n.global.t("plugins.flexibleLayouts.responsive.tablet") },
	{ value: "sm", icon: "mdi-cellphone", title: i18n.global.t("plugins.flexibleLayouts.responsive.phone") },
]);
const inheritsLarger = computed(() => {
	const page = store.getPage(props.pageId);
	if (!page) {
		return false;
	}
	return (activeBp.value === "md" && !page.variants?.md)
		|| (activeBp.value === "sm" && !page.variants?.sm);
});

// When entering edit mode, start editing whatever breakpoint we're actually on.
watch(editMode, (on) => { if (on) { editingBp.value = currentBp.value; } });

// Undo/redo state must be declared BEFORE load() runs: the immediate watch below calls load() ->
// resetHistory() during setup, so `lastSnapshot` & the stacks have to be initialised by then
// (otherwise a temporal-dead-zone ReferenceError throws and the whole page renders blank).
const MAX_HISTORY = 60;
const undoStack = ref<Array<string>>([]);
const redoStack = ref<Array<string>>([]);
let lastSnapshot = "[]";
// First-edit "use current layout" prompt dismissal (declared here so load() can reset it without
// hitting a temporal-dead-zone error from the immediate watch).
const seedDismissed = ref(false);

let loading = false;
function load() {
	loading = true;
	seedDismissed.value = false;
	const page = store.getPage(props.pageId);
	grid.value = page?.grid ? { ...page.grid } : { cols: 12, rowHeight: 30 };
	layout.value = JSON.parse(JSON.stringify(store.getItemsForBp(props.pageId, activeBp.value)));
	resetHistory();
	// Let grid-layout-plus emit its initial mount/compact event before we start persisting, so just
	// loading a (possibly inherited) breakpoint never accidentally creates an override.
	queueMicrotask(() => { loading = false; });
}

// Also reload when the active profile changes (store.document.value identity changes), so a
// profile switch re-renders the current page with the new profile's layout.
watch([() => props.pageId, activeBp, () => store.document.value], load, { immediate: true });

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
	if (loading) {
		return;
	}
	if (saveTimer) {
		clearTimeout(saveTimer);
	}
	saveTimer = setTimeout(() => {
		store.setItemsForBp(props.pageId, JSON.parse(JSON.stringify(layout.value)), props.kind ?? "custom", activeBp.value);
		recomputeDependencies();
	}, 300);
}

// #region Undo / redo history (per page, snapshots of the layout JSON; state declared above)
function snapshot(): string {
	return JSON.stringify(layout.value);
}
function resetHistory() {
	lastSnapshot = snapshot();
	undoStack.value = [];
	redoStack.value = [];
}
/** Record the just-applied change so it can be undone. Call after every mutation. */
function commit() {
	const current = snapshot();
	if (current === lastSnapshot) {
		return;
	}
	undoStack.value.push(lastSnapshot);
	if (undoStack.value.length > MAX_HISTORY) {
		undoStack.value.shift();
	}
	redoStack.value = [];
	lastSnapshot = current;
}
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);
function undo() {
	if (undoStack.value.length === 0) {
		return;
	}
	redoStack.value.push(lastSnapshot);
	const prev = undoStack.value.pop()!;
	layout.value = JSON.parse(prev);
	lastSnapshot = prev;
	persist();
}
function redo() {
	if (redoStack.value.length === 0) {
		return;
	}
	undoStack.value.push(lastSnapshot);
	const next = redoStack.value.pop()!;
	layout.value = JSON.parse(next);
	lastSnapshot = next;
	persist();
}
// #endregion

function onLayoutUpdated() {
	if (loading) {
		return;
	}
	persist();
	commit();
}

/** Next free row at the bottom of the grid, so new panels stack rather than overlap. */
function nextY(): number {
	return layout.value.reduce((max, it) => Math.max(max, it.y + it.h), 0);
}

// "Tidy up": repack every panel top-left, removing gaps and overlaps so the page takes the least
// vertical space. Items are placed in reading order (current top→bottom, left→right) into the first
// free slot that fits, preserving each panel's size. Respects the column count; locked items are
// repacked too (this is an explicit, undoable action).
function rearrangeAll(): void {
	const cols = grid.value.cols;
	const ordered = [...layout.value].sort((a, b) => a.y - b.y || a.x - b.x);
	const placed: Array<GridItemModel> = [];
	const overlaps = (x: number, y: number, w: number, h: number): boolean =>
		placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
	for (const it of ordered) {
		const w = Math.min(it.w, cols);
		let px = 0;
		let py = 0;
		search: for (py = 0; ; py++) {
			for (px = 0; px + w <= cols; px++) {
				if (!overlaps(px, py, w, it.h)) {
					break search;
				}
			}
		}
		placed.push({ ...it, x: px, y: py, w });
	}
	layout.value = placed;
	persist();
	commit();
}

function addWidget(payload: { widget: Widget; size: { w: number; h: number }; configure: boolean }) {
	const item: GridItemModel = {
		i: newItemId(),
		x: 0,
		y: nextY(),
		w: payload.size.w,
		h: payload.size.h,
		widget: payload.widget,
	};
	layout.value = [...layout.value, item];
	persist();
	commit();
	// Freeform widgets need configuring (a blank command/value is useless), so open properties now.
	if (payload.configure) {
		openProperties(item.i);
	}
}

function addItem(item: GridItemModel) {
	// Imported panel: drop it at the bottom of the grid, keeping its size/config.
	layout.value = [...layout.value, { ...item, x: 0, y: nextY() }];
	persist();
	commit();
}

// First-edit "use current layout" choice (only on built-in pages that provide a seed).
function applySeed() {
	if (props.seed) {
		layout.value = props.seed();
		persist();
		commit();
	}
}

function removeItem(id: string) {
	layout.value = layout.value.filter((it) => it.i !== id);
	persist();
	commit();
}

function duplicateItem(id: string) {
	const item = layout.value.find((it) => it.i === id);
	if (!item) {
		return;
	}
	const copy = { ...reidItem(item), x: 0, y: nextY() };
	layout.value = [...layout.value, copy];
	persist();
	commit();
}

function toggleLock(id: string) {
	layout.value = layout.value.map((it) => (it.i === id ? { ...it, locked: !it.locked } : it));
	persist();
	commit();
}

function exportPanelById(id: string) {
	const item = layout.value.find((it) => it.i === id);
	if (item) {
		exportPanel(item, describeWidget(item.widget).title);
	}
}

// #region Per-widget properties editing
const propertiesOpen = ref(false);
const editingId = ref<string | null>(null);
const editingItem = ref<GridItemModel | null>(null);

function openProperties(id: string) {
	const item = layout.value.find((it) => it.i === id);
	if (!item) {
		return;
	}
	editingId.value = id;
	editingItem.value = item;
	propertiesOpen.value = true;
}

function saveProperties(payload: { widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; geometry: { x: number; y: number; w: number; h: number } }) {
	layout.value = layout.value.map((it) =>
		it.i === editingId.value
			? { ...it, widget: payload.widget, conditions: payload.conditions, colors: payload.colors, typography: payload.typography, fit: payload.fit, ...payload.geometry }
			: it);
	persist();
	commit();
}
// #endregion

// #region Group (custom panel) contents editing
const groupEditorOpen = ref(false);
const groupId = ref<string | null>(null);
const editingGroup = ref<Extract<Widget, { type: "group" }> | null>(null);

function openGroupEditor(id: string) {
	const item = layout.value.find((it) => it.i === id);
	if (!item || item.widget.type !== "group") {
		return;
	}
	groupId.value = id;
	editingGroup.value = item.widget;
	groupEditorOpen.value = true;
}

function saveGroup(widget: Extract<Widget, { type: "group" }>) {
	layout.value = layout.value.map((it) => (it.i === groupId.value ? { ...it, widget } : it));
	persist();
	commit();
}
// #endregion

// Keyboard undo/redo while editing this page.
function onKeydown(e: KeyboardEvent) {
	if (!editMode.value || !(e.ctrlKey || e.metaKey)) {
		return;
	}
	const key = e.key.toLowerCase();
	if (key === "z" && !e.shiftKey) {
		e.preventDefault();
		undo();
	} else if ((key === "z" && e.shiftKey) || key === "y") {
		e.preventDefault();
		redo();
	}
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

onBeforeUnmount(() => {
	// Flush any pending debounced save so edits aren't lost when navigating away mid-timer.
	if (saveTimer) {
		clearTimeout(saveTimer);
		store.setItemsForBp(props.pageId, JSON.parse(JSON.stringify(layout.value)), props.kind ?? "custom", activeBp.value);
	}
});
</script>

<style scoped>
.flex-page {
	min-height: 200px;
}
.flex-bg-color {
	width: 40px;
	height: 28px;
	border: 1px solid rgba(var(--v-border-color), 0.4);
	border-radius: 4px;
	background: none;
	cursor: pointer;
	padding: 0;
}
.flex-page-toolbar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	position: sticky;
	/* Stick just below the app bar (its height is the layout-top inset Vuetify pads v-main with).
	   With top:0 it would stick behind the fixed app bar and scroll out of view. */
	top: var(--v-layout-top, 64px);
	z-index: 6;
	background: rgb(var(--v-theme-surface));
	border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
	border-radius: 0 0 6px 6px;
}
</style>
