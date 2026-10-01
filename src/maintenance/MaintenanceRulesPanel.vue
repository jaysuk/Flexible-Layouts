<template>
	<div>
		<v-alert v-if="state.source === 'cache'" type="warning" variant="tonal" density="compact" class="mb-3">
			{{ $t("plugins.flexibleLayouts.maintenance.rulesOffline") }}
		</v-alert>
		<v-alert v-else-if="state.integrity === 'mismatch'" type="warning" variant="tonal" density="compact" class="mb-3">
			{{ $t("plugins.flexibleLayouts.maintenance.rulesIntegrityWarning") }}
		</v-alert>
		<v-alert v-if="syncProblem" type="warning" variant="tonal" density="compact" class="mb-3">
			{{ $t(`plugins.flexibleLayouts.maintenance.sync.${syncProblem}`) }}
		</v-alert>

		<div v-if="!rows.length" class="text-caption text-medium-emphasis mb-3">
			{{ $t("plugins.flexibleLayouts.maintenance.remindersEmpty") }}
		</div>
		<div v-for="row in rows" :key="row.rule.id" class="mnt-rule">
			<div class="mnt-detail-row">
				<div class="d-flex align-center ga-2">
					<v-icon size="small" :color="row.rule.enabled ? row.color : 'grey'">mdi-circle</v-icon>
					<span :class="{ 'text-medium-emphasis': !row.rule.enabled }">{{ row.rule.label }}</span>
					<span class="text-caption text-medium-emphasis">{{ row.counterTitle }}</span>
					<v-icon v-if="row.rule.action" size="x-small" :color="row.armed ? 'primary' : 'grey'"
							:title="row.armed ? $t('plugins.flexibleLayouts.maintenance.ruleActionArmed', { action: row.rule.action }) : $t('plugins.flexibleLayouts.maintenance.ruleActionNotArmed')">
						mdi-flash
					</v-icon>
				</div>
				<div class="d-flex align-center ga-2">
					<span class="text-caption text-medium-emphasis">{{ row.rule.enabled ? row.display : $t("plugins.flexibleLayouts.maintenance.reminderPaused") }}</span>
					<v-switch :model-value="row.rule.enabled" density="compact" hide-details class="mnt-rule-switch"
							  :disabled="state.busy" :title="$t('plugins.flexibleLayouts.maintenance.reminderToggle')"
							  :aria-label="$t('plugins.flexibleLayouts.maintenance.reminderToggle')"
							  @update:model-value="(v) => onToggle(row.rule.id, v === true)" />
					<v-btn :aria-label="$t('plugins.flexibleLayouts.a11y.delete')" icon="mdi-delete" size="x-small" variant="text"
						   density="compact" :disabled="state.busy" @click="onDelete(row.rule.id)" />
				</div>
			</div>
			<div v-if="row.rule.action && row.rule.enabled && row.note" class="text-caption text-medium-emphasis mnt-rule-note">
				{{ row.note }}
			</div>
		</div>

		<v-divider class="my-3" />
		<div class="d-flex ga-2 flex-wrap align-start">
			<v-text-field v-model="newLabel" density="compact" variant="outlined" hide-details
						  :label="$t('plugins.flexibleLayouts.maintenance.reminderLabel')" style="max-width: 200px;" />
			<v-select v-model="newCounter" :items="counterItems" item-title="title" item-value="key" density="compact" variant="outlined"
					  hide-details :label="$t('plugins.flexibleLayouts.maintenance.reminderCounter')" style="max-width: 240px;" />
			<v-text-field v-model.number="newInterval" type="number" min="0" step="any" density="compact" variant="outlined" hide-details
						  :label="$t('plugins.flexibleLayouts.maintenance.reminderInterval')"
						  :suffix="$t(`plugins.flexibleLayouts.maintenance.${intervalUnitLabelKey(newCounter)}`)" style="max-width: 190px;" />
		</div>
		<div class="d-flex ga-2 flex-wrap align-start mt-2">
			<v-text-field v-model="newAction" density="compact" variant="outlined" class="flex-grow-1" style="min-width: 260px;"
						  :label="$t('plugins.flexibleLayouts.maintenance.ruleActionLabel')"
						  :placeholder="'M291 P&quot;Grease the ways&quot; R&quot;Maintenance&quot; S1'"
						  :error-messages="actionError" :hint="$t('plugins.flexibleLayouts.maintenance.ruleActionHint')" persistent-hint />
			<v-btn variant="text" size="small" class="mt-1" @click="fillExample">
				{{ $t("plugins.flexibleLayouts.maintenance.ruleActionExample") }}
			</v-btn>
		</div>
		<v-checkbox v-if="newAction.trim()" v-model="newWhenIdle" density="compact" hide-details
					:label="$t('plugins.flexibleLayouts.maintenance.ruleActionWhenIdle')" />
		<div class="mt-2">
			<v-btn color="primary" variant="tonal" :loading="state.busy" :disabled="!canAdd" @click="onAdd">
				{{ $t("plugins.flexibleLayouts.maintenance.reminderAdd") }}
			</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";

