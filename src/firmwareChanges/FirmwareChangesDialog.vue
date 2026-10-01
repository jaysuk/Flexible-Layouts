<template>
	<v-dialog :model-value="modelValue" max-width="860" scrollable :attach="attach" :aria-label="$t('plugins.flexibleLayouts.firmwareChanges.title')"
			  @update:model-value="emit('update:modelValue', $event)">
		<v-card>
			<v-card-title class="d-flex align-center">
				<v-icon class="me-2">mdi-chip</v-icon>
				<span v-if="report">{{ $t("plugins.flexibleLayouts.firmwareChanges.reportTitle", { from: report.from, to: report.to }) }}</span>
				<span v-else>{{ $t("plugins.flexibleLayouts.firmwareChanges.title") }}</span>
			</v-card-title>

			<v-card-text>
				<div v-if="busy || applying" class="d-flex align-center ga-3 py-4" role="status">
					<v-progress-circular indeterminate size="20" width="2" />
					<span>{{ $t(applying ? "plugins.flexibleLayouts.firmwareChanges.applying" : "plugins.flexibleLayouts.firmwareChanges.scanning") }}</span>
				</div>

				<v-alert v-else-if="!report || !plan" type="info" variant="tonal" density="comfortable">
					{{ $t("plugins.flexibleLayouts.firmwareChanges.noReport") }}
				</v-alert>

				<template v-else>
					<v-alert v-if="message" :type="message.type" variant="tonal" density="comfortable" class="mb-3" data-test="message" role="status">
						<div class="d-flex align-center ga-2">
							<span class="flex-grow-1">{{ message.text }}</span>
							<v-btn v-if="message.undo" size="small" variant="text" @click="undo">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.undo") }}
							</v-btn>
						</div>
					</v-alert>

					<!-- The verdict first: either something needs changing, or it is a short all-clear. Nothing else competes with it. -->
					<v-alert v-if="plan.problems.length === 0" type="success" variant="tonal" density="comfortable" class="mb-3" data-test="verdict-clear">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.verdictClear", { to: report.to }) }}
					</v-alert>
					<div v-else class="d-flex align-center ga-3 mb-3" data-test="verdict">
						<v-icon color="error">mdi-alert-circle-outline</v-icon>
						<div class="text-subtitle-1 flex-grow-1">
							{{ $t("plugins.flexibleLayouts.firmwareChanges.verdictProblems", { lines: problemCount.lines, files: problemCount.files }) }}
						</div>
						<v-btn v-if="canApply && safeProblems.length > 0" color="primary" variant="flat" data-test="fix-all" @click="applySafe">
							{{ $t("plugins.flexibleLayouts.firmwareChanges.fixAll", { count: safeProblems.length }) }}
						</v-btn>
					</div>

					<section v-for="g in problemsByFile" :key="g.path" class="mb-4" :data-file="g.path">
						<div class="fw-filename text-caption text-medium-emphasis mb-1">{{ g.path }}</div>
						<article v-for="p in g.items" :key="`${p.event.id}:${p.occurrence.start}`" class="fw-problem mb-3" :data-event="p.event.id">
							<div class="d-flex align-start ga-2">
								<div class="flex-grow-1" style="min-width: 0">
									<div class="d-flex flex-wrap align-baseline ga-2">
										<span class="fw-where text-caption">{{ p.occurrence.path }}:{{ p.occurrence.line + 1 }}</span>
										<code class="fw-snippet">{{ p.occurrence.snippet }}</code>
									</div>
									<div class="mt-1">{{ p.explanation }}</div>
								</div>
								<v-btn size="small" variant="text" @click="ignore(p.event.id)">
									{{ $t("plugins.flexibleLayouts.firmwareChanges.ignore") }}
								</v-btn>
							</div>

							<template v-if="p.fix">
								<div class="text-body-2 mt-2">{{ p.fix.summary }}</div>
								<div v-for="(option, i) in p.fix.options" :key="i" class="fw-option mt-2" :data-option="i">
									<div v-if="p.fix.options.length > 1" class="text-caption font-weight-medium">{{ option.label }}</div>
									<div v-for="c in previewOf(option)" :key="`${c.path}:${c.line}`" class="fw-diff">
										<div v-if="previewOf(option).length > 1" class="text-caption text-medium-emphasis">{{ c.path }}:{{ c.line }}</div>
										<code class="fw-del">- {{ c.before }}</code>
										<code class="fw-add">+ {{ c.after }}</code>
									</div>
									<v-btn v-if="canApply" size="small" color="primary" variant="tonal" class="mt-1" data-test="apply" @click="applyOption(option)">
										{{ $t("plugins.flexibleLayouts.firmwareChanges.apply") }}
									</v-btn>
								</div>
							</template>
							<div v-else class="text-caption text-medium-emphasis mt-2">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.noEdit") }}
							</div>

							<v-btn size="x-small" variant="tonal" class="mt-2" @click="openAt(p.occurrence)">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.open") }}
							</v-btn>
						</article>
					</section>

					<details v-if="plan.worthALook.length" class="mb-3" data-test="worth-a-look">
						<summary>{{ $t("plugins.flexibleLayouts.firmwareChanges.worthALookTitle", { count: plan.worthALook.length }) }}</summary>
						<ul class="fw-lines mt-2">
							<li v-for="p in plan.worthALook" :key="`${p.event.id}:${p.occurrence.path}:${p.occurrence.start}`" class="mb-3" :data-event="p.event.id">
								<div class="d-flex align-start ga-2">
									<div class="flex-grow-1" style="min-width: 0">
										<div class="d-flex flex-wrap align-baseline ga-2">
											<span class="fw-where text-caption">{{ p.occurrence.path }}:{{ p.occurrence.line + 1 }}</span>
											<code class="fw-snippet">{{ p.occurrence.snippet }}</code>
										</div>
										<div class="text-body-2 mt-1">{{ p.explanation }}</div>
									</div>
									<v-btn size="x-small" variant="tonal" @click="openAt(p.occurrence)">{{ $t("plugins.flexibleLayouts.firmwareChanges.open") }}</v-btn>
									<v-btn size="x-small" variant="text" @click="ignore(p.event.id)">{{ $t("plugins.flexibleLayouts.firmwareChanges.ignore") }}</v-btn>
								</div>
							</li>
						</ul>
					</details>

					<p v-if="notRead > 0" class="text-caption text-warning mb-2">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.notRead", { count: notRead }) }}
					</p>

					<!-- What the check could not see stays visible, but as a footnote: an all-clear must not read as "your files are safe". -->
					<p class="text-caption text-medium-emphasis mb-2" data-test="limits">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.limits", { more: report.totals.eventsUndetectable }) }}
					</p>

					<details class="mb-1" data-test="details">
						<summary>{{ $t("plugins.flexibleLayouts.firmwareChanges.detailsTitle") }}</summary>
						<p class="text-caption mt-2" data-test="coverage">
							{{ $t("plugins.flexibleLayouts.firmwareChanges.coverage", {
								checked: report.totals.eventsCheckable, from: report.from, to: report.to, more: report.totals.eventsUndetectable,
							}) }}
						</p>

						<section v-for="group in involvedEvents" :key="group.event.id" class="fw-group mb-3" :data-detail="group.event.id">
							<div class="text-body-2">{{ group.event.description }}</div>
							<div class="d-flex flex-wrap align-center ga-2 mt-1">
								<v-chip size="x-small" :color="kindColor(group.event.kind)" variant="tonal">
									{{ $t(`plugins.flexibleLayouts.firmwareChanges.kind.${group.event.kind}`) }}
								</v-chip>
								<span class="text-caption">{{ $t(effectKey(group.event)) }}</span>
								<span class="text-caption text-medium-emphasis">
									{{ $t("plugins.flexibleLayouts.firmwareChanges.changedIn") }} {{ group.event.version }}
								</span>
							</div>
							<div v-if="group.event.sources.length" class="text-caption text-medium-emphasis mt-1">{{ group.event.sources.join("; ") }}</div>
						</section>

						<div v-if="report.acknowledged.length" class="mb-3">
							<div class="text-caption font-weight-medium">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.ignoredTitle", { count: report.acknowledged.length }) }}
							</div>
							<div v-for="g in report.acknowledged" :key="g.event.id" class="d-flex align-center ga-2 mt-1">
								<span class="text-caption flex-grow-1">{{ g.event.description }} ({{ g.occurrences.length }})</span>
								<v-btn size="x-small" variant="text" @click="restore(g.event.id)">
									{{ $t("plugins.flexibleLayouts.firmwareChanges.restore") }}
								</v-btn>
							</div>
						</div>

						<div v-if="report.undetectable.length">
							<div class="text-caption font-weight-medium">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.undetectableTitle", { count: report.undetectable.length }) }}
							</div>
							<ul class="text-caption mt-1">
								<li v-for="e in report.undetectable" :key="e.id">
									{{ e.description }}
									<span class="text-medium-emphasis">({{ $t("plugins.flexibleLayouts.firmwareChanges.changedIn") }} {{ e.version }})</span>
								</li>
							</ul>
						</div>
					</details>
				</template>
			</v-card-text>

			<v-card-actions>
				<v-btn variant="text" :disabled="!report || busy" @click="copy">
					{{ copied ? $t("plugins.flexibleLayouts.firmwareChanges.copied") : $t("plugins.flexibleLayouts.firmwareChanges.copyReport") }}
				</v-btn>
				<v-spacer />
				<v-btn variant="text" @click="emit('update:modelValue', false)">{{ $t("generic.close") }}</v-btn>
				<v-btn v-if="!preflight" color="primary" variant="flat" :disabled="!canReview" @click="markReviewed">
					{{ $t("plugins.flexibleLayouts.firmwareChanges.markReviewed") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";

import { previewEdits, type DirectedChangeEvent, type FixOption, type ImpactReport, type LineChange, type Problem, type ScanOccurrence } from "dwc-gcode-core";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { explorerUrl } from "../model/explorerRoute";
import { requestReveal } from "../model/explorerSession";
import { filesOfReport, firmwareChangeLoad, firmwareChangeReport, firmwareScanBusy, runFirmwareScan } from "../model/firmware/changeCheck";
import { applyFix, planFor, summaryOf, type ApplyOutcome, type UndoOutcome } from "../model/firmware/changePlan";
import { reportToMarkdown } from "../model/firmware/changeReportMarkdown";
import {
	acknowledgeReview, ignoreChange, mainBoardFirmwareVersion, readFirmwareChangeState, restoreChange,
} from "../model/firmware/changeState";
import { writeSystemClipboard } from "../model/widgetClipboard";

// `attach` is a plain pass-through to v-dialog's own prop (see GcodeFilePickerDialog.vue): Vuetify teleports overlays to <body>,
// which a test wrapper cannot see. Unset in real use.
const props = defineProps<{
	modelValue: boolean;
	attach?: boolean | string;
	/** Show this report instead of the shared one (the firmware-update pre-flight, which is about a release not yet installed). */
	report?: ImpactReport | null;
	/** A pre-flight: nothing has changed yet, so there is nothing to mark as reviewed - and nothing to apply, since the files are right for the version that is running. */
	preflight?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const machineStore = useMachineStore();
const router = useRouter();

// A re-scan after Ignore/Restore/Apply replaces the report we were given; a new one from the parent replaces that.
const rescanned = ref<ImpactReport | null>(null);
watch(() => props.report, () => { rescanned.value = null; });
const report = computed(() => rescanned.value ?? (props.report !== undefined ? props.report : firmwareChangeReport.value));
const busy = computed(() => firmwareScanBusy.value);
const copied = ref(false);
const applying = ref(false);
const notRead = computed(() => (firmwareChangeLoad.value?.tooLarge.length ?? 0) + (firmwareChangeLoad.value?.unreadable.length ?? 0));
const running = computed(() => mainBoardFirmwareVersion(machineStore.model));
/** Reviewing means "my files are now checked against the version that is running", which only makes sense for that range. */
const canReview = computed(() => props.preflight !== true && report.value !== null && running.value !== null && !busy.value);
const canApply = computed(() => props.preflight !== true && !busy.value && !applying.value);

/** What needs doing: the core's second pass over the scan, so the dialog lists problems rather than every line a changed command appears on. */
const plan = computed(() => (report.value === null ? null : planFor(report.value)));
const problemCount = computed(() => summaryOf(plan.value!));

const problemsByFile = computed(() => {
	const groups = new Map<string, Array<Problem>>();
	for (const p of plan.value?.problems ?? []) {
		const list = groups.get(p.occurrence.path);
		if (list === undefined) { groups.set(p.occurrence.path, [p]); } else { list.push(p); }
	}
	return [...groups].map(([path, items]) => ({ path, items }));
});

/** Only one-option fixes the core calls safe; a choice is never applied for the user. */
const safeProblems = computed(() => (plan.value?.problems ?? []).filter((p) => p.fix?.safe === true && p.fix.options.length === 1));

/** The events behind what is listed, once each, for the Details section. */
const involvedEvents = computed(() => {
	const seen = new Map<string, { event: DirectedChangeEvent }>();
	for (const p of [...(plan.value?.problems ?? []), ...(plan.value?.worthALook ?? [])]) { if (!seen.has(p.event.id)) { seen.set(p.event.id, { event: p.event }); } }
	return [...seen.values()];
});

const previews = computed(() => {
	const map = new Map<FixOption, Array<LineChange>>();
	const files = report.value === null ? [] : filesOfReport(report.value);
	for (const p of plan.value?.problems ?? []) {
		for (const option of p.fix?.options ?? []) {
			try { map.set(option, previewEdits(files, option.edits)); } catch { map.set(option, []); }
		}
	}
	return map;
});
const previewOf = (option: FixOption): Array<LineChange> => previews.value.get(option) ?? [];

const t = (key: string, params?: Record<string, unknown>): string => i18n.global.t(`plugins.flexibleLayouts.firmwareChanges.${key}`, params ?? {});

/** Re-scan the same range (changed files only, the rest is cached) after an Ignore/Restore/Apply changed what counts. */
async function rescan(): Promise<void> {
	const r = report.value;
	if (r === null) return;
	const next = await runFirmwareScan(r.from, r.to, { quiet: props.report !== undefined });
	if (props.report !== undefined && next !== null) rescanned.value = next;
}

// Opening with no report yet, when there is a baseline to compare with, produces one.
watch(() => props.modelValue, (open) => {
	if (!open) { copied.value = false; message.value = null; return; }
	if (props.preflight === true) return;
	const state = readFirmwareChangeState();
	if (report.value === null && state.baseline !== null && running.value !== null && state.baseline !== running.value) {
		void runFirmwareScan(state.baseline, running.value);
	}
});

async function ignore(id: string): Promise<void> { ignoreChange(id); await rescan(); }
async function restore(id: string): Promise<void> { restoreChange(id); await rescan(); }

function openAt(o: ScanOccurrence): void {
	requestReveal(o.path, o.line + 1);
	emit("update:modelValue", false);
	void router.push(explorerUrl({ kind: "editor", path: o.path }));
}

// --- applying a suggested edit ------------------------------------------------------------------------------------------

type Message = { type: "success" | "error" | "info"; text: string; undo?: () => Promise<UndoOutcome> };
const message = ref<Message | null>(null);

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

async function applyEdits(edits: FixOption["edits"]): Promise<void> {
	const r = report.value;
	if (r === null || applying.value) return;
	applying.value = true;
	let outcome: ApplyOutcome;
	try {
		outcome = await applyFix(r, edits);
	} finally {
		applying.value = false;
	}
	if (!outcome.ok) {
		message.value = { type: "error", text: t(`applyFailed.${outcome.reason}`, { path: outcome.path === undefined ? "" : baseName(outcome.path) }) };
		return;
	}
	const files = outcome.paths.map(baseName).join(", ");
	const kept = outcome.backups.length > 0 ? ` ${t("applied.backup", { backups: outcome.backups.map(baseName).join(", ") })}` : "";
	const restart = outcome.needsRestart ? ` ${t("applied.restart")}` : "";
	message.value = { type: "success", text: `${t("applied.done", { files })}${kept}${restart}`, undo: outcome.undo };
	await rescan();
}

async function applyOption(option: FixOption): Promise<void> { await applyEdits(option.edits); }

/** Every safe fix at once - one write per file, so two fixes in one file never race each other. */
async function applySafe(): Promise<void> { await applyEdits(safeProblems.value.flatMap((p) => p.fix!.options[0].edits)); }

async function undo(): Promise<void> {
	const undoFn = message.value?.undo;
	if (undoFn === undefined || applying.value) return;
	applying.value = true;
	let result: UndoOutcome;
	try { result = await undoFn(); } finally { applying.value = false; }
	message.value = result.ok
		? { type: "info", text: t("undone") }
		: { type: "error", text: t(`undoFailed.${result.reason}`, { path: result.path === undefined ? "" : baseName(result.path) }) };
	if (result.ok) await rescan();
}

function markReviewed(): void {
	if (running.value !== null) acknowledgeReview(running.value);
	firmwareChangeReport.value = null;
	emit("update:modelValue", false);
}

async function copy(): Promise<void> {
	const r = report.value;
	if (r === null) return;
	const markdown = reportToMarkdown(r, {
		title: (from, to) => t("reportTitle", { from, to }),
		coverage: (checked, from, to, more) => t("coverage", { checked, from, to, more }),
		changedIn: (version) => `${t("changedIn")} ${version}`,
		effect: (event) => i18n.global.t(effectKey(event)),
		sources: t("sources"),
		ignored: t("ignoredTitle", { count: r.acknowledged.length }),
		cannotCheck: t("undetectableTitle", { count: r.undetectable.length }),
		noFindings: t("noFindings"),
	});
	copied.value = await writeSystemClipboard(markdown);
	if (copied.value) setTimeout(() => { copied.value = false; }, 2500);
}

function kindColor(kind: string): string {
	return kind === "removed" ? "error" : kind === "deprecated" ? "warning" : kind === "added" ? "success" : "info";
}

/** Which way this change reads: the recorded `kind` is what happened in RRF's history, `direction` is how the file is moving. */
function effectKey(event: DirectedChangeEvent): string {
	const base = "plugins.flexibleLayouts.firmwareChanges.effect.";
	if (event.direction === "upgrade") {
		return base + (event.kind === "removed" ? "stopsWorking" : event.kind === "deprecated" ? "deprecated" : "changes");
	}
	return base + (event.kind === "added" ? "notAvailable" : event.kind === "deprecated" ? "notYetDeprecated" : "behavesDifferently");
}
</script>

<style scoped>
.fw-group { border-left: 3px solid rgba(var(--v-theme-primary), 0.5); padding-left: 12px; }
.fw-problem { border-left: 3px solid rgb(var(--v-theme-error)); padding-left: 12px; }
.fw-lines { list-style: none; padding: 0; margin: 0; }
.fw-where { flex: 0 0 auto; overflow-wrap: anywhere; }
.fw-snippet { min-width: 0; overflow-wrap: anywhere; }
.fw-option { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); border-radius: 4px; padding: 8px; }
.fw-diff code { display: block; overflow-wrap: anywhere; white-space: pre-wrap; padding: 1px 6px; }
.fw-del { background: rgba(var(--v-theme-error), 0.14); }
.fw-add { background: rgba(var(--v-theme-success), 0.16); }
</style>
