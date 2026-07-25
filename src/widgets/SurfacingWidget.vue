<template>
	<div class="srf-root fill-height d-flex flex-column px-2 py-1" :class="{ 'srf-frozen': disabledNow }">
		<span v-if="widget.label" class="srf-label text-truncate flex-shrink-0">{{ widget.label }}</span>

		<div class="srf-fields flex-grow-1">
			<v-text-field v-model.number="width" type="number" :min="1" :step="1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.width')" :disabled="disabledNow" />
			<v-text-field v-model.number="height" type="number" :min="1" :step="1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.height')" :disabled="disabledNow" />
			<v-text-field v-model.number="toolDiameter" type="number" :min="0.1" :step="0.1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.toolDiameter')" :disabled="disabledNow" />
			<v-text-field v-model.number="stepoverPercent" type="number" :min="1" :max="100" :step="1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.stepover')" suffix="%" :disabled="disabledNow" />
			<v-text-field v-model.number="depthPerPass" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.depthPerPass')" :disabled="disabledNow" />
			<v-text-field v-model.number="totalDepth" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.totalDepth')" :disabled="disabledNow" />
			<v-text-field v-model.number="clearance" type="number" :min="0" :step="0.5" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.clearance')" :disabled="disabledNow" />
			<v-text-field v-model.number="feed" type="number" :min="1" :step="10" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.feed')" :disabled="disabledNow" />
			<v-select v-model="direction" :items="directionItems" density="compact" variant="outlined" hide-details
					  :label="$t('plugins.flexibleLayouts.surfacing.direction')" :disabled="disabledNow" />
			<v-text-field v-model.number="spindleRpm" type="number" :min="0" :step="100" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.spindleRpm')"
						  :hint="$t('plugins.flexibleLayouts.surfacing.spindleRpmHint')" persistent-hint :disabled="disabledNow" />
		</div>

		<v-btn block class="flex-shrink-0 mt-2" :color="widget.color || 'primary'" prepend-icon="mdi-layers-triple-outline"
			   :disabled="disabledNow" @click="trigger">
			{{ $t("plugins.flexibleLayouts.surfacing.run") }}
		</v-btn>

		<v-dialog v-model="confirmOpen" max-width="440">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.surfacing.confirmTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">{{ $t("plugins.flexibleLayouts.surfacing.confirmText") }}</div>
					<ul class="srf-summary">
						<li>{{ $t("plugins.flexibleLayouts.surfacing.summaryArea", { width: width, height: height }) }}</li>
						<li>{{ $t("plugins.flexibleLayouts.surfacing.summaryPasses", { passes: preview.passes, rows: preview.rows }) }}</li>
						<li>{{ $t("plugins.flexibleLayouts.surfacing.summaryFile", { name: fileName }) }}</li>
					</ul>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="warning" :loading="running" @click="run">{{ $t("plugins.flexibleLayouts.surfacing.run") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { generateSurfacingGCode, type SurfacingParams } from "../util/surfacing";

const props = defineProps<{ widget: Extract<Widget, { type: "surfacing" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);

// Local, session-editable copies seeded from the widget's persisted defaults - like ProbeWidget's
// diameter/corner, this is a "configure this run" tool, not a fixed display, so edits here aren't
// written back to the saved widget config.
const width = ref(props.widget.width ?? 100);
const height = ref(props.widget.height ?? 100);
const toolDiameter = ref(props.widget.toolDiameter ?? 6);
const stepoverPercent = ref(props.widget.stepoverPercent ?? 40);
const depthPerPass = ref(props.widget.depthPerPass ?? 0.5);
const totalDepth = ref(props.widget.totalDepth ?? 0.5);
const clearance = ref(props.widget.clearance ?? 5);
const feed = ref(props.widget.feed ?? 1000);
const direction = ref<"x" | "y">(props.widget.direction ?? "x");
const spindleRpm = ref(props.widget.spindleRpm ?? 0);

const directionItems = [
	{ title: i18n.global.t("plugins.flexibleLayouts.surfacing.directionX"), value: "x" },
	{ title: i18n.global.t("plugins.flexibleLayouts.surfacing.directionY"), value: "y" },
];

function params(): SurfacingParams {
	return {
		width: width.value, height: height.value, toolDiameter: toolDiameter.value,
		stepoverPercent: stepoverPercent.value, depthPerPass: depthPerPass.value, totalDepth: totalDepth.value,
		clearance: clearance.value, feed: feed.value, direction: direction.value, spindleRpm: spindleRpm.value,
	};
}

const preview = computed(() => generateSurfacingGCode(params()));
const fileName = computed(() => "0:/gcodes/flexible-layouts-surfacing.gcode");

const confirmOpen = ref(false);
const running = ref(false);

function trigger(): void {
	if (disabledNow.value) {
		return;
	}
	if (props.widget.confirm === false) {
		void run();
	} else {
		confirmOpen.value = true;
	}
}

async function run(): Promise<void> {
	running.value = true;
	try {
		const { gcode } = generateSurfacingGCode(params());
		await machineStore.upload({ filename: fileName.value, content: new Blob([gcode], { type: "text/plain" }) }, false, false, false);
		await machineStore.sendCode(`M32 "${fileName.value}"`, false, false);
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.surfacing.run"), (e as Error)?.message ?? String(e));
	} finally {
		running.value = false;
		confirmOpen.value = false;
	}
}
</script>

<style scoped>
.srf-root { min-height: 0; }
.srf-frozen { opacity: 0.5; pointer-events: none; }
.srf-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.srf-fields {
	min-height: 0;
	overflow-y: auto;
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 6px;
	align-content: start;
	/* Outlined fields float their label up onto the border on the top row; without headroom above
	   the grid, the scrollable area's own top edge clips that floated label instead of the notch
	   cutting cleanly into the border. */
	padding-top: 10px;
}
.srf-summary { padding-left: 1.1em; }
.srf-summary li { margin-bottom: 2px; }
</style>
