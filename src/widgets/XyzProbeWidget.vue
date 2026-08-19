<template>
	<div class="xpw-root fill-height d-flex flex-column px-2 py-1" :class="{ 'xpw-frozen': disabledNow }">
		<span v-if="widget.label" class="xpw-label text-truncate flex-shrink-0">{{ widget.label }}</span>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<v-alert v-if="macrosOutdated" type="warning" density="compact" variant="tonal" closable class="mb-2 flex-shrink-0"
				 @click:close="macrosOutdated = false">
			{{ $t("plugins.flexibleLayouts.xyzProbe.macrosOutdated") }}
			<template #append>
				<v-btn size="x-small" variant="tonal" :loading="deployingMacros" :disabled="disabledNow" @click="restoreMacros">
					{{ $t("plugins.flexibleLayouts.xyzProbe.restoreMacrosAction") }}
				</v-btn>
			</template>
		</v-alert>

		<div class="d-flex align-center ga-2 mb-2 flex-shrink-0">
			<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.xyzProbe.status") }}:</span>
			<v-chip size="x-small" :color="probeTriggered ? 'warning' : undefined" variant="tonal">
				{{ probeTriggered ? $t("plugins.flexibleLayouts.xyzProbe.triggered") : $t("plugins.flexibleLayouts.xyzProbe.notTriggered") }}
			</v-chip>
			<v-spacer />
			<v-btn icon="mdi-restore" size="small" variant="text" :loading="deployingMacros" :disabled="disabledNow"
				   :title="$t('plugins.flexibleLayouts.xyzProbe.restoreMacrosHelp')" @click="restoreMacros" />
		</div>

		<div class="d-flex align-start ga-2 mb-2 flex-shrink-0 flex-wrap">
			<v-text-field v-model.number="endmillDiameter" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined"
						  hide-details class="xpw-endmill" :label="$t('plugins.flexibleLayouts.xyzProbe.endmillDiameter')" :disabled="disabledNow"
						  @change="patch?.({ endmillDiameter })" />
			<v-select v-model="corner" :items="cornerItems" density="compact" variant="outlined" hide-details
					  class="xpw-corner" :label="$t('plugins.flexibleLayouts.xyzProbe.corner')" :disabled="disabledNow"
					  @update:model-value="patch?.({ corner })" />
		</div>

		<v-btn block :color="widget.color || 'primary'" prepend-icon="mdi-crosshairs-gps" class="mb-2 flex-shrink-0"
			   :loading="probingOp === 'corner'" :disabled="disabledNow" @click="trigger('corner')">
			{{ $t("plugins.flexibleLayouts.xyzProbe.probeCorner") }}
		</v-btn>

		<div class="d-flex ga-2 mb-2 flex-shrink-0">
			<v-btn variant="outlined" class="flex-grow-1" :loading="probingOp === 'x'" :disabled="disabledNow" @click="trigger('x')">
				{{ $t("plugins.flexibleLayouts.xyzProbe.probeX") }}
			</v-btn>
			<v-btn variant="outlined" class="flex-grow-1" :loading="probingOp === 'y'" :disabled="disabledNow" @click="trigger('y')">
				{{ $t("plugins.flexibleLayouts.xyzProbe.probeY") }}
			</v-btn>
			<v-btn variant="outlined" class="flex-grow-1" :loading="probingOp === 'z'" :disabled="disabledNow" @click="trigger('z')">
				{{ $t("plugins.flexibleLayouts.xyzProbe.probeZ") }}
			</v-btn>
		</div>

		<v-alert v-if="statusMessage" :type="statusType" density="compact" variant="tonal" closable class="mb-2 flex-shrink-0"
				 @click:close="statusMessage = ''">
			{{ statusMessage }}
		</v-alert>

		<v-expansion-panels variant="accordion" class="xpw-settings flex-shrink-0">
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.xyzProbe.settingsTitle')">
				<v-expansion-panel-text>
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="feedrate" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.feedrate')" :disabled="disabledNow" @change="patch?.({ feedrate })" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="searchMargin" type="number" :min="0.1" :step="0.5" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.searchMargin')" :disabled="disabledNow" @change="patch?.({ searchMargin })" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="4"><v-text-field v-model.number="plateWidth" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.plateWidth')" :disabled="disabledNow" @change="patch?.({ plateWidth })" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="plateHeight" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.plateHeight')" :disabled="disabledNow" @change="patch?.({ plateHeight })" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="plateThickness" type="number" :min="0.01" :step="0.01" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.plateThickness')" :disabled="disabledNow" @change="patch?.({ plateThickness })" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="6"><v-text-field v-model.number="xOffset" type="number" :step="0.01" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.xOffset')" :disabled="disabledNow" @change="patch?.({ xOffset })" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="yOffset" type="number" :step="0.01" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.xyzProbe.yOffset')" :disabled="disabledNow" @change="patch?.({ yOffset })" /></v-col>
					</v-row>
					<div class="text-caption text-medium-emphasis mt-2">{{ $t("plugins.flexibleLayouts.xyzProbe.requirementsNote") }}</div>
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>

		<v-dialog v-model="confirmOpen" max-width="440">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.xyzProbe.confirmTitle") }}</v-card-title>
				<v-card-text>
					<v-alert type="warning" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.xyzProbe.safetyNote") }}
					</v-alert>
					<UnhomedWarning :axes="unhomedNow" class="mb-3" />
					<pre class="xpw-pre">{{ pendingCmd }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="warning" @click="runPending">{{ $t("plugins.flexibleLayouts.xyzProbe.run") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import {
	buildXyzProbeCommand, deployXyzProbeMacros, xyzProbeMacrosMissing, xyzProbeMacrosOutdated, XYZ_PROBE_CORNER_FILE,
	XYZ_PROBE_MACRO_FOLDER, XYZ_PROBE_X_FILE, XYZ_PROBE_Y_FILE, XYZ_PROBE_Z_FILE,
	type CornerId, type XyzProbeSettings,
} from "../util/xyzProbe";
import { unhomedAxes } from "../util/homedCheck";
import { isProbeTriggered, type ProbeTriggerInfo } from "../util/probe";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "xyzProbe" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const io = defaultMachineIO();
const patch = inject(WIDGET_PATCH_KEY, null);

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));

function t(k: string, args?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.xyzProbe.${k}`, args ?? {});
}

// Local, session-editable copies seeded from the widget's persisted defaults - same "configure this
// run" pattern as ProbeWidget's dia/corner and SurfacingWidget's dimension fields: edits here aren't
// written back to the saved widget config, only PropertiesDialog changes the persisted defaults.
const endmillDiameter = ref(props.widget.endmillDiameter ?? 6.35);
const plateWidth = ref(props.widget.plateWidth ?? 60);
const plateHeight = ref(props.widget.plateHeight ?? 60);
const plateThickness = ref(props.widget.plateThickness ?? 5);
const xOffset = ref(props.widget.xOffset ?? 10);
const yOffset = ref(props.widget.yOffset ?? 10);
const feedrate = ref(props.widget.feedrate ?? 500);
const searchMargin = ref(props.widget.searchMargin ?? 10);
const corner = ref<CornerId>(props.widget.corner ?? "FL");

const macroFolder = computed(() => props.widget.macroFolder || XYZ_PROBE_MACRO_FOLDER);
const probeIndex = computed(() => props.widget.probeIndex ?? 0);

const cornerItems = [
	{ title: t("cornerFL"), value: "FL" },
	{ title: t("cornerFR"), value: "FR" },
	{ title: t("cornerBL"), value: "BL" },
	{ title: t("cornerBR"), value: "BR" },
];

function settings(): XyzProbeSettings {
	return {
		endmillDiameter: endmillDiameter.value || 0,
		plateWidth: plateWidth.value || 0,
		plateHeight: plateHeight.value || 0,
		plateThickness: plateThickness.value || 0,
		xOffset: xOffset.value || 0,
		yOffset: yOffset.value || 0,
		feedrate: feedrate.value || 0,
		searchMargin: searchMargin.value || 0,
	};
}

// Live probe reading, same object-model path as FL's own indicator example (sensors.probes[n].value[0]).
const probe = computed<ProbeTriggerInfo | null>(() => {
	const probes = machineStore.model.sensors?.probes as Array<ProbeTriggerInfo | null> | undefined;
	return probes?.[probeIndex.value] ?? null;
});
const probeTriggered = computed(() => isProbeTriggered(probe.value));

// --- Macro deploy / restore ------------------------------------------------------------------------

const deployingMacros = ref(false);
const statusMessage = ref("");
const statusType = ref<"success" | "error">("success");
const macrosOutdated = ref(false);

async function checkAndDeployMacros(): Promise<void> {
	if (!machineStore.isConnected) { return; }
	const missing = await xyzProbeMacrosMissing(io, macroFolder.value);
	if (missing) {
		await deployMacros();
		macrosOutdated.value = false;
		return;
	}
	macrosOutdated.value = await xyzProbeMacrosOutdated(io, macroFolder.value);
}

async function deployMacros(): Promise<boolean> {
	deployingMacros.value = true;
	try {
		const ok = await deployXyzProbeMacros(io, macroFolder.value);
		if (!ok) {
			statusType.value = "error";
			statusMessage.value = t("deployFailed");
		}
		return ok;
	} finally {
		deployingMacros.value = false;
	}
}

async function restoreMacros(): Promise<void> {
	if (disabledNow.value) { return; }
	const ok = await deployMacros();
	if (ok) {
		statusType.value = "success";
		statusMessage.value = t("macrosRestored");
		macrosOutdated.value = false;
	}
}

onMounted(() => {
	void checkAndDeployMacros();
});

// --- Probing ---------------------------------------------------------------------------------------

type ProbingOp = "corner" | "x" | "y" | "z";
const FILE_FOR_OP: Record<ProbingOp, string> = {
	corner: XYZ_PROBE_CORNER_FILE, x: XYZ_PROBE_X_FILE, y: XYZ_PROBE_Y_FILE, z: XYZ_PROBE_Z_FILE,
};

const confirmOpen = ref(false);
const pendingCmd = ref("");
const pendingOp = ref<ProbingOp>("corner");
const probingOp = ref<ProbingOp | null>(null);

function trigger(op: ProbingOp): void {
	if (disabledNow.value) { return; }
	pendingOp.value = op;
	pendingCmd.value = buildXyzProbeCommand(macroFolder.value, FILE_FOR_OP[op], corner.value, settings());
	if (props.widget.confirm === false) {
		void runPending();
	} else {
		confirmOpen.value = true;
	}
}

async function runPending(): Promise<void> {
	confirmOpen.value = false;
	const op = pendingOp.value;
	const code = pendingCmd.value;
	if (!code) { return; }
	probingOp.value = op;
	statusMessage.value = "";
	try {
		await machineStore.sendCode(code, false, false);
		statusType.value = "success";
		statusMessage.value = op === "corner" ? t("cornerProbed", { corner: t(`corner${corner.value}`) }) : t("axisProbed", { axis: op.toUpperCase() });
	} catch (e) {
		statusType.value = "error";
		statusMessage.value = (e as Error)?.message ?? String(e);
		uiStore.makeNotification(LogLevel.error, t("title"), statusMessage.value);
	} finally {
		probingOp.value = null;
	}
}
</script>

<style scoped>
.xpw-root { min-height: 0; }
.xpw-frozen { opacity: 0.5; pointer-events: none; }
.xpw-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.xpw-endmill { max-width: 160px; }
.xpw-corner { max-width: 180px; flex: 1 1 auto; }
.xpw-settings { max-height: 40%; overflow-y: auto; }
.xpw-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; }
</style>
