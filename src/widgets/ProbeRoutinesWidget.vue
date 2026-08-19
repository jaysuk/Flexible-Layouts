<template>
	<div class="prw-root fill-height d-flex flex-column px-2 py-1" :class="{ 'prw-frozen': disabledNow }">
		<span v-if="widget.label" class="prw-label text-truncate flex-shrink-0">{{ widget.label }}</span>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<v-btn-toggle v-model="mode" mandatory density="compact" class="flex-shrink-0 mb-2" divided>
			<v-btn value="toolLength" size="small">{{ $t("plugins.flexibleLayouts.probeRoutines.modeToolLength") }}</v-btn>
			<v-btn value="skew" size="small">{{ $t("plugins.flexibleLayouts.probeRoutines.modeSkew") }}</v-btn>
			<v-btn value="bore" size="small">{{ $t("plugins.flexibleLayouts.probeRoutines.modeBore") }}</v-btn>
			<v-btn value="edge" size="small">{{ $t("plugins.flexibleLayouts.probeRoutines.modeEdge") }}</v-btn>
		</v-btn-toggle>

		<v-alert v-if="statusMessage" :type="statusType" density="compact" variant="tonal" closable class="mb-2 flex-shrink-0"
				 @click:close="statusMessage = ''">{{ statusMessage }}</v-alert>

		<div class="prw-body flex-grow-1">
			<!-- Tool length -->
			<template v-if="mode === 'toolLength'">
				<div v-if="toolLengthProbeIndex === null" class="text-caption text-medium-emphasis">
					{{ $t("plugins.flexibleLayouts.probeRoutines.roleUnassigned") }}
				</div>
				<template v-else>
					<v-text-field v-model.number="toolNumber" type="number" :min="0" density="compact" variant="outlined" hide-details
								  class="mb-2" :label="$t('plugins.flexibleLayouts.probeRoutines.toolNumber')" :disabled="disabledNow" />
					<v-btn block variant="outlined" class="mb-2" :loading="busy === 'master'" :disabled="disabledNow"
						   @click="probeMaster">{{ $t("plugins.flexibleLayouts.probeRoutines.setMaster") }}</v-btn>
					<div v-if="masterProbedZ !== null" class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.probeRoutines.masterSet", { z: masterProbedZ.toFixed(3) }) }}
					</div>
					<v-btn block :color="widget.color || 'primary'" :loading="busy === 'tool'"
						   :disabled="disabledNow || masterProbedZ === null" @click="probeToolAndApply">
						{{ $t("plugins.flexibleLayouts.probeRoutines.probeToolApply") }}
					</v-btn>
				</template>
			</template>

			<!-- Skew -->
			<template v-else-if="mode === 'skew'">
				<div v-if="workpieceProbeIndex === null" class="text-caption text-medium-emphasis">
					{{ $t("plugins.flexibleLayouts.probeRoutines.roleUnassigned") }}
				</div>
				<template v-else>
					<v-row dense>
						<v-col cols="6"><v-select v-model="skewAxis" :items="axisItemsXY" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.probeAxis')" :disabled="disabledNow" /></v-col>
						<v-col cols="6"><v-select v-model="skewDirection" :items="directionItems" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.direction')" :disabled="disabledNow" /></v-col>
					</v-row>
					<div class="d-flex ga-2 mt-2 mb-2">
						<v-btn variant="outlined" class="flex-grow-1" :loading="busy === 'skew1'" :disabled="disabledNow" @click="touchSkew(1)">
							{{ $t("plugins.flexibleLayouts.probeRoutines.touch1") }}
						</v-btn>
						<v-btn variant="outlined" class="flex-grow-1" :loading="busy === 'skew2'" :disabled="disabledNow" @click="touchSkew(2)">
							{{ $t("plugins.flexibleLayouts.probeRoutines.touch2") }}
						</v-btn>
					</div>
					<div v-if="skewAngle !== null" class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.probeRoutines.skewAngle", { angle: skewAngle.toFixed(3) }) }}
					</div>
					<v-row dense class="mb-2">
						<v-col cols="6"><v-text-field v-model.number="rotationCentreX" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.centreX')" :disabled="disabledNow" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="rotationCentreY" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.centreY')" :disabled="disabledNow" /></v-col>
					</v-row>
					<v-btn block :color="widget.color || 'primary'" :disabled="disabledNow || skewAngle === null" @click="applyRotation">
						{{ $t("plugins.flexibleLayouts.probeRoutines.applyRotation") }}
					</v-btn>
				</template>
			</template>

			<!-- Bore / boss -->
			<template v-else-if="mode === 'bore'">
				<div v-if="workpieceProbeIndex === null" class="text-caption text-medium-emphasis">
					{{ $t("plugins.flexibleLayouts.probeRoutines.roleUnassigned") }}
				</div>
				<template v-else>
					<div class="prw-bore-grid mb-2">
						<v-btn variant="outlined" size="small" :loading="busy === 'boreYPlus'" :disabled="disabledNow" @click="touchBore('yPlus')">+Y</v-btn>
						<v-btn variant="outlined" size="small" :loading="busy === 'boreXMinus'" :disabled="disabledNow" @click="touchBore('xMinus')">-X</v-btn>
						<v-btn variant="outlined" size="small" :loading="busy === 'boreXPlus'" :disabled="disabledNow" @click="touchBore('xPlus')">+X</v-btn>
						<v-btn variant="outlined" size="small" :loading="busy === 'boreYMinus'" :disabled="disabledNow" @click="touchBore('yMinus')">-Y</v-btn>
					</div>
					<div v-if="boreCentre" class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.probeRoutines.boreCentre", { x: boreCentre.x.toFixed(3), y: boreCentre.y.toFixed(3) }) }}
					</div>
					<v-btn block :color="widget.color || 'primary'" :disabled="disabledNow || !boreCentre" @click="applyBoreCentre">
						{{ $t("plugins.flexibleLayouts.probeRoutines.moveToCentreZero") }}
					</v-btn>
				</template>
			</template>

			<!-- Edge -->
			<template v-else-if="mode === 'edge'">
				<div v-if="workpieceProbeIndex === null" class="text-caption text-medium-emphasis">
					{{ $t("plugins.flexibleLayouts.probeRoutines.roleUnassigned") }}
				</div>
				<template v-else>
					<v-row dense>
						<v-col cols="4"><v-select v-model="edgeAxis" :items="axisItemsXYZ" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.probeAxis')" :disabled="disabledNow" /></v-col>
						<v-col cols="4"><v-select v-model="edgeDirection" :items="directionItems" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.direction')" :disabled="disabledNow" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="edgeTargetValue" type="number" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.targetValue')" :disabled="disabledNow" /></v-col>
					</v-row>
					<v-btn block variant="outlined" class="mt-2 mb-2" :loading="busy === 'edge'" :disabled="disabledNow" @click="touchEdge">
						{{ $t("plugins.flexibleLayouts.probeRoutines.touch") }}
					</v-btn>
					<div v-if="edgeTouched !== null" class="text-caption text-medium-emphasis mb-2">
						{{ $t("plugins.flexibleLayouts.probeRoutines.edgeTouched", { value: edgeTouched.toFixed(3) }) }}
					</div>
					<v-btn block :color="widget.color || 'primary'" :disabled="disabledNow || edgeTouched === null" @click="applyEdgeOffset">
						{{ $t("plugins.flexibleLayouts.probeRoutines.setWorkOffset") }}
					</v-btn>
				</template>
			</template>
		</div>

		<v-expansion-panels variant="accordion" class="prw-panels flex-shrink-0">
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.probeRoutines.settingsTitle')">
				<v-expansion-panel-text>
					<v-row dense>
						<v-col cols="6"><v-text-field v-model.number="feedFast" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.feedFast')" @change="patch?.({ feedFast })" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="feedSlow" type="number" :min="1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.feedSlow')" @change="patch?.({ feedSlow })" /></v-col>
					</v-row>
					<v-row dense class="mt-1">
						<v-col cols="6"><v-text-field v-model.number="searchDistance" type="number" :min="0.1" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.searchDistance')" @change="patch?.({ searchDistance })" /></v-col>
						<v-col cols="6"><v-text-field v-model.number="backoff" type="number" :min="0.01" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.backoff')" @change="patch?.({ backoff })" /></v-col>
					</v-row>
				</v-expansion-panel-text>
			</v-expansion-panel>
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.probeRoutines.rolesTitle')">
				<v-expansion-panel-text>
					<v-row dense>
						<v-col cols="4"><v-text-field v-model.number="roleToolLength" type="number" :min="0" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.roleToolLength')" @change="saveRoles" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="roleWorkpiece" type="number" :min="0" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.roleWorkpiece')" @change="saveRoles" /></v-col>
						<v-col cols="4"><v-text-field v-model.number="roleFeature" type="number" :min="0" density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.probeRoutines.roleFeature')" @change="saveRoles" /></v-col>
					</v-row>
					<div class="text-caption text-medium-emphasis mt-2">{{ $t("plugins.flexibleLayouts.probeRoutines.rolesHelp") }}</div>
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>

		<v-dialog v-model="confirmOpen" max-width="440">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.probeRoutines.confirmTitle") }}</v-card-title>
				<v-card-text>
					<UnhomedWarning :axes="unhomedNow" class="mb-2" />
					<pre class="prw-pre">{{ pendingCmd }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="warning" :loading="busy === 'apply'" @click="runPending">{{ $t("plugins.flexibleLayouts.probeRoutines.run") }}</v-btn>
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
import { getProbeRoles, setProbeRole } from "../model/probing/roles";
import {
	buildRotation, buildSetWorkOffset, buildToolOffset, buildTouch,
	computeBoreCentre, computeSkewAngle, computeToolLengthOffset,
	type BoreTouches, type EdgeTouch,
} from "../model/probing/routines";
import { resolveOmPath } from "../util/omPath";
import { sendCodeChecked } from "../util/codeReply";
import { unhomedAxes } from "../util/homedCheck";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "probeRoutines" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const patch = inject(WIDGET_PATCH_KEY, null);
const widget = props.widget;

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));

