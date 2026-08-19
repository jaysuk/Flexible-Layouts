<template>
	<div class="srf-root fill-height d-flex flex-column px-2 py-1" :class="{ 'srf-frozen': disabledNow }">
		<span v-if="widget.label" class="srf-label text-truncate flex-shrink-0">{{ widget.label }}</span>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<div class="srf-fields flex-grow-1">
			<v-text-field v-model.number="width" type="number" :min="1" :step="1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.width')" :disabled="disabledNow" @change="patch?.({ width })" />
			<v-text-field v-model.number="height" type="number" :min="1" :step="1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.height')" :disabled="disabledNow" @change="patch?.({ height })" />
			<v-text-field v-model.number="toolDiameter" type="number" :min="0.1" :step="0.1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.toolDiameter')" :disabled="disabledNow" @change="patch?.({ toolDiameter })" />
			<v-text-field v-model.number="stepoverPercent" type="number" :min="1" :max="100" :step="1" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.stepover')" suffix="%" :disabled="disabledNow" @change="patch?.({ stepoverPercent })" />
			<v-text-field v-model.number="depthPerPass" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.depthPerPass')" :disabled="disabledNow" @change="patch?.({ depthPerPass })" />
			<v-text-field v-model.number="totalDepth" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.totalDepth')" :disabled="disabledNow" @change="patch?.({ totalDepth })" />
			<v-text-field v-model.number="clearance" type="number" :min="0" :step="0.5" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.clearance')" :disabled="disabledNow" @change="patch?.({ clearance })" />
			<v-text-field v-model.number="feed" type="number" :min="1" :step="10" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.feed')" :disabled="disabledNow" @change="patch?.({ feed })" />
			<v-select v-model="direction" :items="directionItems" density="compact" variant="outlined" hide-details
					  :label="$t('plugins.flexibleLayouts.surfacing.direction')" :disabled="disabledNow" @update:model-value="patch?.({ direction })" />
			<v-text-field v-model.number="spindleRpm" type="number" :min="0" :step="100" density="compact" variant="outlined"
						  hide-details :label="$t('plugins.flexibleLayouts.surfacing.spindleRpm')"
						  :hint="$t('plugins.flexibleLayouts.surfacing.spindleRpmHint')" persistent-hint :disabled="disabledNow" @change="patch?.({ spindleRpm })" />
		</div>

		<v-btn block class="flex-shrink-0 mt-2" :color="widget.color || 'primary'" prepend-icon="mdi-layers-triple-outline"
			   :disabled="disabledNow || !paramsValid" @click="trigger">
			{{ $t("plugins.flexibleLayouts.surfacing.run") }}
		</v-btn>

		<v-dialog v-model="confirmOpen" max-width="440">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.surfacing.confirmTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">{{ $t("plugins.flexibleLayouts.surfacing.confirmText") }}</div>
					<UnhomedWarning :axes="unhomedNow" class="mb-2" />
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
import { computed, inject, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { generateSurfacingGCode, passCount, rowCount, type SurfacingParams } from "../util/surfacing";
import { sendCodeChecked } from "../util/codeReply";
import { unhomedAxes } from "../util/homedCheck";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "surfacing" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const patch = inject(WIDGET_PATCH_KEY, null);

// Starting a facing job while the machine is already mid-job (or mid-tool-change, or halted) would
// either be refused by RRF or collide with what's running - the same conservative status set the
// other hardware-touching widgets use.
const BUSY_STATUSES = new Set([
	"starting", "updating", "processing", "simulating", "pausing", "paused",
	"resuming", "cancelling", "busy", "changingTool", "halted",
]);
const machineBusy = computed(() => BUSY_STATUSES.has(String(machineStore.model.state?.status ?? "")));

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen || machineBusy.value);
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));

// Local, session-editable copies seeded from the widget's persisted defaults, same "configure this
// run" pattern as ProbeWidget's diameter/corner - but now also patched back on change/blur (see
// util/widgetPatch.ts) so next session starts from what was last used, not the original default.
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

// passCount/rowCount rather than generateSurfacingGCode: the confirm dialog only needs those two
// numbers, and this computed re-runs on every keystroke in any of the ten fields. Building the whole
// program for that meant generating (and discarding) thousands of lines per keypress on a large area
// with a fine stepover. These two helpers were already exported and unit-tested for exactly this and
// were simply never wired up. It also keeps the preview safe now that the emitter throws on a
// non-finite value - neither helper formats anything, so a half-typed field can't break the render.
const preview = computed(() => ({ passes: passCount(params()), rows: rowCount(params()) }));

/** Every numeric field must hold a real number before a program can be generated - an empty field
 *  reads as NaN, which the emitter now (correctly) refuses rather than writing "XNaN" into a file. */
const paramsValid = computed(() => {
	const p = params();
	return ([p.width, p.height, p.toolDiameter, p.stepoverPercent, p.depthPerPass, p.totalDepth,
		p.clearance, p.feed] as Array<unknown>).every((v) => typeof v === "number" && Number.isFinite(v));
});

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
		// Checked, not bare: RRF refusing to start the job (busy, file unreadable, no tool selected)
		// comes back as a RESOLVED "Error: ..." reply, so a plain sendCode would report success while
		// nothing ran at all - see util/codeReply.ts.
		await sendCodeChecked((c) => machineStore.sendCode(c, false, false), `M32 "${fileName.value}"`);
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
