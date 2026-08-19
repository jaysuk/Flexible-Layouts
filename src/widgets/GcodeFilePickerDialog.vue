<template>
	<v-dialog :model-value="modelValue" max-width="480" :attach="props.attach" @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-file-find-outline</v-icon>
				{{ $t("plugins.flexibleLayouts.filePicker.title") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<div v-if="canGoUp" class="gfp-bar">
				<v-btn icon="mdi-arrow-up-bold-box-outline" size="x-small" variant="text" density="comfortable"
					   :title="$t('plugins.flexibleLayouts.files.up')" @click="goUp" />
				<span class="gfp-path text-truncate" :title="currentDir">{{ relPath || "/" }}</span>
			</div>

			<v-card-text class="gfp-list">
				<div v-if="loading" class="text-medium-emphasis text-caption pa-2">{{ $t("plugins.flexibleLayouts.macros.loading") }}</div>
				<div v-else-if="!dirs.length && !files.length" class="text-medium-emphasis text-caption pa-2">
					{{ $t("plugins.flexibleLayouts.filePicker.empty") }}
				</div>
				<v-list v-else density="compact">
					<v-list-item v-for="d in dirs" :key="'d:' + d" prepend-icon="mdi-folder-outline" :title="d" @click="openDir(d)" />
					<v-list-item v-for="f in files" :key="'f:' + f" prepend-icon="mdi-file-outline" :title="f" @click="select(f)" />
				</v-list>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

// `attach` is a plain pass-through to v-dialog's own prop, left unset in real use (the default
// teleport-to-body avoids clipping by an ancestor grid item's overflow/transform) - it exists here
// purely so tests can pass `attach: true` and keep the dialog's content in the local DOM tree,
// where Vue Test Utils' wrapper queries can actually see it (teleported body content otherwise
// lands outside the mounted wrapper's own subtree).
const props = defineProps<{ modelValue: boolean; rootFolder?: string; attach?: boolean | string }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; select: [string] }>();
const machineStore = useMachineStore();

// Mirrors FilesWidget.vue's own root resolution: fall back to the OM's live directories.gCodes (RRF's
// M505 can move it) rather than a hard-coded "0:/gcodes" - the exact class of bug that made
// MacrosWidget silently show "empty" on a machine with a customised folder.
function defaultRoot(): string {
	const dirs = (machineStore.model as { directories?: { gCodes?: string } } | null)?.directories;
	return (dirs?.gCodes || "0:/gcodes").replace(/\/+$/, "");
}

const rootDir = ref(props.rootFolder?.replace(/\/+$/, "") || defaultRoot());
const currentDir = ref(rootDir.value);
const dirs = ref<Array<string>>([]);
const files = ref<Array<string>>([]);
const loading = ref(false);

// Every navigation action (open, drill in, go up) calls this explicitly rather than reacting to a
// `watch(currentDir, ...)` - a reactive watcher plus an explicit call on open would double-fetch on
// every open where the root also happens to change, and out-of-order responses from the two
// in-flight requests could then let a stale (deeper-folder) result overwrite the fresh one.
async function load(): Promise<void> {
	loading.value = true;
	try {
		const list = await machineStore.getFileList(currentDir.value);
		dirs.value = list.filter((f) => f.isDirectory).map((f) => f.name).sort();
		files.value = list
			.filter((f) => !f.isDirectory && /\.(gco|gcode|g|nc)$/i.test(f.name))
			.map((f) => f.name)
			.sort();
	} catch {
		dirs.value = [];
		files.value = [];
	} finally {
		loading.value = false;
	}
}

// Re-root and reload every time the dialog opens - the picker always starts back at the configured
// root (or the live OM default, re-resolved fresh in case the OM has updated since last time), never
// wherever the user last drilled into.
watch(() => props.modelValue, (open) => {
	if (!open) { return; }
	rootDir.value = props.rootFolder?.replace(/\/+$/, "") || defaultRoot();
	currentDir.value = rootDir.value;
	void load();
});

const canGoUp = computed(() => currentDir.value.length > rootDir.value.length);
const relPath = computed(() => currentDir.value.slice(rootDir.value.length).replace(/^\/+/, ""));

function openDir(name: string): void {
	currentDir.value = `${currentDir.value.replace(/\/+$/, "")}/${name}`;
	void load();
}
function goUp(): void {
	const parent = currentDir.value.replace(/\/[^/]+$/, "");
	currentDir.value = parent.length >= rootDir.value.length ? parent : rootDir.value;
	void load();
}

function select(name: string): void {
	emit("select", `${currentDir.value.replace(/\/+$/, "")}/${name}`);
	close();
}
function close(): void {
	emit("update:modelValue", false);
}
</script>

<style scoped>
.gfp-bar { display: flex; align-items: center; gap: 4px; padding: 0 16px 4px; }
.gfp-path { font-size: 0.75rem; opacity: 0.7; font-family: monospace; min-width: 0; }
.gfp-list { max-height: 50vh; overflow-y: auto; padding-top: 0; }
</style>