function t(k: string, args?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.probeRoutines.${k}`, args ?? {});
}

const mode = ref<"toolLength" | "skew" | "bore" | "edge">("toolLength");
const feedFast = ref(widget.feedFast ?? 300);
const feedSlow = ref(widget.feedSlow ?? 60);
const searchDistance = ref(widget.searchDistance ?? 10);
const backoff = ref(widget.backoff ?? 1);

const axisItemsXY = [{ title: "X", value: "X" }, { title: "Y", value: "Y" }];
const axisItemsXYZ = [{ title: "X", value: "X" }, { title: "Y", value: "Y" }, { title: "Z", value: "Z" }];
const directionItems = [{ title: "+", value: 1 }, { title: "-", value: -1 }];

const roles = ref(getProbeRoles());
const roleToolLength = ref<number | null>(roles.value.toolLength ?? null);
const roleWorkpiece = ref<number | null>(roles.value.workpiece ?? null);
const roleFeature = ref<number | null>(roles.value.feature ?? null);
function saveRoles(): void {
	setProbeRole("toolLength", Number.isFinite(roleToolLength.value) ? roleToolLength.value : null);
	setProbeRole("workpiece", Number.isFinite(roleWorkpiece.value) ? roleWorkpiece.value : null);
	setProbeRole("feature", Number.isFinite(roleFeature.value) ? roleFeature.value : null);
}
const toolLengthProbeIndex = computed(() => roleToolLength.value ?? null);
const workpieceProbeIndex = computed(() => roleWorkpiece.value ?? null);

const statusMessage = ref("");
const statusType = ref<"success" | "error">("success");
const busy = ref<string | null>(null);

/**
 * Reads a MACHINE coordinate - deliberately `machinePosition`, not `userPosition`: the object model
 * documents machinePosition as "the machine position of the move being performed or of the last one"
 * whereas userPosition "reflects the target position of the last move fed into the look-ahead
 * buffer", i.e. where the machine was ASKED to go, which after a probe that stopped early on contact
 * is not where it actually is. Only machinePosition reports a real measurement.
 *
 * The corollary is that these values are NOT valid targets for a plain G0/G1, which in G90 are
 * interpreted in the active workplace coordinate system (and with tool offsets applied). Anything
 * feeding a value from here back into a move must prefix it with G53 - see {@link moveToMachineXY}.
 */
function axisPosition(letter: "X" | "Y" | "Z"): number {
	const arr = resolveOmPath(machineStore.model, "move.axes");
	if (!Array.isArray(arr)) { return 0; }
	const a = (arr as Array<{ letter?: string; machinePosition?: number | null }>).find((x) => (x?.letter ?? "").toUpperCase() === letter);
	return a?.machinePosition ?? 0;
}

/**
 * A rapid to an absolute MACHINE XY position. G53 makes the coordinates on its own line machine
 * coordinates, ignoring both the active WCS offset and any tool offset, and is explicitly documented
 * as non-modal ("must be programmed on each line on which it is intended to be active"), hence one
 * G53 per move line rather than one for the block.
 */
function moveToMachineXY(x: number, y: number): string {
	return `G90\nG53 G0 X${fmtCoord(x)} Y${fmtCoord(y)}`;
}

function fmtCoord(n: number): string {
	return String(Math.round(n * 1e6) / 1e6);
}

/** Every code this widget sends goes through here or {@link send} - RRF reports a refused probe
 *  ("Error: Probe was not triggered during probing move") as a RESOLVED reply, so a bare sendCode
 *  would let a failed touch fall through to reading back a stale position as if it were a result. */
function send(code: string): Promise<string> {
	return sendCodeChecked((c) => machineStore.sendCode(c, false, false), code);
}

/**
 * The object model updates asynchronously as DWC's own poll cycle catches up, so the position read
 * back straight after a probe can still be the PRE-probe one. `waitForModelUpdate()` resolves on the
 * next full model update, which is the actual event being waited for - deterministic, and no slower
 * than it has to be.
 *
 * Read as a plain property rather than called directly because it is not present on every DWC a
 * plugin can be installed into (`plugin.json`'s `dwcVersion: "auto-major"` only resolves to "3.7" and
 * cannot express a finer floor - the same constraint documented in composables/useFlexDisplay.ts).
 * Where it is missing this falls back to the previous fixed pause, which is racy but no worse than
 * what this widget already did.
 */
async function settle(): Promise<void> {
	const store = machineStore as unknown as { waitForModelUpdate?: () => Promise<void> };
	if (typeof store.waitForModelUpdate === "function") {
		await store.waitForModelUpdate();
		return;
	}
	await new Promise((resolve) => setTimeout(resolve, 350));
}

async function sendAndSettle(code: string): Promise<void> {
	await send(code);
	await settle();
}

function fail(e: unknown): void {
	statusType.value = "error";
	statusMessage.value = (e as Error)?.message ?? String(e);
	uiStore.makeNotification(LogLevel.error, t("title"), statusMessage.value);
}

// --- Confirm-before-send for anything that writes an offset/rotation --------------------------------
const confirmOpen = ref(false);
const pendingCmd = ref("");
let pendingAction: (() => Promise<void>) | null = null;
function confirm(cmd: string, action: () => Promise<void>): void {
	pendingCmd.value = cmd;
	pendingAction = action;
	confirmOpen.value = true;
}
async function runPending(): Promise<void> {
	if (!pendingAction) { return; }
	busy.value = "apply";
	try {
		await pendingAction();
		statusType.value = "success";
		statusMessage.value = t("applied");
	} catch (e) {
		fail(e);
	} finally {
		busy.value = null;
		confirmOpen.value = false;
	}
}

// --- Tool length --------------------------------------------------------------------------------------
const toolNumber = ref(0);
const masterProbedZ = ref<number | null>(null);

async function probeMaster(): Promise<void> {
	if (toolLengthProbeIndex.value === null) { return; }
	busy.value = "master";
	try {
		await sendAndSettle(buildTouch({ probeIndex: toolLengthProbeIndex.value, axis: "Z", direction: -1, searchDistance: searchDistance.value, backoff: backoff.value, feedFast: feedFast.value, feedSlow: feedSlow.value }));
		masterProbedZ.value = axisPosition("Z");
	} catch (e) {
		fail(e);
	} finally {
		busy.value = null;
	}
}

async function probeToolAndApply(): Promise<void> {
	if (toolLengthProbeIndex.value === null || masterProbedZ.value === null) { return; }
	busy.value = "tool";
	try {
		await sendAndSettle(buildTouch({ probeIndex: toolLengthProbeIndex.value, axis: "Z", direction: -1, searchDistance: searchDistance.value, backoff: backoff.value, feedFast: feedFast.value, feedSlow: feedSlow.value }));
		const toolProbedZ = axisPosition("Z");
		const offset = computeToolLengthOffset(masterProbedZ.value, toolProbedZ);
		confirm(buildToolOffset(toolNumber.value, offset), () => send(buildToolOffset(toolNumber.value, offset)).then(() => {}));
	} catch (e) {
		fail(e);
	} finally {
		busy.value = null;
	}
}

// --- Skew ---------------------------------------------------------------------------------------------
const skewAxis = ref<"X" | "Y">("X");
const skewDirection = ref<1 | -1>(1);
const rotationCentreX = ref(0);
const rotationCentreY = ref(0);
const skewTouch1 = ref<EdgeTouch | null>(null);
const skewTouch2 = ref<EdgeTouch | null>(null);
// skewAxis is passed through because the sign of the result depends on it - see computeSkewAngle.
const skewAngle = computed(() => (skewTouch1.value && skewTouch2.value)
	? computeSkewAngle(skewTouch1.value, skewTouch2.value, skewAxis.value)
	: null);

async function touchSkew(which: 1 | 2): Promise<void> {
	if (workpieceProbeIndex.value === null) { return; }
	busy.value = `skew${which}`;
	try {
		await sendAndSettle(buildTouch({ probeIndex: workpieceProbeIndex.value, axis: skewAxis.value, direction: skewDirection.value, searchDistance: searchDistance.value, backoff: backoff.value, feedFast: feedFast.value, feedSlow: feedSlow.value }));
		const alongAxis: "X" | "Y" = skewAxis.value === "X" ? "Y" : "X";
		const touch: EdgeTouch = { along: axisPosition(alongAxis), across: axisPosition(skewAxis.value) };
		if (which === 1) { skewTouch1.value = touch; } else { skewTouch2.value = touch; }
	} catch (e) {
		fail(e);
	} finally {
		busy.value = null;
	}
}

function applyRotation(): void {
	if (skewAngle.value === null) { return; }
	const cmd = buildRotation(skewAngle.value, rotationCentreX.value, rotationCentreY.value);
	confirm(cmd, () => send(cmd).then(() => {}));
}

// --- Bore / boss ----------------------------------------------------------------------------------------
const boreTouches = ref<Partial<BoreTouches>>({});
const boreCentre = computed(() => {
	const b = boreTouches.value;
	if (b.xPlus === undefined || b.xMinus === undefined || b.yPlus === undefined || b.yMinus === undefined) { return null; }
	return computeBoreCentre(b as BoreTouches);
});

async function touchBore(which: keyof BoreTouches): Promise<void> {
	if (workpieceProbeIndex.value === null) { return; }
	const axis: "X" | "Y" = which === "xPlus" || which === "xMinus" ? "X" : "Y";
	const direction: 1 | -1 = which === "xPlus" || which === "yPlus" ? 1 : -1;
	busy.value = `bore${which[0].toUpperCase()}${which.slice(1)}`;
	try {
		const start = { x: axisPosition("X"), y: axisPosition("Y") };
		await sendAndSettle(buildTouch({ probeIndex: workpieceProbeIndex.value, axis, direction, searchDistance: searchDistance.value, backoff: backoff.value, feedFast: feedFast.value, feedSlow: feedSlow.value }));
		boreTouches.value = { ...boreTouches.value, [which]: axisPosition(axis) };
		// Return to the common start point so all four touches are referenced from the same spot.
		// `start` came from axisPosition (machine coords), so this must move in machine coords too -
		// a plain G0 would read them as workplace coordinates and fly to the wrong place by exactly
		// the active WCS offset.
		await sendAndSettle(moveToMachineXY(start.x, start.y));
	} catch (e) {
		fail(e);
	} finally {
		busy.value = null;
	}
}

function applyBoreCentre(): void {
	if (!boreCentre.value) { return; }
	// The centre is the mean of four machinePosition readings, so the move to it is a machine-coordinate
	// move; the G10 L20s that follow then zero the WCS at wherever the machine physically ended up.
	const cmd = `${moveToMachineXY(boreCentre.value.x, boreCentre.value.y)}\n${buildSetWorkOffset("X", 0)}\n${buildSetWorkOffset("Y", 0)}`;
	confirm(cmd, () => send(cmd).then(() => {}));
}

// --- Edge -----------------------------------------------------------------------------------------------
const edgeAxis = ref<"X" | "Y" | "Z">("X");
const edgeDirection = ref<1 | -1>(1);
const edgeTargetValue = ref(0);
const edgeTouched = ref<number | null>(null);

async function touchEdge(): Promise<void> {
	if (workpieceProbeIndex.value === null) { return; }
	busy.value = "edge";
	try {
		await sendAndSettle(buildTouch({ probeIndex: workpieceProbeIndex.value, axis: edgeAxis.value, direction: edgeDirection.value, searchDistance: searchDistance.value, backoff: backoff.value, feedFast: feedFast.value, feedSlow: feedSlow.value }));
		edgeTouched.value = axisPosition(edgeAxis.value);
	} catch (e) {
		fail(e);
	} finally {
		busy.value = null;
	}
}

function applyEdgeOffset(): void {
	if (edgeTouched.value === null) { return; }
	const cmd = buildSetWorkOffset(edgeAxis.value, edgeTargetValue.value);
	confirm(cmd, () => send(cmd).then(() => {}));
}
</script>

<style scoped>
.prw-root { min-height: 0; }
.prw-frozen { opacity: 0.5; pointer-events: none; }
.prw-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.prw-body { min-height: 0; overflow-y: auto; }
.prw-panels { max-height: 40%; overflow-y: auto; }
.prw-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; }
.prw-bore-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; max-width: 220px; }
</style>
