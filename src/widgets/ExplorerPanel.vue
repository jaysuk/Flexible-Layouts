<template>
	<div class="exp-root fill-height d-flex flex-column">
		<!-- Editing a file in-place: a back button + the Monaco editor (loads/saves the file itself) -->
		<template v-if="editing">
			<div class="exp-bar flex-shrink-0 d-flex align-center ga-1 px-1 py-1">
				<v-btn size="small" variant="tonal" prepend-icon="mdi-arrow-left" @click="editing = null">
					{{ $t("plugins.flexibleLayouts.files.back") }}
				</v-btn>
				<span class="exp-path text-caption text-truncate">{{ editing }}</span>
			</div>
			<div class="exp-body flex-grow-1">
				<component :is="monacoEditor" :key="editing" :filename="editing" />
			</div>
		</template>

		<!-- Browsing: the file list. Clicking a file opens it in the editor above (not the page). -->
		<div v-else class="exp-body fill-height">
			<component :is="fileList" v-model:directory="currentDir" :options="options"
					   root-directory="0:/" root-label="0:/"
					   :no-items-text="$t('plugins.flexibleLayouts.files.none')"
					   @file-click="open" @file-edit="open" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, resolveComponent } from "vue";

interface FileItem { name: string; isDirectory?: boolean }

const fileList = resolveComponent("FileList");
const monacoEditor = resolveComponent("MonacoEditor");

// Persisted across the browse↔edit switch so "Back" returns to the same folder.
const currentDir = ref("0:/");
const editing = ref<string | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const options = computed((): any => ({ initialDirectory: currentDir.value || "0:/", initialFiles: [] }));

function open(item: FileItem, directory: string): void {
	if (item.isDirectory) return; // directories navigate inside the FileList
	editing.value = `${directory.replace(/\/+$/, "")}/${item.name}`;
}
</script>

<style scoped>
.exp-root { min-height: 0; }
.exp-bar { border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12); }
.exp-path { font-family: monospace; opacity: 0.7; min-width: 0; }
.exp-body { min-height: 0; overflow: auto; }
</style>
