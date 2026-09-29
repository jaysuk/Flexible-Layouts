<template>
	<div class="exp-root fill-height d-flex flex-column">
		<!-- One grid for both panes: row 1 the tab strips, row 2 the content, columns the two panes and the divider.
			 Every tab's content is a direct child of it (below), placed in a column by an inline style, so a tab that
			 changes pane only changes `grid-column` - it is never re-parented, and its editor is never unmounted.
			 (Vue cannot move a component between two parents: nesting each pane's tabs in that pane's own element
			 would remount the editor on every drag, split and collapse, losing the edits, undo history and scroll.) -->
		<div ref="panesEl" class="exp-panes flex-grow-1" :style="{ gridTemplateColumns }">
			<!-- A tab strip per pane (shown once there's more than one tab): a tab per open file/browser + new-tab "+". -->
			<div v-for="group in session.groups" :key="`strip-${group.id}`" class="exp-strip"
				 :style="{ gridColumn: columnOf(group.id) }" @dragover.prevent @drop="onTabDrop($event, group.id)">
				<v-toolbar v-if="tabs.length > 1" density="compact" color="surface" class="flex-shrink-0">
					<v-tabs :model-value="group.activeTabId" align-tabs="start" show-arrows density="compact" class="flex-grow-1"
							@update:model-value="onTabsInput">
						<v-tab v-for="tab in tabsIn(group.id)" :key="tab.id" :value="tab.id" class="text-none"
							   :color="tab.dirty ? 'warning' : undefined" draggable="true" @dragstart="onTabDragStart($event, tab.id)"
							   @click="focusTab(tab.id)">
							<v-icon size="small" class="mr-2">{{ tab.kind === 'editor' ? 'mdi-file-document-edit' : 'mdi-folder' }}</v-icon>
							<span class="exp-tab-label text-truncate">{{ tabLabel(tab) }}{{ tab.dirty ? " *" : "" }}</span>
							<v-btn variant="text" size="small" density="comfortable" icon class="ml-2"
								   :disabled="isLastDirectoryTab(tab)"
								   :title="$t('list.explorer.closeTab')" @click.stop="closeTab(tab.id)">
								<v-icon size="20">mdi-close</v-icon>
							</v-btn>
						</v-tab>
					</v-tabs>
					<v-btn variant="text" icon :title="$t('list.explorer.newTab')" @click="addBrowserTab">
						<v-icon>mdi-plus</v-icon>
					</v-btn>
					<v-btn v-if="!split && canSplitPanes" variant="text" icon data-explorer-split
						   :title="$t('plugins.flexibleLayouts.files.splitRight')" @click="onSplit">
						<v-icon>mdi-dock-right</v-icon>
					</v-btn>
					<v-btn v-if="group.id === 2" variant="text" icon data-explorer-close-split
						   :title="$t('plugins.flexibleLayouts.files.closeSplit')" @click="onCloseSplit">
						<v-icon>mdi-dock-left</v-icon>
					</v-btn>
				</v-toolbar>
			</div>

			<!-- An empty drop target under each pane, so a pane whose tab is a file list still takes a dragged tab. -->
			<div v-for="group in session.groups" :key="`body-${group.id}`" class="exp-body"
				 :style="{ gridColumn: columnOf(group.id) }" @dragover.prevent @drop="onTabDrop($event, group.id)" />

			<!-- Every tab, flat and in a fixed (id) order. No `eager`: an editor is mounted on demand (below), so N open
				 files don't mean N live Monaco instances (~3.8 MB of chunk plus per-instance model/DOM). -->
			<div v-for="tab in slotTabs" :key="tab.id" v-show="isShowing(tab)" class="exp-slot"
				 :data-tab-id="tab.id" :style="{ gridColumn: columnOf(paneOf(tab)) }"
				 @dragover.prevent @drop="onTabDrop($event, paneOf(tab))" @focusin="focusTab(tab.id)">
				<div class="exp-slot-fill">
					<template v-if="booted.has(tab.id)">
						<!-- Editor tab: whichever editor loads/saves the file itself. -->
						<div v-if="tab.kind === 'editor' && tab.filename" class="exp-editor-col d-flex flex-column fill-height">
							<!-- A 12864 menu file can be checked as you go: a preview of the display it configures.
								 In the new editor it follows the unsaved buffer (`live-text`); DWC's Monaco exposes no
								 text, so a menu file that still opens there shows what is on the SD card and is re-read
								 whenever the file is saved. -->
							<div v-if="isMenuFile(tab.filename)" class="exp-menu-bar flex-shrink-0 d-flex align-center px-2">
								<v-btn size="small" variant="text" :color="tab.preview ? 'primary' : undefined" prepend-icon="mdi-monitor"
									   :title="$t('plugins.flexibleLayouts.display12864.toggleHelp')" @click="tab.preview = !tab.preview">
									{{ $t("plugins.flexibleLayouts.display12864.toggle") }}
								</v-btn>
							</div>
							<div class="exp-editor-row d-flex flex-grow-1">
								<div class="exp-editor-main flex-grow-1">
									<!-- Only a SHOWING editor stays mounted (one per pane, so two when split), so N open
										 files no longer mean N live editors. A tab with unsaved edits is deliberately kept
										 mounted even when hidden - unmounting it would throw those edits away. -->
									<GcodeCmEditor v-if="(isShowing(tab) || tab.dirty) && shouldUseNewGcodeEditor(tab.filename)"
												   :ref="(el: unknown) => bindEditorRef(tab.id, el)"
												   :filename="tab.filename" :draft="tab.draft"
												   @dirty="onEditorDirty(tab, $event)" @stash="tab.draft = $event"
												   @live-text="tab.liveText = $event" />
									<component :is="monacoEditor" v-else-if="isShowing(tab) || tab.dirty"
											   :ref="(el: unknown) => bindEditorRef(tab.id, el)"
											   :filename="tab.filename" @dirty="onEditorDirty(tab, $event)" />
								</div>
								<aside v-if="tab.preview && isMenuFile(tab.filename) && isShowing(tab)" class="exp-menu-preview pa-2">
									<Display12864Emulator :menu="basename(tab.filename)" :reload-key="tab.saves ?? 0" :overrides="menuOverrides" />
								</aside>
							</div>
						</div>
						<!-- Browser tab: file-click opens the file in a new editor tab (not the page). -->
						<component :is="fileList" v-else v-model:directory="tab.directory" :options="optionsFor(tab)"
								   root-directory="0:/" root-label="0:/"
								   :no-items-text="$t('plugins.flexibleLayouts.files.none')"
								   @file-click="open" @file-edit="open">
							<template v-if="tabs.length === 1" #actions>
								<v-btn variant="text" icon :title="$t('list.explorer.newTab')" @click="addBrowserTab">
									<v-icon>mdi-plus</v-icon>
								</v-btn>
							</template>
						</component>
					</template>
				</div>
			</div>

			<div v-if="split" class="exp-divider" :class="{ 'exp-divider--dragging': dragging }"
				 @pointerdown="onDividerPointerDown" @pointermove="onDividerPointerMove"
				 @pointerup="onDividerPointerUp" @pointercancel="onDividerPointerUp" />
		</div>
	</div>

	<!-- Closing a dirty tab asks first, rather than silently discarding edits. -->
	<v-dialog :model-value="pendingCloseTab !== null" max-width="420" :attach="attach"
			  @update:model-value="onCloseDialogToggle">
		<v-card v-if="pendingCloseTab">
			<v-card-title class="d-flex align-center">
				<v-icon color="warning" class="me-2">mdi-content-save-alert</v-icon>
				{{ $t("plugins.flexibleLayouts.files.closeUnsaved.title") }}
			</v-card-title>
			<v-card-text>
				{{ $t("plugins.flexibleLayouts.files.closeUnsaved.body", { name: tabLabel(pendingCloseTab) }) }}
			</v-card-text>
			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="cancelClose">{{ $t("generic.cancel") }}</v-btn>
				<v-btn variant="text" color="error" @click="discardClose">
					{{ $t("plugins.flexibleLayouts.files.closeUnsaved.discard") }}
				</v-btn>
				<v-btn variant="flat" color="primary" :loading="closingSaving" @click="saveAndClose">
					{{ $t("plugins.flexibleLayouts.files.closeUnsaved.save") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, reactive, ref, resolveComponent, toRef, watch } from "vue";

import type { GroupId } from "dwc-gcode-editor";

import { SETTINGS_SCOPE_KEY } from "@/composables/useComponentSettings";

import i18n from "@/i18n";

import Display12864Emulator from "./Display12864Emulator.vue";
import GcodeCmEditor from "./GcodeCmEditor.vue";
import { isMenuFile, shouldUseNewGcodeEditor } from "../model/editorPreference";
import type { ExplorerTarget } from "../model/explorerRoute";
import {
	activateTab, addTab, canSplit, closeSplitPanes, isShowing as paneIsShowing, isSplit, moveTabToPane, paneOf,
	removeTab as removeFromSession, setPaneRatio, splitPanes,
} from "../model/explorerPanes";
import { explorerSession, releaseExplorerSession, type ExplorerTab as Tab } from "../model/explorerSession";

interface FileItem { name: string; isDirectory?: boolean }
// The subset of GcodeCmEditor.vue's/DWC core's MonacoEditor.vue's exposed surface this panel needs -
// both mirror the same `save(): Promise<boolean>` contract (see GcodeCmEditor.vue's own doc comment).
interface EditorHandle { save: () => Promise<boolean> }

// `attach` is passed straight through to the close-confirmation `v-dialog`, purely for testability
// (Vuetify teleports dialog content to `<body>` by default, invisible to a `VueWrapper`'s own `find`)
// - see this repo's CLAUDE.md "Testing" section.
const props = defineProps<{
	attach?: boolean | string;
	/**
	 * Something to show right away and whenever it changes: a directory to browse or a file to open.
	 * Used by the replacement Explorer page to honour DWC's `/Explorer/...` deep links; ignored when
	 * omitted (the panel as a plain widget).
	 */
	target?: ExplorerTarget;
	/**
	 * Which remembered session to use (see `model/explorerSession.ts`). Left out, a panel placed on a page
	 * takes its grid item's id, so it keeps its tabs across a trip to another page; a panel that is neither
	 * keyed nor inside a grid item starts empty every time.
	 */
	sessionKey?: string;
}>();
const emit = defineEmits<{
	/** True while a tab has unsaved edits that would be LOST by leaving (a Monaco tab: only the new editor hands its text back). */
	"dirty-change": [dirty: boolean];
	/** What the active tab is showing, for a host that mirrors it in the URL. Fired on mount and on every change. */
	location: [target: ExplorerTarget];
}>();

const fileList = resolveComponent("FileList");
const monacoEditor = resolveComponent("MonacoEditor");

// The tabs live in a session that outlives this component (see model/explorerSession.ts): leaving the page
// unmounts the panel, and coming back finds the same tabs, the same active one, the same folders.
const settingsScope = SETTINGS_SCOPE_KEY ? inject(SETTINGS_SCOPE_KEY, null) : null;
const session = explorerSession(props.sessionKey ?? (settingsScope ? `panel:${settingsScope.segments.join("/")}` : null));
onBeforeUnmount(() => releaseExplorerSession(session));
const returning = session.returning;
const tabs = toRef(session, "tabs");
// The FOCUSED pane's showing tab: what the URL mirrors and where a deep link lands. Write it only through
// `activateTab` (model/explorerPanes.ts), which keeps the per-pane state in step.
const activeTab = toRef(session, "activeTab");

// --- Split view: two tab strips side by side. -------------------------------------------------------------
const split = computed(() => isSplit(session));
const canSplitPanes = computed(() => canSplit(session));
const panesEl = ref<HTMLElement | null>(null);
const dragging = ref(false);

function tabsIn(groupId: GroupId): Array<Tab> { return tabs.value.filter((t) => paneOf(t) === groupId); }
function isShowing(tab: Tab): boolean { return paneIsShowing(session, tab); }
/** The grid column a pane's strip, drop zone and content sit in: 1 alone; 1 and 3 (2 is the divider) when split. */
function columnOf(groupId: GroupId): number { return split.value && groupId === 2 ? 3 : 1; }
const gridTemplateColumns = computed(() => split.value
	? `minmax(0, ${session.splitRatio}fr) 7px minmax(0, ${1 - session.splitRatio}fr)`
	: "minmax(0, 1fr)");
/** Every tab in a fixed order (by id). Moving a tab reorders `tabs`, and a keyed `v-for` follows the order it is
 *  given by moving DOM nodes, which resets an element's scroll position; sorting keeps each editor's element put. */
const slotTabs = computed(() => [...tabs.value].sort((a, b) => a.id - b.id));
// A tab's content is mounted the first time it is shown and then kept (a folder tab keeps its place), like a
// `v-window-item` without `eager` did.
const booted = reactive(new Set<number>());
watch(() => session.groups.map((g) => g.activeTabId), (ids) => {
	for (const id of ids) if (id !== null) booted.add(id);
}, { immediate: true });

function onTabsInput(id: unknown): void {
	if (typeof id === "number") activateTab(session, id);
}
/** Clicking a pane (its tab, or into its editor) focuses it: `v-tabs` says nothing when the tab is already the
 *  selected one, but this pane still has to become the one the URL and a new tab follow. */
function focusTab(id: number): void {
	const tab = tabs.value.find((t) => t.id === id);
	if (tab !== undefined && (session.focusedGroup !== paneOf(tab) || session.activeTab !== id)) activateTab(session, id);
}

const SPLIT_RATIO_KEY = "flexibleLayouts.explorerSplitRatio";
function onSplit(): void {
	splitPanes(session);
	try {
		const stored = Number(localStorage.getItem(SPLIT_RATIO_KEY));
		if (Number.isFinite(stored) && stored > 0) setPaneRatio(session, stored);
	} catch { /* storage unavailable: keep the default */ }
}
function onCloseSplit(): void { closeSplitPanes(session); }

let draggedTabId: number | null = null;
function onTabDragStart(event: DragEvent, id: number): void {
	draggedTabId = id;
	event.dataTransfer?.setData("text/plain", String(id));
}
function onTabDrop(event: DragEvent, groupId: GroupId): void {
	event.preventDefault();
	const raw = event.dataTransfer?.getData("text/plain");
	const fromTransfer = raw ? Number(raw) : NaN;
	const id = Number.isFinite(fromTransfer) ? fromTransfer : draggedTabId;
	draggedTabId = null;
	const tab = tabs.value.find((t) => t.id === id);
	// Dropping on the pane a tab is already in, or on a second pane that does not exist, does nothing.
	if (tab !== undefined && paneOf(tab) !== groupId && (split.value || groupId === 1)) moveTabToPane(session, tab.id, groupId);
}
function onDividerPointerDown(event: PointerEvent): void {
	dragging.value = true;
	(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
}
function onDividerPointerMove(event: PointerEvent): void {
	if (!dragging.value || panesEl.value === null) return;
	const rect = panesEl.value.getBoundingClientRect();
	if (rect.width > 0) setPaneRatio(session, (event.clientX - rect.left) / rect.width);
}
function onDividerPointerUp(): void {
	if (!dragging.value) return;
	dragging.value = false;
	try { localStorage.setItem(SPLIT_RATIO_KEY, String(session.splitRatio)); } catch { /* storage unavailable */ }
}
// Nothing is mounted yet, so what a tab says about its editor is only as true as its stashed text: a tab is
// dirty exactly when it has a draft to bring back. (A Monaco tab has none - its edits went with its editor.)
for (const tab of tabs.value) tab.dirty = tab.draft !== undefined;

function onEditorDirty(tab: Tab, dirty: boolean): void {
	tab.dirty = dirty;
	if (!dirty) tab.draft = undefined; // saved or reverted: nothing left to restore
}

// Keyed by tab id rather than a single "current editor" ref, since a dirty background tab stays
// mounted too (see the template's own comment) and Save-on-close must be able to reach it even when
// it isn't the active tab.
const editorRefs = new Map<number, EditorHandle>();
function bindEditorRef(id: number, el: unknown): void {
	if (el !== null && typeof (el as Partial<EditorHandle>).save === "function") {
		editorRefs.set(id, el as EditorHandle);
	} else {
		editorRefs.delete(id);
	}
}

function basename(p: string): string { return p.replace(/\/+$/, "").split("/").pop() || p; }
function tabLabel(tab: Tab): string {
	return tab.kind === "editor" && tab.filename ? basename(tab.filename) : i18n.global.t("plugins.flexibleLayouts.files.filesTab");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function optionsFor(tab: Tab): any { return { initialDirectory: tab.directory || "0:/", initialFiles: [] }; }

function open(item: FileItem, directory: string): void {
	if (item.isDirectory) return; // directories navigate inside the FileList
	const full = `${directory.replace(/\/+$/, "")}/${item.name}`;
	const existing = tabs.value.find((t) => t.kind === "editor" && t.filename === full);
	if (existing) {
		activateTab(session, existing.id); // already open (in either pane) - focus it and its pane
		return;
	}
	addTab(session, { kind: "editor", filename: full });
}

// Follow a deep link: open the file in an editor tab, or point a file-browser tab at the directory
// (the active one if it is a browser, else the first browser, so an open editor isn't disturbed).
function applyTarget(target: ExplorerTarget): void {
	if (target.kind === "editor") {
		const slash = target.path.lastIndexOf("/");
		open({ name: target.path.slice(slash + 1) }, target.path.slice(0, slash));
		return;
	}
	const active = tabs.value.find((t) => t.id === activeTab.value && t.kind === "directory");
	const browser = active ?? tabs.value.find((t) => t.kind === "directory");
	if (browser) {
		browser.directory = target.path;
		activateTab(session, browser.id);
	}
}
let firstTarget = true;
watch(() => (props.target ? `${props.target.kind}|${props.target.path}` : ""), () => {
	const first = firstTarget;
	firstTarget = false;
	if (!props.target) return;
	// A bare `/Explorer` (the nav drawer's link) on a return visit means "back to Explorer", not "back to the
	// root of the card": keep what was open, and let `location` below put the URL right.
	if (first && returning && props.target.kind === "directory" && props.target.path === "0:/") return;
	applyTarget(props.target);
}, { immediate: true });

const location = computed<ExplorerTarget | null>(() => {
	const tab = tabs.value.find((t) => t.id === activeTab.value);
	if (!tab) return null;
	return tab.kind === "editor" && tab.filename
		? { kind: "editor", path: tab.filename }
		: { kind: "directory", path: tab.directory || "0:/" };
});
watch(location, (now) => {
	if (now) emit("location", now);
}, { immediate: true });

// The unsaved text of every menu file being edited in an editor that reports it, by file name, for the
// preview to lay over what is on the card - so `main` linking to `listFiles` shows both files' edits.
const menuOverrides = computed<Record<string, string>>(() => {
	const out: Record<string, string> = {};
	for (const tab of tabs.value) {
		if (tab.kind === "editor" && tab.filename && tab.liveText !== undefined && isMenuFile(tab.filename)) {
			out[basename(tab.filename).toLowerCase()] = tab.liveText;
		}
	}
	return out;
});

// Saving a menu file re-reads its preview: dirty -> clean means the editor just wrote it to the card.
// Matched by tab id, not position: closing a tab shifts the ones after it, and that must not read as a save.
watch(() => tabs.value.map((t): [number, boolean] => [t.id, !!t.dirty]), (now, before) => {
	const wasDirty = new Map(before);
	for (const [id, dirty] of now) {
		const tab = tabs.value.find((t) => t.id === id);
		if (wasDirty.get(id) && !dirty && tab) tab.saves = (tab.saves ?? 0) + 1;
	}
});

// Lets a host (the replacement Explorer page) guard navigation away while edits would be lost. An edit in
// the new editor is not one: it is stashed on the tab when the editor unmounts and comes back with it.
watch(() => tabs.value.some((t) => t.dirty && t.filename !== undefined && !shouldUseNewGcodeEditor(t.filename)),
	(lossy) => emit("dirty-change", lossy));

function addBrowserTab(): void {
	addTab(session, { kind: "directory", directory: "0:/" });
}

// The "+" new-tab button lives in a browser/directory tab (its FileList actions when there's one
// tab) or the multi-tab toolbar. Closing the last directory tab while an editor tab remains would
// leave a lone editor tab with no "+", stranding the user - so the last directory tab can't close.
const directoryTabCount = computed(() => tabs.value.filter((t) => t.kind === "directory").length);
function isLastDirectoryTab(tab: Tab): boolean {
	return tab.kind === "directory" && directoryTabCount.value === 1;
}

function removeTab(id: number): void {
	if (!tabs.value.some((t) => t.id === id)) return;
	removeFromSession(session, id); // its pane collapses if that was the pane's last tab
	editorRefs.delete(id);
	booted.delete(id);
}

// A dirty tab asks first (Save/Discard/Cancel) rather than silently discarding edits - a clean tab
// (or a browser tab, which has nothing to lose) closes immediately, same as before.
const pendingCloseTabId = ref<number | null>(null);
const pendingCloseTab = computed(() => tabs.value.find((t) => t.id === pendingCloseTabId.value) ?? null);
const closingSaving = ref(false);

function closeTab(id: number): void {
	const idx = tabs.value.findIndex((t) => t.id === id);
	if (idx < 0 || tabs.value.length <= 1 || isLastDirectoryTab(tabs.value[idx])) {
		return;
	}
	if (tabs.value[idx].dirty) {
		pendingCloseTabId.value = id;
		return;
	}
	removeTab(id);
}

function cancelClose(): void {
	pendingCloseTabId.value = null;
}
function onCloseDialogToggle(open: boolean): void {
	if (!open) cancelClose();
}
function discardClose(): void {
	if (pendingCloseTabId.value === null) return;
	const id = pendingCloseTabId.value;
	pendingCloseTabId.value = null;
	removeTab(id);
}
async function saveAndClose(): Promise<void> {
	const id = pendingCloseTabId.value;
	if (id === null) return;
	const editor = editorRefs.get(id);
	if (!editor) return; // a dirty tab always stays mounted (see template), so this shouldn't happen
	closingSaving.value = true;
	try {
		// save() never throws and already raises its own error notification on failure (see
		// GcodeCmEditor.vue's own doc comment) - leave the dialog open on failure so the user can
		// retry, or fall back to Discard/Cancel, instead of silently losing the edits either way.
		if (await editor.save()) {
			pendingCloseTabId.value = null;
			removeTab(id);
		}
	} finally {
		closingSaving.value = false;
	}
}
</script>

<style scoped>
.exp-root { min-height: 0; }
.exp-editor-col, .exp-editor-row, .exp-editor-main { min-height: 0; }
.exp-editor-main { min-width: 0; }
.exp-menu-bar { border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.exp-menu-preview { flex: 0 0 380px; max-width: 45%; overflow: auto; border-left: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.exp-tab-label { max-width: 12rem; }
/* Row 1: the tab strips. Row 2: the content. Columns: pane, 7px divider, pane (or one column when not split). */
.exp-panes { display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; }
.exp-strip { grid-row: 1; min-width: 0; }
.exp-body { grid-row: 2; min-width: 0; min-height: 0; }
.exp-slot { grid-row: 2; position: relative; min-width: 0; min-height: 0; }
.exp-slot-fill { position: absolute; inset: 0; overflow: auto; }
.exp-divider { grid-row: 1 / span 2; grid-column: 2; margin: 0 -3px; cursor: ew-resize; touch-action: none; z-index: 1; }
.exp-divider:hover, .exp-divider--dragging { background: rgba(var(--v-theme-on-surface), 0.12); }
</style>
