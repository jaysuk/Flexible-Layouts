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

			<v-card-text style="height: 70vh; overflow-x: hidden;">
				<div class="d-flex align-center flex-wrap ga-2 mb-2">
					<v-text-field v-model="draft.title" density="compact" variant="outlined" hide-details
								  style="max-width: 260px" :label="$t('plugins.flexibleLayouts.group.name')" />
					<v-btn color="primary" variant="flat" size="small" prepend-icon="mdi-plus"
						   @click="paletteOpen = true">
						{{ $t("plugins.flexibleLayouts.editor.addWidget") }}
					</v-btn>
					<!-- Mode toggle -->
					<v-btn-toggle
						:model-value="draft.layoutMode ?? 'grid'"
						mandatory density="compact" variant="outlined"
						@update:model-value="(v: string) => { if (draft) draft.layoutMode = v as 'grid' | 'free'; }"
					>
						<v-btn value="grid" size="small" prepend-icon="mdi-view-grid">Grid</v-btn>
						<v-btn value="free" size="small" prepend-icon="mdi-move">Free</v-btn>
					</v-btn-toggle>
					<v-btn v-if="isFree && draft && draft.items.length >= 2" size="small" variant="tonal"
						   prepend-icon="mdi-vector-arrange-above" @click="arrangeOpen = true">
						{{ $t("plugins.flexibleLayouts.editor.align.arrangeBtn") }}
					</v-btn>
					<v-spacer />
					<!-- Selected item controls (free mode) -->
					<template v-if="isFree && selectedId !== null">
						<v-btn icon="mdi-arrange-bring-to-front" size="small" variant="text"
							   title="Bring to front" @click="bringToFront" />
						<v-btn icon="mdi-arrange-send-to-back" size="small" variant="text"
							   title="Send to back" @click="sendToBack" />
						<v-btn icon="mdi-cog" size="small" variant="text"
							   title="Properties" @click="openProperties(selectedId!)" />
						<v-btn icon="mdi-delete" size="small" variant="text" color="error"
							   title="Delete" @click="removeItem(selectedId!)" />
					</template>
					<v-chip size="small" variant="tonal">
						{{ $t("plugins.flexibleLayouts.editor.itemCount", { count: draft.items.length }) }}
					</v-chip>
				</div>

				<!-- FREE mode canvas editor -->
				<div v-if="isFree"
					 ref="freeCanvasRef"
					 class="free-editor-canvas"
					 @click.self="selectedId = null"
				>
					<div
						v-for="item in sortedItems"
						:key="item.i"
						class="free-editor-item"
						:class="{ 'free-editor-item--selected': selectedId === item.i }"
						:style="freeItemStyle(item)"
						@pointerdown.stop="onItemPointerDown($event, item)"
						@click.stop="selectedId = item.i"
					>
						<!-- Widget preview (pointer-inert so drag doesn't fire widget) -->
						<div class="free-editor-preview" style="pointer-events: none; width: 100%; height: 100%;">
							<WidgetView :widget="item.widget" />
						</div>
						<!-- Resize grip (bottom-right) -->
						<div v-if="selectedId === item.i"
							 class="free-resize-grip"
							 @pointerdown.stop="onResizePointerDown($event, item)" />
						<!-- Rotate grip (top-centre) -->
						<div v-if="selectedId === item.i"
							 class="free-rotate-grip"
							 title="Drag to rotate (hold Shift for 15° steps)"
							 @pointerdown.stop="onRotatePointerDown($event, item)" />
					</div>
				</div>

				<!-- GRID mode: existing FlexGrid editor -->
				<template v-else>
					<FlexGrid v-if="draft.items.length > 0" v-model:layout="draft.items"
							  :cols="draft.cols ?? 12" :row-height="draft.rowHeight ?? 30" :edit-mode="true"
							  @remove="removeItem" @edit="openProperties" @export-item="exportChild"
							  @duplicate="duplicateChild" @toggle-lock="toggleChildLock" />
					<v-container v-else class="text-center py-12 text-medium-emphasis">
						<v-icon size="48">mdi-group</v-icon>
						<div>{{ $t("plugins.flexibleLayouts.group.empty") }}</div>
					</v-container>
				</template>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.cancel") }}</v-btn>
				<v-btn color="card-actions" @click="save">{{ $t("generic.ok") }}</v-btn>
			</v-card-actions>
		</v-card>

		<WidgetPalette v-model="paletteOpen" @add="addWidget" @add-item="addItem" />
		<PropertiesDialog v-model="propertiesOpen" :item="editingItem" @save="saveProperties" />

		<!-- Auto-arrange dialog (free mode): lay all children out in a ring or hex tiling -->
		<v-dialog v-model="arrangeOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.arrange.title") }}</v-card-title>
				<v-card-text>
					<v-btn-toggle v-model="arrangeMode" mandatory density="compact" variant="outlined" class="mb-3">
						<v-btn value="ring"><v-icon>mdi-circle-double</v-icon> {{ $t("plugins.flexibleLayouts.arrange.ringMode") }}</v-btn>
						<v-btn value="hex"><v-icon>mdi-hexagon-multiple</v-icon> {{ $t("plugins.flexibleLayouts.arrange.hexMode") }}</v-btn>
					</v-btn-toggle>
					<template v-if="arrangeMode === 'ring'">
						<v-row dense>
							<v-col cols="6"><v-text-field v-model.number="ringOpts.cx" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.cx')" /></v-col>
							<v-col cols="6"><v-text-field v-model.number="ringOpts.cy" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.cy')" /></v-col>
							<v-col cols="6"><v-text-field v-model.number="ringOpts.radius" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.radius')" /></v-col>
							<v-col cols="6"><v-text-field v-model.number="ringOpts.startAngle" type="number" density="compact" variant="outlined" hide-details suffix="°" :label="$t('plugins.flexibleLayouts.arrange.startAngle')" /></v-col>
						</v-row>
						<v-checkbox v-model="ringOpts.faceOutward" density="compact" hide-details :label="$t('plugins.flexibleLayouts.arrange.faceOutward')" />
					</template>
					<template v-else>
						<v-row dense>
							<v-col cols="6"><v-text-field v-model.number="hexOpts.cols" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.cols')" /></v-col>
							<v-col cols="6"><v-text-field v-model.number="hexOpts.spacing" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.spacing')" /></v-col>
							<v-col cols="6"><v-text-field v-model.number="hexOpts.originX" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.originX')" /></v-col>
							<v-col cols="6"><v-text-field v-model.number="hexOpts.originY" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.arrange.originY')" /></v-col>
						</v-row>
						<v-select v-model="hexOpts.orientation" :items="hexOrientOptions" density="compact" variant="outlined" hide-details class="mt-2" :label="$t('plugins.flexibleLayouts.arrange.orientation')" />
					</template>
					<div class="text-caption text-medium-emphasis mt-3">{{ $t("plugins.flexibleLayouts.arrange.appliesAllHint") }}</div>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="arrangeOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="primary" @click="applyGroupArrange">{{ $t("plugins.flexibleLayouts.arrange.apply") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

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
import { useFreeCanvas } from "../composables/useFreeCanvas";
import { hexLayout, ringLayout } from "../util/shapes";
import { describeWidget } from "../widgets/registry";
import FlexGrid from "../page/FlexGrid.vue";
import WidgetView from "../widgets/WidgetView.vue";
import WidgetPalette from "./WidgetPalette.vue";
import PropertiesDialog from "./PropertiesDialog.vue";

