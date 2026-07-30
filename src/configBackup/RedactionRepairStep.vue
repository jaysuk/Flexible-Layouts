<template>
	<div>
		<v-alert type="warning" variant="tonal" density="comfortable" class="mb-3">
			<div class="font-weight-medium">{{ $t("plugins.flexibleLayouts.configBackup.restore.repairHeading") }}</div>
			<div class="text-caption mt-1">{{ $t("plugins.flexibleLayouts.configBackup.restore.repairIntro") }}</div>
		</v-alert>

		<div class="d-flex align-center ga-2 mb-3">
			<span class="text-caption text-medium-emphasis">
				{{ $t("plugins.flexibleLayouts.configBackup.restore.repairProgress", { done: resolvedCount, total: rows.length }) }}
			</span>
			<v-spacer />
			<v-btn size="small" variant="tonal" @click="bulkKeepLive">{{ $t("plugins.flexibleLayouts.configBackup.restore.repairBulkKeepLive") }}</v-btn>
			<v-btn size="small" variant="tonal" @click="bulkCommentOut">{{ $t("plugins.flexibleLayouts.configBackup.restore.repairBulkComment") }}</v-btn>
		</div>

		<v-card v-for="row in rows" :key="row.entry.id" variant="outlined" class="mb-2">
			<v-card-text class="py-2">
				<div class="d-flex align-center ga-2 mb-1">
					<v-icon size="16" :color="decisions.has(row.entry.id) ? 'success' : 'warning'">
						{{ decisions.has(row.entry.id) ? "mdi-check-circle-outline" : "mdi-help-circle-outline" }}
					</v-icon>
					<span class="text-body-2 font-weight-medium">{{ row.entry.label }}</span>
					<span class="text-caption text-medium-emphasis">{{ row.entry.path }}</span>
				</div>

				<v-btn-toggle :model-value="actionType(row.entry.id)" density="compact" mandatory @update:model-value="setActionType(row, $event)">
					<v-btn v-if="row.suggestion.status === 'found'" value="keep-live" size="small">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.repairActionKeepLive") }}
					</v-btn>
					<v-btn value="enter-value" size="small">{{ $t("plugins.flexibleLayouts.configBackup.restore.repairActionEnter") }}</v-btn>
					<v-btn v-if="row.entry.kind === 'gcode-command'" value="comment-out" size="small">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.repairActionComment") }}
					</v-btn>
					<v-btn v-if="row.entry.kind === 'json-value'" value="omit-key" size="small">
						{{ $t("plugins.flexibleLayouts.configBackup.restore.repairActionOmit") }}
					</v-btn>
				</v-btn-toggle>

				<div v-if="actionType(row.entry.id) === 'keep-live'" class="mt-2">
					<template v-if="row.suggestion.status === 'found'">
						<div class="text-caption text-medium-emphasis">
							{{ Object.entries(row.suggestion.values).map(([k, v]) => `${k}: ${v}`).join(", ") }}
						</div>
					</template>
					<template v-else-if="row.suggestion.status === 'ambiguous'">
						<div class="text-caption mb-1">{{ $t("plugins.flexibleLayouts.configBackup.restore.repairAmbiguous") }}</div>
						<v-radio-group :model-value="ambiguousChoice.get(row.entry.id) ?? 0" density="compact" hide-details
									   @update:model-value="chooseAmbiguous(row, $event)">
							<v-radio v-for="(cand, i) in row.suggestion.candidates" :key="i"
									 :label="Object.entries(cand).map(([k, v]) => `${k}: ${v}`).join(', ')" :value="i" />
						</v-radio-group>
					</template>
				</div>

				<div v-else-if="actionType(row.entry.id) === 'enter-value'" class="mt-2">
					<v-text-field v-for="param in paramList(row.entry)" :key="param"
								  :model-value="enteredValues.get(row.entry.id)?.[param] ?? ''"
								  :label="paramList(row.entry).length > 1 ? param : undefined"
								  :type="row.entry.restoreHint === 'credential' && !revealed.has(row.entry.id) ? 'password' : 'text'"
								  density="compact" variant="outlined" hide-details="auto"
								  :error-messages="entryError(row.entry, param) ?? undefined"
								  class="mb-2"
								  @update:model-value="setEnteredValue(row, param, $event)">
						<template v-if="row.entry.restoreHint === 'credential'" #append-inner>
							<v-icon size="16" style="cursor: pointer;" @click="toggleReveal(row.entry.id)">
								{{ revealed.has(row.entry.id) ? "mdi-eye-off" : "mdi-eye" }}
							</v-icon>
						</template>
					</v-text-field>
				</div>
			</v-card-text>
		</v-card>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";

