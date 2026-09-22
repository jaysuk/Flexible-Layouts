<template>
	<div class="exp-root fill-height d-flex flex-column">
		<!-- Tab bar (shown once there's more than one tab): a tab per open file/browser + new-tab "+". -->
		<v-toolbar v-if="tabs.length > 1" density="compact" color="surface" class="flex-shrink-0">
			<v-tabs v-model="activeTab" align-tabs="start" show-arrows density="compact" class="flex-grow-1">
				<v-tab v-for="tab in tabs" :key="tab.id" :value="tab.id" class="text-none"
					   :color="tab.dirty ? 'warning' : undefined">
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
		</v-toolbar>

		<v-window v-model="activeTab" :touch="false" class="exp-window flex-grow-1">
			<!-- No `eager`: it forced every tab to render up front, so each open file held a live Monaco
				 instance simultaneously. Monaco is by far the heaviest thing this panel can mount
				 (~3.8 MB of chunk plus per-instance model/DOM), so they are mounted on demand instead. -->
			<v-window-item v-for="tab in tabs" :key="tab.id" :value="tab.id">
				<!-- Editor tab: whichever editor loads/saves the file itself. -->
				<template v-if="tab.kind === 'editor' && tab.filename">
					<!-- Only the ACTIVE editor stays mounted, so N open files no longer mean N live
						 editors. A tab with unsaved edits is deliberately kept mounted even when
						 inactive - unmounting it would throw those edits away. -->
					<GcodeCmEditor v-if="(tab.id === activeTab || tab.dirty) && shouldUseNewGcodeEditor(tab.filename)"
								   :ref="(el: unknown) => bindEditorRef(tab.id, el)"
								   :filename="tab.filename" @dirty="tab.dirty = $event" />
					<component :is="monacoEditor" v-else-if="tab.id === activeTab || tab.dirty"
							   :ref="(el: unknown) => bindEditorRef(tab.id, el)"
							   :filename="tab.filename" @dirty="tab.dirty = $event" />
				</template>
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
			</v-window-item>
		</v-window>
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
import { computed, ref, resolveComponent } from "vue";

import i18n from "@/i18n";

import GcodeCmEditor from "./GcodeCmEditor.vue";
import { shouldUseNewGcodeEditor } from "../model/editorPreference";

interface FileItem { name: string; isDirectory?: boolean }
interface Tab { id: number; kind: "directory" | "editor"; filename?: string; directory?: string; dirty?: boolean }
// The subset of GcodeCmEditor.vue's/DWC core's MonacoEditor.vue's exposed surface this panel needs -
// both mirror the same `save(): Promise<boolean>` contract (see GcodeCmEditor.vue's own doc comment).
interface EditorHandle { save: () => Promise<boolean> }

// `attach` is passed straight through to the close-confirmation `v-dialog`, purely for testability
// (Vuetify teleports dialog content to `<body>` by default, invisible to a `VueWrapper`'s own `find`)
// - see this repo's CLAUDE.md "Testing" section.
const props = defineProps<{ attach?: boolean | string }>();

const fileList = resolveComponent("FileList");
const monacoEditor = resolveComponent("MonacoEditor");

let nextId = 1;
const tabs = ref<Array<Tab>>([{ id: 0, kind: "directory", directory: "0:/" }]);
const activeTab = ref<number>(0);

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
		activeTab.value = existing.id; // already open — focus it
		return;
	}
	const id = nextId++;
	tabs.value.push({ id, kind: "editor", filename: full });
	activeTab.value = id;
}

function addBrowserTab(): void {
	const id = nextId++;
	tabs.value.push({ id, kind: "directory", directory: "0:/" });
	activeTab.value = id;
}

// The "+" new-tab button lives in a browser/directory tab (its FileList actions when there's one
// tab) or the multi-tab toolbar. Closing the last directory tab while an editor tab remains would
// leave a lone editor tab with no "+", stranding the user - so the last directory tab can't close.
const directoryTabCount = computed(() => tabs.value.filter((t) => t.kind === "directory").length);
function isLastDirectoryTab(tab: Tab): boolean {
	return tab.kind === "directory" && directoryTabCount.value === 1;
}

function removeTab(id: number): void {
	const idx = tabs.value.findIndex((t) => t.id === id);
	if (idx < 0) return;
	tabs.value.splice(idx, 1);
	editorRefs.delete(id);
	if (activeTab.value === id) {
		activeTab.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id;
	}
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
.exp-tab-label { max-width: 12rem; }
.exp-window { min-height: 0; }
.exp-window :deep(.v-window__container),
.exp-window :deep(.v-window-item) { height: 100%; }
</style>