type GroupWidget = Extract<Widget, { type: "group" }>;

const props = defineProps<{ modelValue: boolean; group: GroupWidget | null }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; save: [GroupWidget] }>();

const draft = ref<GroupWidget | null>(null);
const paletteOpen = ref(false);
const freeCanvasRef = ref<HTMLElement | null>(null);

// Free-mode drag/resize/rotate/z-order is shared with the top-bar header editor - see
// composables/useFreeCanvas.ts.
const {
	selectedId, sortedItems, freeItemStyle,
	onItemPointerDown, onResizePointerDown, onRotatePointerDown,
	bringToFront, sendToBack, freePlace,
} = useFreeCanvas(
	() => draft.value?.items ?? [],
	(next) => { if (draft.value) draft.value.items = next; },
	freeCanvasRef,
);

watch(
	() => props.modelValue,
	(open) => {
		if (open && props.group) {
			draft.value = JSON.parse(JSON.stringify(props.group));
			selectedId.value = null;
		}
	},
	{ immediate: true },
);

const isFree = computed(() => draft.value?.layoutMode === "free");

// ── Free-mode auto-arrange (ring / hex) ───────────────────────────────────────
const arrangeOpen = ref(false);
const arrangeMode = ref<"ring" | "hex">("ring");
const ringOpts = ref({ cx: 50, cy: 50, radius: 30, startAngle: 0, faceOutward: true });
const hexOpts = ref({ cols: 3, spacing: 18, originX: 20, originY: 20, orientation: "pointy" as "pointy" | "flat" });
const hexOrientOptions = [{ title: "Pointy-top", value: "pointy" }, { title: "Flat-top", value: "flat" }];
function applyGroupArrange(): void {
	if (!draft.value) { arrangeOpen.value = false; return; }
	const items = draft.value.items;
	if (items.length < 2) { arrangeOpen.value = false; return; }
	const ring = arrangeMode.value === "ring";
	const positions = ring
		? ringLayout({ cx: ringOpts.value.cx, cy: ringOpts.value.cy, radius: ringOpts.value.radius, count: items.length, startAngle: ringOpts.value.startAngle, faceOutward: ringOpts.value.faceOutward })
		: hexLayout({ cols: hexOpts.value.cols, count: items.length, spacing: hexOpts.value.spacing, orientation: hexOpts.value.orientation, originX: hexOpts.value.originX, originY: hexOpts.value.originY });
	draft.value.items = items.map((it, idx) => {
		const pos = positions[idx];
		if (!pos) return it;
		// Ring positions are the item CENTRE (so the ring is concentric); hex positions are a top-left grid anchor.
		const px = ring ? pos.x - it.w / 2 : pos.x;
		const py = ring ? pos.y - it.h / 2 : pos.y;
		const next: GridItemModel = { ...it, x: Math.max(0, Math.min(100 - it.w, px)), y: Math.max(0, Math.min(100 - it.h, py)) };
		const rot = (pos as { rotation?: number }).rotation;
		if (rot != null) { next.freeRotation = Math.round(rot); }
		return next;
	});
	arrangeOpen.value = false;
}