import { suggestFromLive, validateEnteredValue } from "../model/configBackup/repair";
import type { SuggestResult } from "../model/configBackup/repair";
import type { RedactionEntry, RedactionSite, RepairAction } from "../model/configBackup/types";

const props = defineProps<{
	sites: Array<RedactionSite>;
	/** archivePath -> the LIVE machine's current text at that path (fetched by the caller). */
	liveFileTexts: Map<string, string>;
	modelValue: Map<number, RepairAction>;
}>();
const emit = defineEmits<{ "update:modelValue": [Map<number, RepairAction>] }>();

const decisions = computed(() => props.modelValue);
const resolvedCount = computed(() => rows.value.filter((r) => decisions.value.has(r.entry.id)).length);

interface Row { entry: RedactionEntry; suggestion: SuggestResult }

const rows = computed<Array<Row>>(() => props.sites
	.filter((s) => s.entry.kind !== "m122-line")
	.map((s) => ({ entry: s.entry, suggestion: suggestFromLive(s.entry, props.liveFileTexts.get(s.entry.path) ?? "") })));

function paramList(entry: RedactionEntry): Array<string> {
	if (entry.kind === "gcode-command") { return entry.params ?? []; }
	return ["value"];
}

const enteredValues = reactive(new Map<number, Record<string, string>>());
const ambiguousChoice = reactive(new Map<number, number>());
const revealed = reactive(new Set<number>());

function replace(next: Map<number, RepairAction>): void { emit("update:modelValue", next); }

function actionType(id: number): RepairAction["type"] | null {
	return decisions.value.get(id)?.type ?? null;
}

function setActionType(row: Row, type: RepairAction["type"] | null): void {
	if (!type) { return; }
	const next = new Map(decisions.value);
	if (type === "comment-out") {
		next.set(row.entry.id, { type: "comment-out" });
	} else if (type === "omit-key") {
		next.set(row.entry.id, { type: "omit-key" });
	} else if (type === "keep-live") {
		if (row.suggestion.status === "found") {
			next.set(row.entry.id, { type: "keep-live", values: row.suggestion.values });
		} else if (row.suggestion.status === "ambiguous") {
			const idx = ambiguousChoice.get(row.entry.id) ?? 0;
			next.set(row.entry.id, { type: "keep-live", values: row.suggestion.candidates[idx] });
		} else {
			next.delete(row.entry.id); // no suggestion - nothing to apply yet
		}
	} else {
		// enter-value: only commit once every param passes validation (see setEnteredValue)
		next.delete(row.entry.id);
	}
	replace(next);
}

function chooseAmbiguous(row: Row, idx: number | null): void {
	if (idx == null) { return; }
	ambiguousChoice.set(row.entry.id, idx);
	if (row.suggestion.status === "ambiguous") {
		const next = new Map(decisions.value);
		next.set(row.entry.id, { type: "keep-live", values: row.suggestion.candidates[idx] });
		replace(next);
	}
}

function entryError(entry: RedactionEntry, param: string): string | null {
	const value = enteredValues.get(entry.id)?.[param];
	if (value == null || value === "") { return null; } // don't show an error before the user has typed anything
	return validateEnteredValue(entry, param, value);
}

function setEnteredValue(row: Row, param: string, value: string): void {
	const current = enteredValues.get(row.entry.id) ?? {};
	current[param] = value;
	enteredValues.set(row.entry.id, { ...current });

	const params = paramList(row.entry);
	const allValid = params.every((p) => {
		const v = current[p];
		return v != null && v !== "" && validateEnteredValue(row.entry, p, v) === null;
	});
	const next = new Map(decisions.value);
	if (allValid) {
		next.set(row.entry.id, { type: "enter-value", values: { ...current } });
	} else {
		next.delete(row.entry.id);
	}
	replace(next);
}

function toggleReveal(id: number): void {
	if (revealed.has(id)) { revealed.delete(id); } else { revealed.add(id); }
}

function bulkKeepLive(): void {
	const next = new Map(decisions.value);
	for (const row of rows.value) {
		if (row.suggestion.status === "found") { next.set(row.entry.id, { type: "keep-live", values: row.suggestion.values }); }
	}
	replace(next);
}
function bulkCommentOut(): void {
	const next = new Map(decisions.value);
	for (const row of rows.value) {
		if (row.entry.kind === "gcode-command" && !next.has(row.entry.id)) { next.set(row.entry.id, { type: "comment-out" }); }
	}
	replace(next);
}

defineExpose({ resolvedCount, totalCount: computed(() => rows.value.length) });
</script>
