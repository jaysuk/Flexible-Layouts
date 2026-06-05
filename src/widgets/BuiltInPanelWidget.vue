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
			<v-alert v-else type="info" variant="tonal" density="compact" class="ma-2">
				{{ $t("plugins.flexibleLayouts.widget.panelMissing", { name: component }) }}
			</v-alert>
		</template>
	</div>
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";

const props = defineProps<{ component: string }>();

const errored = ref(false);

// A panel that throws during render (e.g. it assumes a context the canvas doesn't provide) must
// not take the whole page down. Catch it here and show an inline warning instead.
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