// ── Grid-mode item management ─────────────────────────────────────────────────

function nextY(): number {
	return (draft.value?.items ?? []).reduce((max, it) => Math.max(max, it.y + it.h), 0);
}

function addWidget(payload: { widget: Widget; size: { w: number; h: number }; configure: boolean }) {
	if (!draft.value) {
		return;
	}
	const item: GridItemModel = isFree.value
		? { i: newItemId(), ...freePlace(), widget: payload.widget }
		: { i: newItemId(), x: 0, y: nextY(), w: payload.size.w, h: payload.size.h, widget: payload.widget };
	draft.value.items = [...draft.value.items, item];
	if (payload.configure) {
		openProperties(item.i);
	}
}

function addItem(item: GridItemModel) {
	if (draft.value) {
		const placed = isFree.value ? { ...item, ...freePlace() } : { ...item, x: 0, y: nextY() };
		draft.value.items = [...draft.value.items, placed];
	}
}

function removeItem(id: string) {
	if (draft.value) {
		draft.value.items = draft.value.items.filter((it) => it.i !== id);
		if (selectedId.value === id) selectedId.value = null;
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
		const dup = isFree.value ? { ...reidItem(item), ...freePlace() } : { ...reidItem(item), x: 0, y: nextY() };
		draft.value.items = [...draft.value.items, dup];
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

function saveProperties(payload: { widget: Widget; conditions: Array<ConditionRule>; colors: PanelColors; typography: Typography; fit: boolean | undefined; autoHeight: boolean | undefined; tooltip?: string; lockWhilePrinting?: boolean; panelChrome?: boolean; geometry: { x: number; y: number; w: number; h: number } }) {
	if (!draft.value) {
		return;
	}
	draft.value.items = draft.value.items.map((it) =>
		it.i === editingId.value
			? { ...it, widget: payload.widget, conditions: payload.conditions, colors: payload.colors, typography: payload.typography, fit: payload.fit, autoHeight: payload.autoHeight, panelChrome: payload.panelChrome, ...payload.geometry }
			: it);
}

function save() {
	if (draft.value) {
		emit("save", draft.value);
	}
	emit("update:modelValue", false);
}
</script>

<style scoped>
/* Free-mode edit canvas: fills the available height, serves as the percent reference frame. */
.free-editor-canvas {
	position: relative;
	width: 100%;
	height: calc(70vh - 96px);
	background: repeating-linear-gradient(
		0deg,
		transparent,
		transparent 9px,
		rgba(var(--v-border-color), 0.08) 9px,
		rgba(var(--v-border-color), 0.08) 10px
	),
	repeating-linear-gradient(
		90deg,
		transparent,
		transparent 9px,
		rgba(var(--v-border-color), 0.08) 9px,
		rgba(var(--v-border-color), 0.08) 10px
	);
	border: 1px solid rgba(var(--v-border-color), 0.3);
	border-radius: 4px;
	overflow: hidden;
}

/* Each free child item in the editor. */
.free-editor-item {
	position: absolute;
	box-sizing: border-box;
	user-select: none;
}

/* Selection outline */
.free-editor-item--selected {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 1px;
}

/* Resize grip: bottom-right corner handle. */
.free-resize-grip {
	position: absolute;
	right: -4px;
	bottom: -4px;
	width: 16px;
	height: 16px;
	background: rgb(var(--v-theme-primary));
	border-radius: 3px;
	cursor: se-resize;
	z-index: 100;
	opacity: 0.85;
}
.free-resize-grip:hover {
	opacity: 1;
}

/* Rotate grip: a small circle floating above the item's top edge. */
.free-rotate-grip {
	position: absolute;
	left: 50%;
	top: -18px;
	width: 14px;
	height: 14px;
	margin-left: -7px;
	background: rgb(var(--v-theme-primary));
	border: 2px solid rgb(var(--v-theme-surface));
	border-radius: 50%;
	cursor: grab;
	z-index: 100;
	opacity: 0.85;
}
.free-rotate-grip:hover {
	opacity: 1;
}
</style>
