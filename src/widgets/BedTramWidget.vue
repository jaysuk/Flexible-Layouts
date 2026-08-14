<template>
	<div class="btr-root fill-height d-flex flex-column px-2 py-1" :class="{ 'btr-frozen': disabledNow }">
		<span v-if="widget.label" class="btr-label text-truncate flex-shrink-0">{{ widget.label }}</span>
		<UnhomedWarning :axes="unhomedNow" class="flex-shrink-0 mb-1" />

		<div class="btr-results flex-grow-1">
			<div v-if="calibration" class="btr-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.bedTram.calibration") }}</span>
				<span class="btr-value">{{ $t("plugins.flexibleLayouts.bedTram.meanDeviation", { mean: fmt(calibration.mean), deviation: fmt(calibration.deviation) }) }}</span>
			</div>
			<div v-if="meshDeviation" class="btr-row">
				<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.bedTram.mesh") }}</span>
				<span class="btr-value">{{ $t("plugins.flexibleLayouts.bedTram.meanDeviation", { mean: fmt(meshDeviation.mean), deviation: fmt(meshDeviation.deviation) }) }}</span>
			</div>
			<div v-if="!calibration && !meshDeviation" class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.bedTram.noData") }}
			</div>

			<div v-if="lastRunAt" class="btr-last mt-2">
				<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.bedTram.lastRun", { when: lastRunAt }) }}</div>
				<div v-if="lastResult" class="text-caption btr-result">{{ lastResult }}</div>
			</div>
		</div>

		<v-btn block class="flex-shrink-0 mt-2" :color="widget.color || 'primary'" prepend-icon="mdi-square-outline"
			   :loading="running" :disabled="disabledNow" @click="trigger">
			{{ $t("plugins.flexibleLayouts.bedTram.run") }}
		</v-btn>

		<v-dialog v-model="confirmOpen" max-width="420">
			<v-card>
				<v-card-title>{{ $t("plugins.flexibleLayouts.bedTram.confirmTitle") }}</v-card-title>
				<v-card-text>
					<div class="mb-2">{{ $t("plugins.flexibleLayouts.bedTram.confirmText") }}</div>
					<UnhomedWarning :axes="unhomedNow" class="mb-2" />
					<pre class="btr-pre">{{ command }}</pre>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="confirmOpen = false">{{ $t("generic.cancel") }}</v-btn>
					<v-btn color="warning" :loading="running" @click="run">{{ $t("plugins.flexibleLayouts.bedTram.run") }}</v-btn>
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
import { unhomedAxes } from "../util/homedCheck";
import UnhomedWarning from "./UnhomedWarning.vue";

const props = defineProps<{ widget: Extract<Widget, { type: "bedTram" }>; disabled?: boolean }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();

const disabledNow = computed(() => props.disabled || uiStore.uiFrozen);
const unhomedNow = computed(() => unhomedAxes(machineStore.model, ["X", "Y", "Z"]));
const command = computed(() => props.widget.command || "G32");

// Live-reactive to whatever the object model currently holds. Delta machines populate
// move.calibration via G32's own auto-calibration; Cartesian machines running a mesh-based tram
// macro populate move.compensation.meshDeviation instead - showing whichever is present covers both
// without the widget needing to know which kind of machine it's on.
const calibration = computed(() => {
	// Optional-chained despite `calibration` being a non-nullable field on the real object model:
	// some hosts (the plugin test harness's fixture among them) expose a simplified `move` that omits
	// it entirely, and this is a read-out that must never crash the widget over a missing sub-object.
	const cal = machineStore.model.move?.calibration;
	// numFactors is only >0 once a delta auto-calibration has actually run (M665) - final.mean/deviation
	// otherwise sit at their default 0, which would misread as "perfectly calibrated" rather than "n/a".
	return cal && cal.numFactors > 0 ? { mean: cal.final.mean, deviation: cal.final.deviation } : null;
});
const meshDeviation = computed(() => {
	const d = machineStore.model.move?.compensation?.meshDeviation;
	return d ? { mean: d.mean, deviation: d.deviation } : null;
});

function fmt(v: number): string {
	return v.toFixed(3);
}

const confirmOpen = ref(false);
const running = ref(false);
const lastRunAt = ref("");
const lastResult = ref("");

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
		// A delta's G32 auto-calibration and a mesh probe both land in the object model, but a
		// Cartesian/CoreXY bed-tramming macro - the common case this widget is actually used for -
		// typically just echoes its measured mean/deviation as plain command-reply text, which has
		// no object-model home at all. Discarding sendCode()'s own return value (as this used to)
		// threw that text away, so nothing but a blank card showed for exactly that setup - "none of
		// the values output by the popup box are shown". Prefer the reply text when the command
		// actually printed something; fall back to the OM readings for delta/mesh setups that don't.
		const reply = (await machineStore.sendCode(command.value, false, false)).trim();
		lastRunAt.value = new Date().toLocaleTimeString();
		// The object model updates asynchronously as the machine's own poll cycle catches up, so this
		// read is best-effort "as of just now" rather than guaranteed to reflect this exact run - the
		// timestamp above is deliberately shown alongside it so that's clear, not implied as instant.
		lastResult.value = reply || (calibration.value
			? i18n.global.t("plugins.flexibleLayouts.bedTram.meanDeviation", { mean: fmt(calibration.value.mean), deviation: fmt(calibration.value.deviation) })
			: meshDeviation.value
				? i18n.global.t("plugins.flexibleLayouts.bedTram.meanDeviation", { mean: fmt(meshDeviation.value.mean), deviation: fmt(meshDeviation.value.deviation) })
				: "");
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.bedTram.run"), (e as Error)?.message ?? String(e));
	} finally {
		running.value = false;
		confirmOpen.value = false;
	}
}
</script>

<style scoped>
.btr-root { min-height: 0; }
.btr-frozen { opacity: 0.5; pointer-events: none; }
.btr-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.btr-results { min-height: 0; overflow-y: auto; }
.btr-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 2px 0; }
.btr-value { font-variant-numeric: tabular-nums; }
.btr-last { border-top: 1px solid rgba(127, 127, 127, 0.15); padding-top: 4px; }
/* A tramming macro's plain-text reply is often multi-line (per-corner readings, one per line) -
   without this a real reply just collapses into one run-on line. */
.btr-result { white-space: pre-line; }
.btr-pre { white-space: pre-wrap; font-size: 0.78rem; background: rgba(var(--v-theme-on-surface), 0.05); padding: 8px; border-radius: 4px; }
</style>
