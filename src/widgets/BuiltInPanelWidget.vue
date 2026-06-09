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
			<TemperatureChart v-else-if="component === 'TemperatureChart'" />
			<EventList v-else-if="component === 'EventList'" />
			<!-- File browsers need props/handlers the page would normally supply. -->
			<JobFileList v-else-if="component === 'JobFileList'" :options="jobOptions" :root-directory="gcodesDir"
						 :root-label="$t('list.jobs.root')" no-items-text="list.jobs.noJobs" no-new-file
						 @file-click="startJob" />
			<FileList v-else-if="component === 'FileList'" :options="explorerOptions" root-directory="0:/" root-label="0:/"
					  :no-items-text="$t('plugins.flexibleLayouts.files.none')"
					  @file-click="openInEditor" @file-edit="openInEditor" />
			<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
				{{ $t("plugins.flexibleLayouts.widget.panelMissing", { name: component }) }}
			</v-alert>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, onErrorCaptured, ref } from "vue";
import { useRouter } from "vue-router";

import { showConfirmDialog } from "@/composables/useConfirmDialog";
import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";

interface FileItem { name: string; isDirectory?: boolean }

const props = defineProps<{ component: string }>();
const machineStore = useMachineStore();
const router = useRouter();

const gcodesDir = computed(() =>
	(machineStore.model as { directories?: { gCodes?: string } }).directories?.gCodes || "0:/gcodes");
// Loosely typed: JobFileList/FileList accept a FileBrowserOptions; we only need the initial directory.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jobOptions = computed((): any => ({ initialDirectory: gcodesDir.value, initialFiles: [] }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const explorerOptions = computed((): any => ({ initialDirectory: "0:/", initialFiles: [] }));

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

// Open a file in DWC's real editor (the Explorer "edit" route), mirroring Path.editRoute so we don't
// have to bundle @/utils/path. Directories are navigated inside the FileList, so ignore them here.
function openInEditor(item: FileItem, directory: string): void {
	if (item.isDirectory) return;
	const sdPath = `${directory.replace(/\/+$/, "")}/${item.name}`;
	const match = /^(\d+):\/?(.*)$/.exec(sdPath);
	const volume = match ? match[1] : "0";
	const segs = (match ? match[2] : "").split("/").filter(Boolean);
	const omitVolume = volume === "0" && (segs.length === 0 || !/^\d+$/.test(segs[0]));
	const route = "/Explorer/edit/" + (omitVolume ? segs : [volume, ...segs]).join("/");
	router.push(route).catch(() => { /* duplicate navigation */ });
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
</style>
