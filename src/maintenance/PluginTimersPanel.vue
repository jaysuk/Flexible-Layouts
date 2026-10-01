<template>
	<div>
		<div class="text-caption text-medium-emphasis mb-3">
			{{ $t("plugins.flexibleLayouts.maintenance.pluginTimersIntro") }}
		</div>
		<div v-if="!timers.length" class="text-caption text-medium-emphasis">
			{{ $t("plugins.flexibleLayouts.maintenance.pluginTimersEmpty") }}
		</div>
		<div v-for="timer in timers" :key="timer.name" class="mnt-timer">
			<div class="mnt-detail-row">
				<div class="d-flex align-center ga-2">
					<v-icon size="small" :color="timer.reached ? 'error' : 'success'">mdi-circle</v-icon>
					<span>{{ timer.title }}</span>
				</div>
				<div class="d-flex align-center ga-2">
					<span class="text-caption text-medium-emphasis">{{ timer.display }}</span>
					<v-btn v-if="timer.canReset" size="x-small" variant="tonal" :loading="resetting === timer.name" :disabled="!!resetting"
						   @click="onReset(timer.name)">
						{{ $t("plugins.flexibleLayouts.maintenance.pluginTimerReset") }}
					</v-btn>
				</div>
			</div>
			<div v-if="timer.conditions.length" class="text-caption text-medium-emphasis mnt-timer-detail">
				{{ $t("plugins.flexibleLayouts.maintenance.pluginTimerCounts") }} {{ timer.conditions.join(" && ") }}
			</div>
			<div v-if="timer.action" class="text-caption text-medium-emphasis mnt-timer-detail">
				{{ $t("plugins.flexibleLayouts.maintenance.pluginTimerRuns") }} {{ timer.action }}
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

import { can, requestAdmin } from "../model/access";
import {
	formatPluginMinutes, pluginTimerReached, readPluginTimers, resetPluginTimer,
} from "../model/maintenance/pluginTimers";

const machineStore = useMachineStore();
const uiStore = useUiStore();
const t = (key: string, params?: Record<string, unknown>): string => i18n.global.t(key, params ?? {}) as string;

// Straight off the live model: the plugin republishes its timers whenever one changes, so this follows
// them without any polling of our own.
const timers = computed(() => (readPluginTimers(machineStore.model) ?? []).map((timer) => {
	const down = timer.initialValue !== 0;
	const target = timer.thresholdValue >= 0 ? ` / ${formatPluginMinutes(timer.thresholdValue)}` : "";
	return {
		...timer,
		reached: pluginTimerReached(timer),
		// Counting down shows what is LEFT; counting up shows what has elapsed against the threshold.
		display: down ? t("plugins.flexibleLayouts.maintenance.pluginTimerLeft", { time: formatPluginMinutes(timer.value) })
			: `${formatPluginMinutes(timer.value)}${target}`,
	};
}));

const resetting = ref<string | null>(null);

async function onReset(name: string): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	resetting.value = name;
	try {
		const ok = await resetPluginTimer((method, path, params, responseType) => machineStore.request(method, path, params, responseType), name);
		if (!ok) {
			uiStore.makeNotification(LogLevel.error, t("plugins.flexibleLayouts.maintenance.title"), t("plugins.flexibleLayouts.maintenance.pluginTimerResetFailed"));
		}
	} finally {
		resetting.value = null;
	}
}
</script>

<style scoped>
.mnt-detail-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 0.85em; }
.mnt-timer-detail { margin-left: 24px; font-family: monospace; }
</style>
