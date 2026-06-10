<template>
	<div class="fill-height flex-builtin-panel">
		<v-alert v-if="errored" type="warning" variant="tonal" density="compact" class="ma-2">
			{{ $t("plugins.flexibleLayouts.widget.panelError", { name: component }) }}
		</v-alert>

		<!-- Static tag dispatch. Explicit tags (not resolveComponent) so the panels resolve in BOTH
			 load paths: in-tree/dev they are auto-imported by unplugin-vue-components; in the external
			 ZIP they resolve against DWC's global component registry at runtime. Keep this list in sync
			 with the catalog in widgets/registry.ts. -->
		<template v-else>
			<StatusPanel v-if="component === 'StatusPanel'" />
			<ToolsPanel v-else-if="component === 'ToolsPanel'" />
			<MovementPanel v-else-if="component === 'MovementPanel'" />
			<ExtrudePanel v-else-if="component === 'ExtrudePanel'" />
			<FanPanel v-else-if="component === 'FanPanel'" />
			<FansPanel v-else-if="component === 'FansPanel'" />
			<ATXPanel v-else-if="component === 'ATXPanel'" />
			<BabystepPanel v-else-if="component === 'BabystepPanel'" />
			<SpeedFactorPanel v-else-if="component === 'SpeedFactorPanel'" />
			<ExtrusionFactorsPanel v-else-if="component === 'ExtrusionFactorsPanel'" />
			<SpindleSpeedPanel v-else-if="component === 'SpindleSpeedPanel'" />
			<JobControlPanel v-else-if="component === 'JobControlPanel'" />
			<JobInfoPanel v-else-if="component === 'JobInfoPanel'" />
			<JobTimesPanel v-else-if="component === 'JobTimesPanel'" />
			<WebcamPanel v-else-if="component === 'WebcamPanel'" />
			<MacroList v-else-if="component === 'MacroList'" />
			<!-- Chart canvas is absolutely positioned inside a flex-grow content area, so the card must
				 be given real height or it collapses to just its title. -->
			<div v-else-if="component === 'TemperatureChart'" class="d-flex flex-column fill-height">
				<TemperatureChart class="flex-grow-1" />
			</div>
			<!-- Full console = command input + event list, like DWC's Console page. -->
			<div v-else-if="component === 'EventList'" class="d-flex flex-column fill-height">
				<CodeInput variant="solo" class="flex-shrink-0 mb-2" />
				<EventList class="flex-grow-1 flex-console-list" />
			</div>
			<!-- File browsers need props/handlers the page would normally supply. -->
			<JobFileList v-else-if="component === 'JobFileList'" :options="jobOptions" :root-directory="gcodesDir"
						 :root-label="$t('list.jobs.root')" no-items-text="list.jobs.noJobs" no-new-file
						 @file-click="startJob" />
			<ExplorerPanel v-else-if="component === 'FileList'" />
			<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
				{{ $t("plugins.flexibleLayouts.widget.panelMissing", { name: component }) }}
			</v-alert>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onErrorCaptured, ref } from "vue";

import { showConfirmDialog } from "@/composables/useConfirmDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

import ExplorerPanel from "./ExplorerPanel.vue";

interface FileItem { name: string; isDirectory?: boolean }

const props = defineProps<{ component: string }>();
const machineStore = useMachineStore();

const gcodesDir = computed(() =>
	(machineStore.model as { directories?: { gCodes?: string } }).directories?.gCodes || "0:/gcodes");
// Loosely typed: JobFileList accepts a FileBrowserOptions; we only need the initial directory.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobOptions = computed((): any => ({ initialDirectory: gcodesDir.value, initialFiles: [] }));

async function startJob(item: FileItem, directory: string): Promise<void> {
	const full = `${directory.replace(/\/+$/, "")}/${item.name}`;
	if (await showConfirmDialog(
		i18n.global.t("dialog.startJob.title", [item.name]),
		i18n.global.t("dialog.startJob.prompt", [item.name]),
		"mdi-play",
	)) {
		await machineStore.sendCode(`M32 "${full}"`);
	}
}

const errored = ref(false);
onErrorCaptured((err) => {
	console.warn(`[FlexibleLayouts] panel "${props.component}" failed to render:`, err);
	errored.value = true;
	return false;
});
</script>

<style scoped>
.flex-builtin-panel {
	overflow: auto;
}
/* Console event list: make the card a flex column so its row list scrolls within the panel while
   the "Event Log" toolbar header stays pinned, instead of the rows overflowing the fixed panel. */
.flex-console-list {
	min-height: 0;
	display: flex;
	flex-direction: column;
}
.flex-console-list :deep(.event-log-header) {
	flex-shrink: 0;
}
.flex-console-list :deep(.event-log-list) {
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
}
</style>