import {
	counterCatalogue, counterTitle, formatCounterAmount, intervalFromInput, intervalUnitLabelKey, type MaintenanceCounterKey,
} from "../model/maintenance/counters";
import type { MaintenanceLog } from "../model/maintenance/log";
import { planRules } from "../model/maintenance/rulesMacro";
import { rulesMacroInput } from "../model/maintenance/rulesSync";
import { evaluateRules } from "../model/reminders/dueRules";
import { checkRuleAction } from "../model/reminders/ruleAction";
import { newRuleId, type MaintenanceIntervalRule } from "../model/reminders/storage";
import type { MaintenanceRulesState, RulesChangeResult } from "./useMaintenanceRules";

const props = defineProps<{ state: MaintenanceRulesState; log: MaintenanceLog; isFff: boolean }>();

const machineStore = useMachineStore();
const uiStore = useUiStore();
const t = (key: string, params?: Record<string, unknown>): string => i18n.global.t(key, params ?? {}) as string;

const counterItems = computed(() => counterCatalogue(machineStore.model, t, {
	isFff: props.isFff, customCounters: props.state.doc.customCounters,
}));

const newLabel = ref("");
const newCounter = ref<MaintenanceCounterKey>(props.isFff ? "printSeconds" : "spindleSeconds");
const newInterval = ref<number | null>(null);
const newAction = ref("");
const newWhenIdle = ref(true);

// Keep the selection valid if the machine's counters change under it (an axis removed, a counter deleted).
watch(counterItems, (items) => {
	if (!items.some((i) => i.key === newCounter.value) && items.length) { newCounter.value = items[0].key; }
});

const DUE_STATUS_COLOR: Record<string, string> = { unknown: "grey", ok: "success", dueSoon: "warning", overdue: "error" };

const plan = computed(() => planRules(rulesMacroInput(props.state.doc, props.log)));

const rows = computed(() => evaluateRules(props.state.doc.rules, props.log, machineStore.model).map(({ rule, delta, status }) => {
	const unarmed = plan.value.unarmed.find((u) => u.rule.id === rule.id);
	return {
		rule,
		counterTitle: counterTitle(rule.counter, machineStore.model, t, props.state.doc.customCounters),
		display: delta != null ? `${formatCounterAmount(rule.counter, delta)} / ${formatCounterAmount(rule.counter, rule.intervalValue)}` : "—",
		color: DUE_STATUS_COLOR[status],
		armed: plan.value.armed.some((a) => a.rule.id === rule.id),
		note: unarmed ? t(`plugins.flexibleLayouts.maintenance.ruleNotArmed.${unarmed.reason}`) : "",
	};
}));

/** Why the machine-side macros are not in place, when a rule or counter needs them. */
const syncProblem = computed(() => {
	const s = props.state.sync;
	return s && (s.status === "notSetUp" || s.status === "needsRedeploy" || s.status === "failed") ? s.status : null;
});

const actionCheck = computed(() => (newAction.value.trim() ? checkRuleAction(newAction.value) : null));
const actionError = computed(() => {
	const c = actionCheck.value;
	return c && !c.ok ? t(`plugins.flexibleLayouts.maintenance.ruleActionProblem.${c.problem}`) : undefined;
});

const canAdd = computed(() => !!newLabel.value.trim() && !!newInterval.value && newInterval.value > 0
	&& (actionCheck.value === null || actionCheck.value.ok));

function fillExample(): void {
	const what = newLabel.value.trim().replace(/"/g, "") || t("plugins.flexibleLayouts.maintenance.ruleActionExampleLabel");
	newAction.value = `M291 P"${what}" R"${t("plugins.flexibleLayouts.maintenance.title").replace(/"/g, "")}" S1`;
}

function report(result: RulesChangeResult): boolean {
	if (result === "written") { return true; }
	if (result === "blocked" || result === "failed") {
		uiStore.makeNotification(LogLevel.error, t("plugins.flexibleLayouts.maintenance.title"),
			t(result === "blocked" ? "plugins.flexibleLayouts.maintenance.rulesBlocked" : "plugins.flexibleLayouts.maintenance.rulesFailed"));
	}
	return false;
}

async function onAdd(): Promise<void> {
	if (!canAdd.value || !newInterval.value) { return; }
	const check = actionCheck.value;
	const rule: MaintenanceIntervalRule = {
		id: newRuleId(), label: newLabel.value.trim(), counter: newCounter.value,
		intervalValue: intervalFromInput(newCounter.value, newInterval.value), enabled: true,
		...(check && check.ok ? { action: check.action, actionWhenIdle: newWhenIdle.value } : {}),
	};
	if (report(await props.state.change((d) => ({ ...d, rules: [...d.rules, rule] })))) {
		newLabel.value = "";
		newInterval.value = null;
		newAction.value = "";
		newWhenIdle.value = true;
	}
}

async function onDelete(id: string): Promise<void> {
	report(await props.state.change((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) })));
}

/** Pauses/resumes ONE rule without losing its configuration - a paused rule's action is not run either
 *  (the generated macro only contains enabled rules). */
async function onToggle(id: string, enabled: boolean): Promise<void> {
	report(await props.state.change((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) })));
}
</script>

<style scoped>
.mnt-detail-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 0.85em; }
.mnt-rule-note { margin: 0 0 4px 24px; }
.mnt-rule-switch { flex: none; margin: 0; padding: 0; }
.mnt-rule-switch :deep(.v-selection-control) { min-height: 0; }
</style>
