<template>
	<!-- DWC's full job browser; clicking a file starts it (with a confirm). -->
	<div class="jb-root fill-height" :class="{ 'jb-frozen': disabledNow }">
		<component :is="jobFileList" :options="browserOptions" :root-directory="rootDir"
				   :root-label="$t('list.jobs.root')" no-items-text="list.jobs.noJobs" no-new-file
				   @file-click="startJob" />
	</div>
</template>

<script setup lang="ts">
import { computed, resolveComponent } from "vue";

import { showConfirmDialog } from "@/composables/useConfirmDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";

interface FileItem { name: string }

const props = defineProps<{ widget: Extract<Widget, { type: "jobs" }>; disabled?: boolean }>();
const jobFileList = resolveComponent("JobFileList");
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const rootDir = computed(() =>
	props.widget.folder || (machineStore.model as { directories?: { gCodes?: string } }).directories?.gCodes || "0:/gcodes");
const browserOptions = computed(() => ({ initialDirectory: rootDir.value, initialFiles: [] as Array<unknown> }));

async function startJob(item: FileItem, directory: string): Promise<void> {
	if (disabledNow.value) return;
	const full = `${directory.replace(/\/+$/, "")}/${item.name}`;
	const ok = await showConfirmDialog(
		i18n.global.t("dialog.startJob.title", [item.name]),
		i18n.global.t("dialog.startJob.prompt", [item.name]),
		"mdi-play",
	);
	if (ok) {
		await machineStore.sendCode(`M32 "${full}"`);
	}
}
</script>

<style scoped>
.jb-root { min-height: 0; overflow: auto; }
.jb-frozen { opacity: 0.5; pointer-events: none; }
</style>
