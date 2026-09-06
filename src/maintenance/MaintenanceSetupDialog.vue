<template>
	<v-dialog :model-value="modelValue" max-width="640" scrollable persistent @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-wrench-cog-outline</v-icon>
				{{ $t("plugins.flexibleLayouts.maintenance.setupTitle") }}
				<v-spacer />
				<v-btn icon="mdi-close" variant="text" density="comfortable" @click="close" />
			</v-card-title>

			<v-card-text style="max-height: 72vh;">
				<div v-if="loading" class="d-flex justify-center pa-4">
					<v-progress-circular indeterminate size="32" />
				</div>

				<template v-else-if="step === 'review'">
					<div class="text-body-2 mb-3">{{ $t("plugins.flexibleLayouts.maintenance.setupIntro") }}</div>

					<v-select v-if="spindleItems.length > 1" v-model="spindleIndex" :items="spindleItems" density="compact"
							  variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.maintenance.trackedSpindle')" class="mb-3" />

					<v-list density="compact" class="mb-2">
						<v-list-item>
							<template #prepend>
								<v-icon :color="eventLoggingEnabled ? 'success' : 'warning'">
									{{ eventLoggingEnabled ? "mdi-check-circle-outline" : "mdi-alert-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ $t("plugins.flexibleLayouts.maintenance.checkEventLogging") }}</v-list-item-title>
							<v-list-item-subtitle>{{ $t("plugins.flexibleLayouts.maintenance.checkEventLoggingCaveat") }}</v-list-item-subtitle>
						</v-list-item>
						<v-list-item>
							<template #prepend>
								<v-icon :color="daemonHookPresent ? 'success' : 'warning'">
									{{ daemonHookPresent ? "mdi-check-circle-outline" : "mdi-alert-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ $t("plugins.flexibleLayouts.maintenance.checkDaemonHook") }}</v-list-item-title>
						</v-list-item>
						<v-list-item>
							<template #prepend>
								<v-icon :color="configRestorePresent ? 'success' : 'warning'">
									{{ configRestorePresent ? "mdi-check-circle-outline" : "mdi-alert-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ $t("plugins.flexibleLayouts.maintenance.checkConfigRestore") }}</v-list-item-title>
						</v-list-item>
						<v-list-item>
							<template #prepend>
								<v-icon :color="macrosReady ? 'success' : 'warning'">
									{{ macrosReady ? "mdi-check-circle-outline" : "mdi-alert-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ $t("plugins.flexibleLayouts.maintenance.checkMacros") }}</v-list-item-title>
						</v-list-item>
						<v-list-item>
							<template #prepend>
								<v-icon :color="tpostHooksReady ? 'success' : 'warning'">
									{{ tpostHooksReady ? "mdi-check-circle-outline" : "mdi-alert-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ $t("plugins.flexibleLayouts.maintenance.checkToolChangeHooks") }}</v-list-item-title>
						</v-list-item>
						<v-list-item>
							<template #prepend>
								<v-icon :color="jobHooksReady ? 'success' : 'warning'">
									{{ jobHooksReady ? "mdi-check-circle-outline" : "mdi-alert-circle-outline" }}
								</v-icon>
							</template>
							<v-list-item-title>{{ $t("plugins.flexibleLayouts.maintenance.checkJobHooks") }}</v-list-item-title>
						</v-list-item>
					</v-list>

					<v-checkbox v-if="!eventLoggingEnabled" v-model="enableEventLogging" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.maintenance.enableEventLoggingOption')" class="mb-2" />

					<!-- Each independently OFF by default (see macros.ts's v10 note) - real, if modest,
						 extra controller overhead most users won't look at every category of. Each
						 defaults to whatever the machine already has configured when re-running setup,
						 not back to off, so re-running setup for an unrelated reason (e.g. changing the
						 tracked spindle) can't silently disable one that was already on. -->
					<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.maintenance.trackDetailGroupLabel") }}</div>
					<v-checkbox v-model="trackAxesEnabled" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.maintenance.trackAxesOption')" class="mb-1" />
					<v-checkbox v-model="trackFansEnabled" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.maintenance.trackFansOption')" class="mb-1" />
					<v-checkbox v-model="trackHeatersEnabled" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.maintenance.trackHeatersOption')" class="mb-2" />

					<template v-if="plannedChanges.length > 0">
						<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.maintenance.plannedChanges") }}</div>
						<ul class="text-caption mb-3">
							<li v-for="(c, i) in plannedChanges" :key="i">{{ c }}</li>
						</ul>
					</template>
					<v-alert v-else type="success" variant="tonal" density="compact" class="mb-3">
						{{ $t("plugins.flexibleLayouts.maintenance.nothingToDo") }}
					</v-alert>

					<v-alert v-if="applyError" type="error" variant="tonal" density="compact" class="mb-2">{{ applyError }}</v-alert>

					<div class="d-flex ga-2 mt-2">
						<v-btn v-if="plannedChanges.length > 0" color="primary" :loading="applying" @click="onApply">
							{{ $t("plugins.flexibleLayouts.maintenance.applyButton") }}
						</v-btn>
						<v-btn v-else color="primary" @click="step = 'done'">{{ $t("plugins.flexibleLayouts.updates.close") }}</v-btn>
					</div>
				</template>

				<template v-else-if="step === 'done'">
					<v-alert type="success" variant="tonal" density="comfortable" class="mb-3">
						{{ $t("plugins.flexibleLayouts.maintenance.doneHeading") }}
					</v-alert>
					<p class="text-body-2">{{ $t("plugins.flexibleLayouts.maintenance.doneBody") }}</p>
				</template>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="close">{{ $t("plugins.flexibleLayouts.configBackup.common.cancel") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";

import { can, requestAdmin } from "../model/access";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import {
	configGHasEventLogging, configGHasMaintenanceRestore, daemonGHasMaintenanceHook,
	patchConfigGForEventLogging, patchConfigGForMaintenance, patchDaemonGForMaintenance,
} from "../model/maintenance/configPatch";
import {
	deployMaintenanceMacros, maintenanceMacrosMissing, maintenanceMacrosOutdated, seedMaintenanceState,
} from "../model/maintenance/macros";
import { applyJobTrackingPatches, planJobTrackingPatches, type JobMacroPlan } from "../model/maintenance/jobTrackingPatch";
import { applyTpostPatches, planTpostPatches, type TpostPatchPlan } from "../model/maintenance/toolChangePatch";
import { resolveOmPath } from "../util/omPath";
import { CONFIG_G_PATH, DAEMON_G_PATH } from "../util/gcodeFilePatch";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const machineStore = useMachineStore();

type Step = "review" | "done";
const step = ref<Step>("review");
const loading = ref(false);

// --- Spindle picker ----------------------------------------------------------------------------------

interface RawSpindle { state?: string }
const spindleItems = computed(() => {
	const arr = resolveOmPath(machineStore.model, "spindles");
	if (!Array.isArray(arr)) { return []; }
	return (arr as Array<RawSpindle | null>)
		.map((s, i) => ({ title: `Spindle ${i}`, value: i, configured: s?.state && s.state !== "unconfigured" }))
		.filter((s) => s.configured || s.value === 0); // always offer #0 even if not yet reported
});
const spindleIndex = ref(0);

// --- Detection state -----------------------------------------------------------------------------------

const configText = ref<string | null>(null);
const daemonText = ref<string | null>(null); // null = file doesn't exist yet (distinct from "")
const macrosMissing = ref(true);
const macrosOutdated = ref(false);
const enableEventLogging = ref(true);
// Detail-tracking (v10) - three INDEPENDENT flags, each defaulting OFF, but re-running setup should
// reflect whatever the machine already has for each (set below in loadState()), not silently reset any
// of them back to off.
const trackAxesEnabled = ref(false);
const trackFansEnabled = ref(false);
const trackHeatersEnabled = ref(false);
const tpostPlans = ref<Array<TpostPatchPlan>>([]);
const jobPlans = ref<Array<JobMacroPlan>>([]);

const eventLoggingEnabled = computed(() => (configText.value != null ? configGHasEventLogging(configText.value) : false));
const daemonHookPresent = computed(() => (daemonText.value != null ? daemonGHasMaintenanceHook(daemonText.value) : false));
const configRestorePresent = computed(() => (configText.value != null ? configGHasMaintenanceRestore(configText.value) : false));
const macrosReady = computed(() => !macrosMissing.value && !macrosOutdated.value);
const tpostHooksReady = computed(() => tpostPlans.value.every((p) => !p.plan.changed));
const jobHooksReady = computed(() => jobPlans.value.every((p) => !p.plan.changed));

async function loadState(): Promise<void> {
	loading.value = true;
	try {
		const io = defaultMachineIO();
		configText.value = await io.downloadText(CONFIG_G_PATH).catch(() => "");
		daemonText.value = await io.downloadText(DAEMON_G_PATH).catch(() => null);
		macrosMissing.value = await maintenanceMacrosMissing(io);
		macrosOutdated.value = macrosMissing.value ? false : await maintenanceMacrosOutdated(io);
		tpostPlans.value = await planTpostPatches(io);
		jobPlans.value = await planJobTrackingPatches(io);
		trackAxesEnabled.value = resolveOmPath(machineStore.model, "global.flMaintTrackAxes") === true;
		trackFansEnabled.value = resolveOmPath(machineStore.model, "global.flMaintTrackFans") === true;
		trackHeatersEnabled.value = resolveOmPath(machineStore.model, "global.flMaintTrackHeaters") === true;
	} finally {
		loading.value = false;
	}
}

watch(() => props.modelValue, (open) => {
	if (open) {
		step.value = "review";
		applyError.value = null;
		void loadState();
	}
}, { immediate: true });

// --- Planned changes -----------------------------------------------------------------------------------

const plannedChanges = computed(() => {
	if (configText.value == null) { return []; }
	const changes: Array<string> = [];
	const restorePlan = patchConfigGForMaintenance(configText.value);
	if (restorePlan.changed) { changes.push(...restorePlan.changes); }
	if (enableEventLogging.value && !eventLoggingEnabled.value) {
		changes.push(...patchConfigGForEventLogging(configText.value).changes);
	}
	const daemonPlan = patchDaemonGForMaintenance(daemonText.value);
	if (daemonPlan.changed) { changes.push(...daemonPlan.changes); }
	if (!macrosReady.value) { changes.push("Deploy Flexible Layouts' maintenance-tracking macros."); }
	for (const { file, plan } of tpostPlans.value) {
		if (plan.changed) { changes.push(`${file}: ${plan.changes[0]}`); }
	}
	for (const { file, plan } of jobPlans.value) {
		if (plan.changed) { changes.push(`${file}: ${plan.changes[0]}`); }
	}
	return changes;
});

// --- Apply ---------------------------------------------------------------------------------------------

const applying = ref(false);
const applyError = ref<string | null>(null);

async function onApply(): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	applying.value = true;
	applyError.value = null;
	try {
		const io = defaultMachineIO();

		// config.g: combine the restore-call patch and (optionally) the event-logging patch into one
		// upload, so a single connection hiccup can't leave config.g half-patched.
		let newConfigText = configText.value ?? "";
		newConfigText = patchConfigGForMaintenance(newConfigText).text;
		if (enableEventLogging.value && !eventLoggingEnabled.value) {
			newConfigText = patchConfigGForEventLogging(newConfigText).text;
		}
		if (newConfigText !== configText.value) {
			await io.upload(CONFIG_G_PATH, new Blob([newConfigText], { type: "text/plain" }));
			configText.value = newConfigText;
		}

		// daemon.g: never overwrites existing content, only appends the one line it's missing (or
		// creates a minimal file if none exists at all).
		if (!daemonHookPresent.value) {
			const daemonPlan = patchDaemonGForMaintenance(daemonText.value);
			await io.upload(DAEMON_G_PATH, new Blob([daemonPlan.text], { type: "text/plain" }));
			daemonText.value = daemonPlan.text;
		}

		if (!macrosReady.value) {
			const ok = await deployMaintenanceMacros(io);
			if (!ok) { throw new Error("Could not deploy the maintenance macros to the SD card."); }
			macrosMissing.value = false;
			macrosOutdated.value = false;
		}

		if (!tpostHooksReady.value) {
			await applyTpostPatches(io, tpostPlans.value);
			tpostPlans.value = tpostPlans.value.map((p) => ({ ...p, plan: { ...p.plan, changed: false } }));
		}

		if (!jobHooksReady.value) {
			await applyJobTrackingPatches(io, jobPlans.value);
			jobPlans.value = jobPlans.value.map((p) => ({ ...p, plan: { ...p.plan, changed: false } }));
		}

		// Preserve every already-accumulated total, and the current pause state, if setup is being
		// re-run (e.g. to change the tracked spindle or add event logging afterwards) rather than
		// resetting any of them.
		const numOm = (path: string): number => {
			const v = resolveOmPath(machineStore.model, path);
			return typeof v === "number" ? v : 0;
		};
		// The v8 per-axis/fan/heater arrays need the same "preserve on re-run" treatment as every
		// scalar counter above - seedMaintenanceState rewrites the whole file, so any live array not
		// re-supplied here would be reset to zero, silently discarding accumulated axis-distance/
		// fan/heater time. Absent (e.g. a machine last flushed before v8) resolves to undefined, which
		// seedMaintenanceState's own toFixedArrayLiteral() already defaults to zeros - not a footgun.
		const numArrOm = (path: string): Array<number> | undefined => {
			const v = resolveOmPath(machineStore.model, path);
			return Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n : 0)) : undefined;
		};
		const enabledOm = resolveOmPath(machineStore.model, "global.flMaintEnabled");
		const seeded = await seedMaintenanceState(io, spindleIndex.value, numOm("global.flMaintSpindleSec"), {
			printSeconds: numOm("global.flMaintPrintSec"),
			filamentMm: numOm("global.flMaintFilamentMm"),
			toolChanges: numOm("global.flMaintToolChanges"),
			powerOnSeconds: numOm("global.flMaintPowerOnSec"),
			filamentErrors: numOm("global.flMaintFilamentErrors"),
			jobsStarted: numOm("global.flMaintJobsStarted"),
			jobsFinished: numOm("global.flMaintJobsFinished"),
			jobsCancelled: numOm("global.flMaintJobsCancelled"),
			axisMm: numArrOm("global.flMaintAxisMm"),
			fanSec: numArrOm("global.flMaintFanSec"),
			heaterSec: numArrOm("global.flMaintHeaterSec"),
			heaterFullSec: numArrOm("global.flMaintHeaterFullSec"),
		}, typeof enabledOm === "boolean" ? enabledOm : true, {
			axes: trackAxesEnabled.value, fans: trackFansEnabled.value, heaters: trackHeatersEnabled.value,
		});
		if (!seeded) { throw new Error("Could not write the maintenance state file to the SD card."); }

		step.value = "done";
	} catch (e) {
		applyError.value = e instanceof Error ? e.message : String(e);
	} finally {
		applying.value = false;
	}
}

function close(): void {
	emit("update:modelValue", false);
}
</script>
