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
				<div v-if="busy" class="d-flex align-center ga-3 py-4" role="status">
					<v-progress-circular indeterminate size="20" width="2" />
					<span>{{ $t("plugins.flexibleLayouts.firmwareChanges.scanning") }}</span>
				</div>

				<v-alert v-else-if="!report" type="info" variant="tonal" density="comfortable">
					{{ $t("plugins.flexibleLayouts.firmwareChanges.noReport") }}
				</v-alert>

				<template v-else>
					<p class="text-body-2 mb-3" data-test="coverage">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.coverage", {
							checked: report.totals.eventsCheckable, from: report.from, to: report.to, more: report.totals.eventsUndetectable,
						}) }}
					</p>
					<p v-if="notRead > 0" class="text-caption text-warning mb-3">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.notRead", { count: notRead }) }}
					</p>

					<v-alert v-if="report.byEvent.length === 0" type="info" variant="tonal" density="comfortable" class="mb-3">
						{{ $t("plugins.flexibleLayouts.firmwareChanges.noFindings") }}
					</v-alert>

					<section v-for="group in report.byEvent" :key="group.event.id" class="fw-group mb-4" :data-event="group.event.id">
						<div class="d-flex align-start ga-2">
							<div class="flex-grow-1">
								<div class="font-weight-medium">{{ group.event.description }}</div>
								<div class="d-flex flex-wrap align-center ga-2 mt-1">
									<v-chip size="x-small" :color="kindColor(group.event.kind)" variant="tonal">
										{{ $t(`plugins.flexibleLayouts.firmwareChanges.kind.${group.event.kind}`) }}
									</v-chip>
									<span class="text-caption">{{ $t(effectKey(group.event)) }}</span>
									<span class="text-caption text-medium-emphasis">
										{{ $t("plugins.flexibleLayouts.firmwareChanges.changedIn") }} {{ group.event.version }}
									</span>
								</div>
								<div v-if="group.event.sources.length" class="text-caption text-medium-emphasis mt-1">
									{{ group.event.sources.join("; ") }}
								</div>
							</div>
							<v-btn size="small" variant="text" @click="ignore(group.event.id)">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.ignore") }}
							</v-btn>
						</div>
						<ul class="fw-lines mt-2">
							<li v-for="o in group.occurrences" :key="`${o.path}:${o.start}`" class="d-flex align-center ga-2">
								<span class="fw-where text-caption">{{ o.path }}:{{ o.line + 1 }}</span>
								<code class="fw-snippet flex-grow-1">{{ o.snippet }}</code>
								<v-btn size="x-small" variant="tonal" @click="openAt(o)">
									{{ $t("plugins.flexibleLayouts.firmwareChanges.open") }}
								</v-btn>
							</li>
						</ul>
					</section>

					<details v-if="report.acknowledged.length" class="mb-3">
						<summary>{{ $t("plugins.flexibleLayouts.firmwareChanges.ignoredTitle", { count: report.acknowledged.length }) }}</summary>
						<div v-for="g in report.acknowledged" :key="g.event.id" class="d-flex align-center ga-2 mt-1">
							<span class="text-caption flex-grow-1">{{ g.event.description }} ({{ g.occurrences.length }})</span>
							<v-btn size="x-small" variant="text" @click="restore(g.event.id)">
								{{ $t("plugins.flexibleLayouts.firmwareChanges.restore") }}
							</v-btn>
						</div>
					</details>

					<details v-if="report.undetectable.length" class="mb-1">
						<summary>{{ $t("plugins.flexibleLayouts.firmwareChanges.undetectableTitle", { count: report.undetectable.length }) }}</summary>
						<ul class="text-caption mt-1">
							<li v-for="e in report.undetectable" :key="e.id">
								{{ e.description }}
								<span class="text-medium-emphasis">({{ $t("plugins.flexibleLayouts.firmwareChanges.changedIn") }} {{ e.version }})</span>
							</li>
						</ul>
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

import type { DirectedChangeEvent, ImpactReport, ScanOccurrence } from "dwc-gcode-core";

import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { explorerUrl } from "../model/explorerRoute";
import { requestReveal } from "../model/explorerSession";
import { firmwareChangeLoad, firmwareChangeReport, firmwareScanBusy, runFirmwareScan } from "../model/firmware/changeCheck";
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
	/** A pre-flight: nothing has changed yet, so there is nothing to mark as reviewed. */
	preflight?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const machineStore = useMachineStore();
const router = useRouter();

// A re-scan after Ignore/Restore replaces the report we were given; a new one from the parent replaces that.
const rescanned = ref<ImpactReport | null>(null);
watch(() => props.report, () => { rescanned.value = null; });
const report = computed(() => rescanned.value ?? (props.report !== undefined ? props.report : firmwareChangeReport.value));
const busy = computed(() => firmwareScanBusy.value);
const copied = ref(false);
const notRead = computed(() => (firmwareChangeLoad.value?.tooLarge.length ?? 0) + (firmwareChangeLoad.value?.unreadable.length ?? 0));
const running = computed(() => mainBoardFirmwareVersion(machineStore.model));
/** Reviewing means "my files are now checked against the version that is running", which only makes sense for that range. */
const canReview = computed(() => props.preflight !== true && report.value !== null && running.value !== null && !busy.value);

const t = (key: string, params?: Record<string, unknown>): string => i18n.global.t(`plugins.flexibleLayouts.firmwareChanges.${key}`, params ?? {});

/** Re-scan the same range (cached files, so quick) after an Ignore/Restore changed which events count. */
async function rescan(): Promise<void> {
	const r = report.value;
	if (r === null) return;
	const next = await runFirmwareScan(r.from, r.to, { quiet: props.report !== undefined });
	if (props.report !== undefined && next !== null) rescanned.value = next;
}

// Opening with no report yet, when there is a baseline to compare with, produces one.
watch(() => props.modelValue, (open) => {
	if (!open) { copied.value = false; return; }
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
.fw-lines { list-style: none; padding: 0; margin: 0; }
.fw-where { flex: 0 0 auto; max-width: 45%; overflow-wrap: anywhere; }
.fw-snippet { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
