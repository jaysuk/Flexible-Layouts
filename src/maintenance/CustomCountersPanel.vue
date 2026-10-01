<template>
	<div>
		<div class="text-caption text-medium-emphasis mb-3">
			{{ $t("plugins.flexibleLayouts.maintenance.customIntro") }}
		</div>
		<v-alert v-if="syncProblem" type="warning" variant="tonal" density="compact" class="mb-3">
			{{ $t(`plugins.flexibleLayouts.maintenance.sync.${syncProblem}`) }}
		</v-alert>

		<div v-if="!state.doc.customCounters.length" class="text-caption text-medium-emphasis mb-3">
			{{ $t("plugins.flexibleLayouts.maintenance.customEmpty") }}
		</div>
		<div v-for="c in state.doc.customCounters" :key="c.id" class="mnt-custom">
			<div class="mnt-detail-row">
				<span>{{ c.title }}</span>
				<div class="d-flex align-center ga-2">
					<span class="text-caption text-medium-emphasis">{{ liveDisplay(c.id) }}</span>
					<v-btn :aria-label="$t('plugins.flexibleLayouts.a11y.delete')" icon="mdi-delete" size="x-small" variant="text"
						   density="compact" :disabled="state.busy" @click="onDelete(c.id)" />
				</div>
			</div>
			<div v-for="(cond, ci) in c.conditions" :key="ci" class="text-caption text-medium-emphasis mnt-cond">{{ cond }}</div>
		</div>

		<v-divider class="my-3" />
		<v-text-field v-model="title" density="compact" variant="outlined" hide-details class="mb-2" style="max-width: 320px;"
					  :label="$t('plugins.flexibleLayouts.maintenance.customTitle')" />
		<div v-for="(cond, i) in conds" :key="i" class="mb-1">
			<div class="d-flex ga-2 align-start">
				<v-text-field :model-value="cond.text" density="compact" variant="outlined" hide-details class="flex-grow-1"
							  :label="$t('plugins.flexibleLayouts.maintenance.customCondition')"
							  :placeholder="'state.status == &quot;processing&quot;'"
							  @update:model-value="(v: string) => onEdit(i, v)" />
				<v-btn variant="tonal" size="small" class="mt-1" :loading="cond.testing" :disabled="!cond.text.trim() || !isConnected" @click="onTest(i)">
					{{ $t("plugins.flexibleLayouts.maintenance.customTest") }}
				</v-btn>
				<v-btn v-if="conds.length > 1" :aria-label="$t('plugins.flexibleLayouts.a11y.delete')" icon="mdi-close" size="x-small"
					   variant="text" density="compact" class="mt-2" @click="conds.splice(i, 1)" />
			</div>
			<div v-if="cond.result" class="text-caption mnt-cond-result" :class="cond.result.ok ? 'text-success' : 'text-error'">
				{{ cond.result.text }}
			</div>
		</div>
		<div class="d-flex ga-1 flex-wrap align-center mt-1">
			<v-btn v-if="conds.length < MAX_CONDITIONS_PER_COUNTER" variant="text" size="small" @click="conds.push(blankCondition())">
				{{ $t("plugins.flexibleLayouts.maintenance.customAddCondition") }}
			</v-btn>
			<span class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.customExamples") }}</span>
			<v-chip v-for="ex in EXAMPLES" :key="ex.expr" size="x-small" variant="tonal" @click="fillExample(ex.expr)">
				{{ $t(`plugins.flexibleLayouts.maintenance.customExample.${ex.key}`) }}
			</v-chip>
		</div>
		<div class="mt-3">
			<v-btn color="primary" variant="tonal" :loading="state.busy" :disabled="!canAdd" @click="onAdd">
				{{ $t("plugins.flexibleLayouts.maintenance.customAdd") }}
			</v-btn>
			<span v-if="!canAdd && addHint" class="text-caption text-medium-emphasis ms-2">{{ addHint }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

import { defaultMachineIO } from "../model/configBackup/machineIO";
import { customCounterKey, formatCounterAmount, liveCounterValue } from "../model/maintenance/counters";
import {
	checkCondition, customCounterIdFor, MAX_CONDITIONS_PER_COUNTER, MAX_CUSTOM_COUNTERS, testConditionOnMachine,
} from "../model/maintenance/customCounters";
import type { MaintenanceRulesState } from "./useMaintenanceRules";

const props = defineProps<{ state: MaintenanceRulesState }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();
const t = (key: string, params?: Record<string, unknown>): string => i18n.global.t(key, params ?? {}) as string;
const isConnected = computed(() => machineStore.isConnected);

const EXAMPLES = [
	{ key: "printing", expr: 'state.status == "processing"' },
	{ key: "tool1", expr: "state.currentTool == 1" },
	{ key: "bedHot", expr: "heat.heaters[0].current > 60" },
];

interface ConditionRow {
	text: string;
	testing: boolean;
	/** The text the last successful test ran against - editing invalidates it. */
	testedText: string | null;
	result: { ok: boolean; text: string } | null;
}
function blankCondition(): ConditionRow {
	return { text: "", testing: false, testedText: null, result: null };
}

const title = ref("");
const conds = reactive<Array<ConditionRow>>([blankCondition()]);

const syncProblem = computed(() => {
	const s = props.state.sync;
	return s && (s.status === "notSetUp" || s.status === "needsRedeploy" || s.status === "failed") ? s.status : null;
});

function onEdit(i: number, text: string): void {
	const row = conds[i];
	row.text = text;
	row.testedText = null;
	row.result = null;
}

function fillExample(expr: string): void {
	const target = conds.find((c) => !c.text.trim()) ?? conds[conds.length - 1];
	onEdit(conds.indexOf(target), expr);
}

async function onTest(i: number): Promise<void> {
	const row = conds[i];
	const syntax = checkCondition(row.text);
	if (!syntax.ok) {
		row.result = { ok: false, text: t(`plugins.flexibleLayouts.maintenance.customProblem.${syntax.problem}`, { detail: syntax.detail ?? "" }) };
		return;
	}
	row.testing = true;
	try {
		const out = await testConditionOnMachine(defaultMachineIO(), syntax.condition);
		if (out.ok) {
			row.testedText = syntax.condition;
			row.result = { ok: true, text: t(out.value ? "plugins.flexibleLayouts.maintenance.customTestTrue" : "plugins.flexibleLayouts.maintenance.customTestFalse") };
		} else {
			row.testedText = null;
			row.result = { ok: false, text: t("plugins.flexibleLayouts.maintenance.customTestError", { message: out.message }) };
		}
	} finally {
		row.testing = false;
	}
}

const filled = computed(() => conds.filter((c) => c.text.trim()));
const canAdd = computed(() => !!title.value.trim() && filled.value.length > 0
	&& props.state.doc.customCounters.length < MAX_CUSTOM_COUNTERS
	&& filled.value.every((c) => c.testedText !== null && c.testedText === c.text.trim()));
const addHint = computed(() => {
	if (props.state.doc.customCounters.length >= MAX_CUSTOM_COUNTERS) { return t("plugins.flexibleLayouts.maintenance.customLimit"); }
	return filled.value.length > 0 && !canAdd.value && title.value.trim() ? t("plugins.flexibleLayouts.maintenance.customTestFirst") : "";
});

function liveDisplay(id: string): string {
	const v = liveCounterValue(machineStore.model, customCounterKey(id));
	return v != null ? formatCounterAmount(customCounterKey(id), v) : "—";
}

function notifyFailure(result: string): void {
	if (result === "blocked" || result === "failed") {
		uiStore.makeNotification(LogLevel.error, t("plugins.flexibleLayouts.maintenance.title"),
			t(result === "blocked" ? "plugins.flexibleLayouts.maintenance.rulesBlocked" : "plugins.flexibleLayouts.maintenance.rulesFailed"));
	}
}

async function onAdd(): Promise<void> {
	if (!canAdd.value) { return; }
	const conditions = filled.value.map((c) => c.text.trim());
	const counterTitle = title.value.trim();
	const result = await props.state.change((d) => (d.customCounters.length >= MAX_CUSTOM_COUNTERS ? d : {
		...d,
		// The id comes from THIS fresh read of the file, and the counter only ever moves up, so two browsers
		// adding at once cannot hand out the same RRF global name.
		customCounters: [...d.customCounters, { id: customCounterIdFor(d.nextCustomId), title: counterTitle, conditions }],
		nextCustomId: d.nextCustomId + 1,
	}));
	if (result === "written") {
		title.value = "";
		conds.splice(0, conds.length, blankCondition());
	} else {
		notifyFailure(result);
	}
}

/** Removing a counter also removes the rules that measure it - they would otherwise point at nothing. */
async function onDelete(id: string): Promise<void> {
	const key = customCounterKey(id);
	const result = await props.state.change((d) => ({
		...d,
		customCounters: d.customCounters.filter((c) => c.id !== id),
		rules: d.rules.filter((r) => r.counter !== key),
	}));
	notifyFailure(result);
}
</script>

<style scoped>
.mnt-detail-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 0.85em; }
.mnt-cond { font-family: monospace; margin-left: 12px; }
.mnt-cond-result { margin: 2px 0 0 4px; }
</style>
