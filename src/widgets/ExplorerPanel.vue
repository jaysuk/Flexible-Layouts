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
			<v-window-item v-for="tab in tabs" :key="tab.id" :value="tab.id" eager>
				<!-- Editor tab: Monaco loads/saves the file itself. -->
				<component :is="monacoEditor" v-if="tab.kind === 'editor' && tab.filename"
						   :filename="tab.filename" @dirty="tab.dirty = $event" />
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
</template>

<script setup lang="ts">
import { ref, resolveComponent } from "vue";

import i18n from "@/i18n";

interface FileItem { name: string; isDirectory?: boolean }
interface Tab { id: number; kind: "directory" | "editor"; filename?: string; directory?: string; dirty?: boolean }

const fileList = resolveComponent("FileList");
const monacoEditor = resolveComponent("MonacoEditor");

let nextId = 1;
const tabs = ref<Array<Tab>>([{ id: 0, kind: "directory", directory: "0:/" }]);
const activeTab = ref<number>(0);

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

function closeTab(id: number): void {
	if (tabs.value.length <= 1) return;
	const idx = tabs.value.findIndex((t) => t.id === id);
	if (idx < 0) return;
	tabs.value.splice(idx, 1);
	if (activeTab.value === id) {
		activeTab.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id;
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
