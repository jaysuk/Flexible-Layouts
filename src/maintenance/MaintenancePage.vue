<template>
	<v-container fluid class="py-4">
		<div class="d-flex align-center mb-4">
			<v-icon size="large" class="me-3">mdi-wrench-cog-outline</v-icon>
			<div class="text-title-medium">{{ $t("plugins.flexibleLayouts.maintenance.title") }}</div>
			<v-spacer />
			<v-switch v-if="trackingConfigured" :model-value="trackingEnabled" density="compact" hide-details
					  :disabled="togglingTracking" class="me-3" style="flex: none;"
					  :label="trackingEnabled ? $t('plugins.flexibleLayouts.maintenance.trackingOn') : $t('plugins.flexibleLayouts.maintenance.trackingOff')"
					  @update:model-value="(v) => onToggleTracking(v === true)" />
			<v-btn v-if="log.entries.length" size="small" variant="tonal" prepend-icon="mdi-file-delimited-outline" class="me-2" @click="onExportCsv">
				{{ $t("plugins.flexibleLayouts.maintenance.exportCsv") }}
			</v-btn>
			<v-btn size="small" variant="tonal" prepend-icon="mdi-cog-outline" @click="setupOpen = true">
				{{ $t("plugins.flexibleLayouts.maintenance.setupAction") }}
			</v-btn>
		</div>

		<!-- "Update required" (not "not set up") when the macros ARE deployed but from an older template: the
			 user already set this up, and their totals are intact - only the new features need the update. -->
		<v-alert v-if="!trackingConfigured" :type="macroStatus === 'outdated' ? 'warning' : 'info'" variant="tonal" density="compact" class="mb-4">
			{{ $t(macroStatus === "outdated" ? "plugins.flexibleLayouts.maintenance.updateRequired" : "plugins.flexibleLayouts.maintenance.notSetUp") }}
		</v-alert>

		<!-- Item F: a checksum mismatch means the log file on the card is already inconsistent with
			 itself (most likely a partial/corrupted SD write) - surfaced here rather than silently
			 continuing, and new entries are refused (see onLogEntry's "blocked" handling) rather than
			 rewriting the whole file over data that might still be manually recoverable. -->
		<v-alert v-if="logIntegrity === 'mismatch'" type="warning" variant="tonal" density="compact" class="mb-4">
			{{ $t("plugins.flexibleLayouts.maintenance.logIntegrityWarning") }}
		</v-alert>

		<v-row dense class="mb-4">
			<template v-if="isFff">
				<v-col cols="6" sm="3">
					<v-card variant="tonal" class="pa-3 text-center">
						<div class="text-h6">{{ printHoursDisplay }}</div>
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.printHours") }}</div>
					</v-card>
				</v-col>
				<v-col cols="6" sm="3">
					<v-card variant="tonal" class="pa-3 text-center">
						<div class="text-h6">{{ filamentUsedDisplay }}</div>
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.filamentUsed") }}</div>
					</v-card>
				</v-col>
				<v-col cols="6" sm="3">
					<v-card variant="tonal" class="pa-3 text-center">
						<div class="text-h6">{{ toolChangesDisplay }}</div>
						<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.toolChanges") }}</div>
					</v-card>
				</v-col>
			</template>
			<v-col v-else cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ spindleHoursDisplay }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.spindleHours") }}</div>
				</v-card>
			</v-col>
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ jobCounts.started }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsStarted") }}</div>
				</v-card>
			</v-col>
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ jobCounts.finished }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsCompleted") }}</div>
				</v-card>
			</v-col>
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ jobCounts.cancelled }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.jobsCancelled") }}</div>
				</v-card>
			</v-col>
			<v-col cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ powerOnHoursDisplay }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.powerOnHours") }}</div>
				</v-card>
			</v-col>
			<v-col v-if="isFff" cols="6" sm="3">
				<v-card variant="tonal" class="pa-3 text-center">
					<div class="text-h6">{{ filamentErrorsDisplay }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.filamentErrors") }}</div>
				</v-card>
			</v-col>
		</v-row>

		<!-- Per-axis travel / per-fan / per-heater breakdown (v8) - collapsed by default since most
			 users only care about the headline figures above; this is the "why is X worn" detail. Rows
			 are built from the live object model directly (axis letters, fan/heater count) filtered
			 against the tracked arrays, so a machine with fewer axes/fans/heaters than the fixed
			 tracking capacity just shows fewer rows rather than a padding row of zeros. -->
		<v-expansion-panels v-if="trackingConfigured" variant="accordion" class="mb-4">
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.maintenance.usageDetail')">
				<v-expansion-panel-text>
					<!-- Each category's own on/off switch lives right next to its data (v10) - not one
						 combined switch elsewhere on the page - so turning off (say) fan tracking doesn't
						 also require giving up axis/heater tracking to do it. -->
					<div v-if="axisRows.length" class="mnt-detail-group">
						<div class="d-flex align-center mb-1">
							<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.axisTravel") }}</div>
							<v-spacer />
							<v-switch :model-value="trackAxesEnabled" density="compact" hide-details :disabled="togglingTrackAxes"
									  class="mnt-detail-switch" @update:model-value="(v) => onToggleTrackCategory('axes', v === true)" />
						</div>
						<div v-for="row in axisRows" :key="row.letter" class="mnt-detail-row">
							<span>{{ row.letter }}</span>
							<span>{{ row.display }}</span>
						</div>
					</div>
					<div v-if="fanRows.length" class="mnt-detail-group">
						<div class="d-flex align-center mb-1">
							<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.fanRuntime") }}</div>
							<v-spacer />
							<v-switch :model-value="trackFansEnabled" density="compact" hide-details :disabled="togglingTrackFans"
									  class="mnt-detail-switch" @update:model-value="(v) => onToggleTrackCategory('fans', v === true)" />
						</div>
						<div v-for="row in fanRows" :key="row.index" class="mnt-detail-row">
							<span>{{ $t("plugins.flexibleLayouts.maintenance.fanLabel", { index: row.index }) }}</span>
							<span>{{ row.display }}</span>
						</div>
					</div>
					<div v-if="heaterRows.length" class="mnt-detail-group">
						<div class="d-flex align-center mb-1">
							<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.maintenance.heaterOnTime") }}</div>
							<v-spacer />
							<v-switch :model-value="trackHeatersEnabled" density="compact" hide-details :disabled="togglingTrackHeaters"
									  class="mnt-detail-switch" @update:model-value="(v) => onToggleTrackCategory('heaters', v === true)" />
						</div>
						<div v-for="row in heaterRows" :key="row.index" class="mnt-detail-row">
							<span>{{ $t("plugins.flexibleLayouts.maintenance.heaterLabel", { index: row.index }) }}</span>
							<span>{{ row.onDisplay }} <span class="text-caption text-medium-emphasis">({{ $t("plugins.flexibleLayouts.maintenance.fullLoad", { hours: row.fullLoadDisplay }) }})</span></span>
						</div>
					</div>
					<div v-if="!axisRows.length && !fanRows.length && !heaterRows.length" class="text-caption text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.maintenance.usageDetailEmpty") }}
					</div>
				</v-expansion-panel-text>
			</v-expansion-panel>

			<!-- Item G: 30-day trend + job-outcome breakdown. Plain CSS bars, not ChartWidget/chartSampler
				 - those are built around polling a LIVE object-model path at an interval, not rendering a
				 static day-by-day series read from an SD file, so reusing them here would need deeper
				 surgery than this nice-to-have warrants. See history.ts's class doc for why these
				 snapshots are taken from the browser rather than the daemon macro. -->
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.maintenance.trendTitle')">
				<v-expansion-panel-text>
					<v-switch :model-value="trendEnabled" density="compact" hide-details class="mb-2"
							  :label="$t('plugins.flexibleLayouts.maintenance.trendEnable')"
							  @update:model-value="(v) => onToggleTrend(v === true)" />
					<div v-if="!trendEnabled" class="text-caption text-medium-emphasis mb-3">
						{{ $t("plugins.flexibleLayouts.maintenance.trendDisabled") }}
					</div>
					<template v-else>
					<div v-if="dailyActivity.length" class="mnt-detail-group">
						<div class="text-caption text-medium-emphasis mb-1">
							{{ isFff ? $t("plugins.flexibleLayouts.maintenance.trendPrintHours") : $t("plugins.flexibleLayouts.maintenance.trendSpindleHours") }}
						</div>
						<div class="mnt-trend-bars">
							<div v-for="day in dailyActivity" :key="day.date" class="mnt-trend-bar-col" :title="`${day.date}: ${day.display}`">
								<div class="mnt-trend-bar" :style="{ height: day.pct + '%' }" />
							</div>
						</div>
					</div>
					<div v-else class="text-caption text-medium-emphasis mb-3">
						{{ $t("plugins.flexibleLayouts.maintenance.trendEmpty") }}
					</div>
					</template>

					<!-- Job-outcome breakdown reads live OM job counters directly, not the trend snapshot
						 ring - it stays visible regardless of trendEnabled above. -->
					<div v-if="jobOutcome.total > 0" class="mnt-detail-group">
						<div class="text-caption text-medium-emphasis mb-1">{{ $t("plugins.flexibleLayouts.maintenance.jobOutcomeTitle") }}</div>
						<div class="mnt-outcome-bar">
							<div class="mnt-outcome-finished" :style="{ width: jobOutcome.finishedPct + '%' }" />
							<div class="mnt-outcome-cancelled" :style="{ width: jobOutcome.cancelledPct + '%' }" />
						</div>
						<div class="d-flex justify-space-between text-caption text-medium-emphasis mt-1">
							<span>{{ $t("plugins.flexibleLayouts.maintenance.jobsCompleted") }}: {{ jobCounts.finished }}</span>
							<span>{{ $t("plugins.flexibleLayouts.maintenance.jobsCancelled") }}: {{ jobCounts.cancelled }}</span>
						</div>
					</div>
				</v-expansion-panel-text>
			</v-expansion-panel>

			<!-- Item H: per-rule "due"/"overdue" badges, derived live from Item D's own baseline
				 machinery (mostRecentEntryForCounter/baselineForCounter) - a rule with no matching
				 logged service yet reads as "unknown" (dash), never a false "overdue". The rules live on
				 the machine (shared by every browser) and a rule can carry an action the MACHINE runs when
				 it comes due - see MaintenanceRulesPanel.vue. -->
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.maintenance.remindersTitle')">
				<v-expansion-panel-text>
					<MaintenanceRulesPanel :state="rulesState" :log="log" :is-fff="isFff" />
				</v-expansion-panel-text>
			</v-expansion-panel>

			<!-- User-defined counters: "count the time while these conditions are true", run on the
				 machine like every other counter. -->
			<v-expansion-panel :title="$t('plugins.flexibleLayouts.maintenance.customTitleSection')">
				<v-expansion-panel-text>
					<CustomCountersPanel :state="rulesState" />
				</v-expansion-panel-text>
			</v-expansion-panel>

			<!-- Only on a machine that has the Duet3D Maintenance Timers plugin: FL is the UI for it. -->
			<v-expansion-panel v-if="pluginTimersInstalled" :title="$t('plugins.flexibleLayouts.maintenance.pluginTimersTitle')">
				<v-expansion-panel-text>
					<PluginTimersPanel />
				</v-expansion-panel-text>
			</v-expansion-panel>
		</v-expansion-panels>

		<v-card variant="outlined" class="mb-4">
			<v-card-text class="d-flex ga-2 align-start flex-wrap">
				<v-select v-model="newCategory" :items="categoryItems" density="compact" variant="outlined" hide-details
						  :label="$t('plugins.flexibleLayouts.maintenance.category')" style="max-width: 220px;" />
				<v-text-field v-model="newNote" density="compact" variant="outlined" hide-details
							  :label="$t('plugins.flexibleLayouts.maintenance.note')" class="flex-grow-1" style="min-width: 200px;" />
				<v-btn color="primary" :loading="logging" :disabled="logIntegrity === 'mismatch'" @click="onLogEntry">
					{{ $t("plugins.flexibleLayouts.maintenance.addEntry") }}
				</v-btn>
			</v-card-text>
			<!-- Item D: which counters this entry resets the "since last service" baseline for. Nothing
				 checked (the default) means "all of them" - the original, pre-this-field behaviour - so
				 a user who never touches this gets exactly what they got before. -->
			<v-card-text class="pt-0">
				<!-- A multi-select rather than a checkbox per counter: with per-axis, per-fan, per-heater and
					 user counters there can be dozens. Nothing chosen still means "all of them". -->
				<v-select v-model="newServices" :items="counterItems" item-title="title" item-value="key" multiple chips closable-chips
						  density="compact" variant="outlined" hide-details :label="$t('plugins.flexibleLayouts.maintenance.servicesLabel')"
						  :placeholder="$t('plugins.flexibleLayouts.maintenance.servicesAll')" persistent-placeholder />
			</v-card-text>
		</v-card>

		<div class="text-subtitle-2 mb-1">{{ $t("plugins.flexibleLayouts.maintenance.entriesTitle") }}</div>
		<div v-if="!log.entries.length" class="text-caption text-medium-emphasis">
			{{ $t("plugins.flexibleLayouts.maintenance.noEntriesYet") }}
		</div>
		<div v-for="entry in sortedEntries" :key="entry.id" class="d-flex align-center py-1" style="border-bottom: 1px solid rgba(127,127,127,0.15)">
			<div class="flex-grow-1">
				<div class="text-body-2">{{ formatWhen(entry.loggedAt) }} — {{ categoryLabel(entry.category) }}</div>
				<div v-if="entry.note" class="text-caption text-medium-emphasis">{{ entry.note }}</div>
			</div>
			<!-- Item D: an entry that named specific `services` shows one "since" badge per counter it
				 actually resets (only for whichever of those THIS entry is still the newest for); an
				 entry with no `services` at all keeps the original single category-scoped badge. -->
			<div class="d-flex flex-column align-end ga-0">
				<span v-for="badge in sinceEntryBadges(entry)" :key="badge.label" class="text-caption text-medium-emphasis">
					{{ badge.label ? `${badge.label}: ${badge.display}` : badge.display }}
				</span>
			</div>
		</div>

		<MaintenanceSetupDialog v-model="setupOpen" />
	</v-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";
import i18n from "@/i18n";
import { downloadBlob } from "dwc-plugin-runtime";

import { can, requestAdmin } from "../model/access";
import { defaultMachineIO } from "../model/configBackup/machineIO";
import { DEFAULT_EVENT_LOG_FILE } from "../model/maintenance/configPatch";
import { parseEventLog, totalJobSeconds } from "../model/maintenance/eventLog";
import {
	dailyDelta, dateKey, emptyMaintenanceHistory, readMaintenanceHistory, recordDailySnapshot,
	type DailySnapshot, type MaintenanceHistory,
} from "../model/maintenance/history";
import { isTrendTrackingEnabled, setTrendTrackingEnabled } from "../model/maintenance/historySettings";
import {
	appendMaintenanceEntry, baselineForCounter, emptyMaintenanceLog, maintenanceLogToCsv, mostRecentEntry,
	mostRecentEntryForCounter, readMaintenanceLogWithIntegrity, secondsSince, type MaintenanceCounterKey,
	type MaintenanceEntry, type MaintenanceIntegrity, type MaintenanceLog,
} from "../model/maintenance/log";
import { maintenanceMacroStatus, seedMaintenanceState, type MaintenanceMacroStatus } from "../model/maintenance/macros";
import {
	counterCatalogue, counterTitle, formatCounterAmount, liveCounterValue, snapshotExtraBaselines,
} from "../model/maintenance/counters";
import { readPluginTimers } from "../model/maintenance/pluginTimers";
import { resolveOmPath } from "../util/omPath";
import CustomCountersPanel from "./CustomCountersPanel.vue";
import MaintenanceRulesPanel from "./MaintenanceRulesPanel.vue";
import MaintenanceSetupDialog from "./MaintenanceSetupDialog.vue";
import PluginTimersPanel from "./PluginTimersPanel.vue";
import { useMaintenanceRules } from "./useMaintenanceRules";

const machineStore = useMachineStore();
const uiStore = useUiStore();

const setupOpen = ref(false);
const macroStatus = ref<MaintenanceMacroStatus>("missing");
const trackingConfigured = computed(() => macroStatus.value === "ready");
const togglingTracking = ref(false);
const togglingTrackAxes = ref(false);
const togglingTrackFans = ref(false);
const togglingTrackHeaters = ref(false);

// Job history (liveJobSeconds/jobCounts) and the maintenance log itself need an actual SD-card read,
// so they can't be plain computeds - refreshed on mount and on a timer below (EVENT_LOG_POLL_MS). Every
// other live figure below reads straight off the live object model (already reactive, pushed by DWC's
// own poll/websocket) via a computed, so it updates the instant the machine reports a new value - no
// manual refresh, no stale numbers left over from whenever the page happened to last mount.
function liveNumber(path: string): number | null {
	const v = resolveOmPath(machineStore.model, path);
	return typeof v === "number" ? v : null;
}
function liveBool(path: string, fallback: boolean): boolean {
	const v = resolveOmPath(machineStore.model, path);
	return typeof v === "boolean" ? v : fallback;
}

const liveJobSeconds = ref<number | null>(null);
const log = ref<MaintenanceLog>(emptyMaintenanceLog());
/** Item F: "none"/"ok"/"mismatch" - see readMaintenanceLogWithIntegrity's doc comment. Drives the
 *  warning banner and blocks new entries while "mismatch" (see onLogEntry). */
const logIntegrity = ref<MaintenanceIntegrity>("none");

const isFff = computed(() => resolveOmPath(machineStore.model, "state.machineMode") === "FFF");

const liveSpindleSeconds = computed(() => liveNumber("global.flMaintSpindleSec"));
const livePrintSeconds = computed(() => liveNumber("global.flMaintPrintSec"));
const liveFilamentMm = computed(() => liveNumber("global.flMaintFilamentMm"));
const liveToolChanges = computed(() => liveNumber("global.flMaintToolChanges"));
const livePowerOnSeconds = computed(() => liveNumber("global.flMaintPowerOnSec"));
const liveFilamentErrors = computed(() => liveNumber("global.flMaintFilamentErrors"));
const trackingEnabled = computed(() => liveBool("global.flMaintEnabled", true));
// v10: three INDEPENDENT flags, each OFF by default (see macros.ts's v10 doc comment) - separate from
// trackingEnabled (and from each other) so pausing/resuming the base counters, or toggling one
// category, can't silently flip any of the others.
const trackAxesEnabled = computed(() => liveBool("global.flMaintTrackAxes", false));
const trackFansEnabled = computed(() => liveBool("global.flMaintTrackFans", false));
const trackHeatersEnabled = computed(() => liveBool("global.flMaintTrackHeaters", false));

// Job started/finished/cancelled counts are incremented directly by start.g/stop.g/cancel.g
// (jobTrackingPatch.ts) - NOT parsed from RRF's WARN-level event log text. That text-matching approach
// (still used below only for liveJobSeconds, a low-visibility duration figure) had no way to scope
// "started" to actually being about a print - any warn-level line merely containing that word counted,
// which is what let this figure climb on a real user's machine without them starting a job.
const jobCounts = computed(() => ({
	started: liveNumber("global.flMaintJobsStarted") ?? 0,
	finished: liveNumber("global.flMaintJobsFinished") ?? 0,
	cancelled: liveNumber("global.flMaintJobsCancelled") ?? 0,
}));

// --- Item G: 30-day trend + job-outcome breakdown -------------------------------------------------

const history = ref<MaintenanceHistory>(emptyMaintenanceHistory());
const trendEnabled = ref(isTrendTrackingEnabled());
function onToggleTrend(enabled: boolean): void {
	trendEnabled.value = enabled;
	setTrendTrackingEnabled(enabled);
}

/** One bar per stored day (oldest first) showing that day's ACTIVITY (a diff against the previous
 *  day, via dailyDelta - the stored value itself is cumulative-to-date, not the day's own usage).
 *  Compares print-hours on an FFF machine, spindle-hours otherwise - the same mode-driven choice the
 *  headline stat card above already makes. Bar height is a percentage of the busiest day in the
 *  window, so the chart is always readable regardless of the machine's actual usage scale. */
const dailyActivity = computed(() => {
	const key = isFff.value ? "printSeconds" : "spindleSeconds";
	const deltas = history.value.days.map((day, i) => ({
		date: day.date,
		seconds: dailyDelta(day, history.value.days[i - 1], key),
	}));
	const max = Math.max(1, ...deltas.map((d) => d.seconds ?? 0));
	return deltas.map((d) => ({
		date: d.date,
		pct: d.seconds != null ? Math.max(2, Math.round((d.seconds / max) * 100)) : 0, // 2% floor so a real (if tiny) day still shows a sliver, not nothing
		display: d.seconds != null ? (d.seconds / 3600).toFixed(1) + "h" : "—",
	}));
});

/** Proportional split of finished vs cancelled (not "started" - that isn't a mutually-exclusive
 *  outcome alongside the other two, it's a superset of both). A stacked bar rather than a full
 *  pie/donut - same information, far less rendering risk than SVG arc-path maths for what both this
 *  and the trend chart above are: a nice-to-have visual, not the feature's core value. */
const jobOutcome = computed(() => {
	const { finished, cancelled } = jobCounts.value;
	const total = finished + cancelled;
	return {
		total,
		finishedPct: total > 0 ? (finished / total) * 100 : 0,
		cancelledPct: total > 0 ? (cancelled / total) * 100 : 0,
	};
});

/** Folds today's live counters into the 30-day ring if they've changed since the last time this ran -
 *  see history.ts's class doc for why this is browser-driven (once per calendar day DWC happens to be
 *  open) rather than daemon-macro-driven. Best-effort: a failure here never surfaces to the user, the
 *  same as every other "nice to have" write in this feature. */
async function updateDailySnapshot(): Promise<void> {
	if (!machineStore.isConnected || !trendEnabled.value) { return; }
	const today: DailySnapshot = {
		date: dateKey(new Date()),
		spindleSeconds: liveSpindleSeconds.value,
		printSeconds: livePrintSeconds.value,
		filamentMm: liveFilamentMm.value,
		toolChanges: liveToolChanges.value,
		powerOnSeconds: livePowerOnSeconds.value,
		jobsStarted: jobCounts.value.started,
		jobsFinished: jobCounts.value.finished,
		jobsCancelled: jobCounts.value.cancelled,
	};
	await recordDailySnapshot(today);
	history.value = await readMaintenanceHistory();
}

// --- Item H: service-interval reminders, machine-side rules, user counters ----------------------------
// The rules and user counters live on the machine (model/reminders/rulesStore.ts) and drive a generated
// macro there; this page only owns the shared state and hands it to the panels.

const rulesState = useMaintenanceRules(() => log.value);

const pluginTimersInstalled = computed(() => readPluginTimers(machineStore.model) !== null);

/** Every counter this machine can be measured by - what a log entry can be said to service. */
const counterItems = computed(() => counterCatalogue(machineStore.model, (k, p) => i18n.global.t(k, p ?? {}) as string, {
	isFff: isFff.value, customCounters: rulesState.doc.customCounters,
}));

// --- Per-axis/fan/heater detail (v8) ------------------------------------------------------------------
// Reads the tracked arrays alongside the live axis/fan/heater lists so each row's label comes from the
// ACTUAL machine config (axis letter, fan/heater index), not the fixed tracking-array capacity - a
// machine with 4 axes shows 4 rows even though the array itself always has MAINTENANCE_MAX_TRACKED_AXES
// slots. A raw array/object read (not liveNumber's single-value narrowing) since these are structured.
function liveArray(path: string): Array<unknown> {
	const v = resolveOmPath(machineStore.model, path);
	return Array.isArray(v) ? v : [];
}
function liveTrackedNumbers(path: string): Array<number> {
	const v = resolveOmPath(machineStore.model, path);
	return Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n : 0)) : [];
}

const axisRows = computed(() => {
	const tracked = liveTrackedNumbers("global.flMaintAxisMm");
	return liveArray("move.axes")
		.map((a, i) => ({ letter: (a as { letter?: string })?.letter ?? "?", mm: tracked[i] ?? 0 }))
		.filter((_, i) => i < tracked.length)
		.map((r) => ({ ...r, display: (r.mm / 1000).toFixed(1) + " m" }));
});
const fanRows = computed(() => {
	const tracked = liveTrackedNumbers("global.flMaintFanSec");
	return liveArray("fans")
		.map((f, i) => ({ index: i, present: f != null, sec: tracked[i] ?? 0 }))
		.filter((r, i) => i < tracked.length && r.present)
		.map((r) => ({ index: r.index, display: (r.sec / 3600).toFixed(1) + " h" }));
});
const heaterRows = computed(() => {
	const onTracked = liveTrackedNumbers("global.flMaintHeaterSec");
	const fullTracked = liveTrackedNumbers("global.flMaintHeaterFullSec");
	return liveArray("heat.heaters")
		.map((h, i) => ({ index: i, present: h != null, onSec: onTracked[i] ?? 0, fullSec: fullTracked[i] ?? 0 }))
		.filter((r, i) => i < onTracked.length && r.present)
		.map((r) => ({
			index: r.index,
			onDisplay: (r.onSec / 3600).toFixed(1) + " h",
			fullLoadDisplay: (r.fullSec / 3600).toFixed(1) + " h",
		}));
});

const spindleHoursDisplay = computed(() => (liveSpindleSeconds.value != null ? (liveSpindleSeconds.value / 3600).toFixed(1) : "—"));
const printHoursDisplay = computed(() => (livePrintSeconds.value != null ? (livePrintSeconds.value / 3600).toFixed(1) : "—"));
const filamentUsedDisplay = computed(() => (liveFilamentMm.value != null ? (liveFilamentMm.value / 1000).toFixed(1) + " m" : "—"));
const toolChangesDisplay = computed(() => (liveToolChanges.value != null ? String(liveToolChanges.value) : "—"));
const powerOnHoursDisplay = computed(() => (livePowerOnSeconds.value != null ? (livePowerOnSeconds.value / 3600).toFixed(1) : "—"));
const filamentErrorsDisplay = computed(() => (liveFilamentErrors.value != null ? String(liveFilamentErrors.value) : "—"));

/** Checks the deployed-macros status once - this needs an SD-card download and only ever changes when
 *  the setup dialog is applied (which calls this itself), so it isn't worth polling. */
async function checkTrackingConfigured(): Promise<void> {
	const io = defaultMachineIO();
	macroStatus.value = await maintenanceMacroStatus(io);
}

/** Re-reads the event log (for liveJobSeconds only - job COUNTS come from the object model above) and
 *  the maintenance log from the SD card - the only remaining "values" on this page that need an actual
 *  fetch rather than a reactive OM read. Called on mount and on a timer. */
async function refreshJobHistory(): Promise<void> {
	const io = defaultMachineIO();
	try {
		const systemDir = (machineStore.model as { directories?: { system?: string } }).directories?.system || "0:/sys";
		const text = await io.downloadText(`${systemDir}/${DEFAULT_EVENT_LOG_FILE}`);
		liveJobSeconds.value = totalJobSeconds(parseEventLog(text));
	} catch {
		liveJobSeconds.value = null; // no log file yet (not set up, or nothing's run since)
	}
	const result = await readMaintenanceLogWithIntegrity();
	log.value = result.log;
	logIntegrity.value = result.integrity;
}

const EVENT_LOG_POLL_MS = 10000;
// Coarser than EVENT_LOG_POLL_MS on purpose - this does an SD read every time it runs (to check
// whether today's snapshot needs updating), unlike the OM-reactive computeds above which cost
// nothing to re-check. A calendar day is long enough that checking every few minutes is still
// certain to catch the day boundary while DWC is open, without hammering the card.
const HISTORY_POLL_MS = 5 * 60 * 1000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let historyPollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
	void checkTrackingConfigured();
	void refreshJobHistory();
	void updateDailySnapshot();
	void rulesState.reload();
	pollTimer = setInterval(() => { void refreshJobHistory(); }, EVENT_LOG_POLL_MS);
	historyPollTimer = setInterval(() => { void updateDailySnapshot(); }, HISTORY_POLL_MS);
});
onBeforeUnmount(() => {
	if (pollTimer) { clearInterval(pollTimer); }
	if (historyPollTimer) { clearInterval(historyPollTimer); }
});

// --- Logging a new entry ------------------------------------------------------------------------------

const categoryItems = [
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryCollet"), value: "collet" },
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryBelt"), value: "belt" },
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryLubrication"), value: "lubrication" },
	{ title: i18n.global.t("plugins.flexibleLayouts.maintenance.categoryCustom"), value: "custom" },
];
function categoryLabel(value: string): string {
	return categoryItems.find((c) => c.value === value)?.title ?? value;
}

const newCategory = ref("collet");
const newNote = ref("");
// Item D: which counters this entry resets the baseline for. Empty = "all of them" (see
// appendMaintenanceEntry's / mostRecentEntryForCounter's shared "absent/empty means everything" rule).
const newServices = ref<Array<MaintenanceCounterKey>>([]);
const logging = ref(false);

async function onLogEntry(): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	logging.value = true;
	try {
		const result = await appendMaintenanceEntry({
			loggedAt: Date.now(),
			category: newCategory.value,
			note: newNote.value,
			spindleSecondsAtEntry: liveSpindleSeconds.value,
			jobSecondsAtEntry: liveJobSeconds.value,
			printSecondsAtEntry: livePrintSeconds.value,
			filamentMmAtEntry: liveFilamentMm.value,
			toolChangesAtEntry: liveToolChanges.value,
			baselines: snapshotExtraBaselines(machineStore.model, rulesState.doc.customCounters.map((c) => c.id)),
			...(newServices.value.length ? { services: newServices.value } : {}),
		});
		if (result === "blocked") {
			uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.maintenance.title"), i18n.global.t("plugins.flexibleLayouts.maintenance.addEntryBlocked"));
			return;
		}
		if (result === "failed") {
			uiStore.makeNotification(LogLevel.error, i18n.global.t("plugins.flexibleLayouts.maintenance.title"), i18n.global.t("plugins.flexibleLayouts.maintenance.addEntryFailed"));
			return;
		}
		newNote.value = "";
		newServices.value = [];
		const refreshed = await readMaintenanceLogWithIntegrity();
		log.value = refreshed.log;
		logIntegrity.value = refreshed.integrity;
		// A service moves every rule's baseline, and the machine-side macro has each due value baked
		// in - regenerate it so an action fires at the NEW due point, not the old one.
		await rulesState.resync();
	} finally {
		logging.value = false;
	}
}

// --- Pause/resume tracking -------------------------------------------------------------------------------

/** Rewrites the whole persisted-state file with every currently-known total unchanged and just the
 *  enabled flag flipped - seedMaintenanceState always rewrites the full file (there's no smaller
 *  "patch one field" primitive), so every other counter has to be resupplied from its live OM value
 *  or pausing would silently reset it back to 0. */
async function onToggleTracking(enabled: boolean): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	togglingTracking.value = true;
	try {
		const io = defaultMachineIO();
		const numOm = (path: string): number => {
			const v = resolveOmPath(machineStore.model, path);
			return typeof v === "number" ? v : 0;
		};
		// Same "preserve every live total" requirement as MaintenanceSetupDialog's re-run path - the
		// v8 arrays need re-supplying here too, or pausing/resuming would reset them to zero.
		const numArrOm = (path: string): Array<number> | undefined => {
			const v = resolveOmPath(machineStore.model, path);
			return Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n : 0)) : undefined;
		};
		// trackingEnabled itself is a computed off the live OM (global.flMaintEnabled), so no local
		// assignment on success is needed here - it reflects the new state as soon as
		// seedMaintenanceState's M98 reload lands, same as every other figure on this page.
		//
		// The three independent detail-tracking flags (v10) need the same "resupply the live value"
		// treatment as every counter above - omitting any of them here would silently reset it to
		// off-by-default every time the master switch is toggled.
		await seedMaintenanceState(io, numOm("global.flMaintSpindleIndex"), numOm("global.flMaintSpindleSec"), {
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
		}, enabled, { axes: trackAxesEnabled.value, fans: trackFansEnabled.value, heaters: trackHeatersEnabled.value });
	} finally {
		togglingTracking.value = false;
	}
}

const TRACK_CATEGORY_TOGGLING: Record<"axes" | "fans" | "heaters", Ref<boolean>> = {
	axes: togglingTrackAxes, fans: togglingTrackFans, heaters: togglingTrackHeaters,
};

/** Same rewrite-the-whole-file mechanics as onToggleTracking, flipping just ONE of the three
 *  independent detail-tracking flags (v10) - one parameterized function rather than three near-
 *  identical ones, since the only thing that differs between them is which single flag changes and
 *  which "in progress" ref to show a spinner against. */
async function onToggleTrackCategory(category: "axes" | "fans" | "heaters", enabled: boolean): Promise<void> {
	if (!can("editConfig") && !(await requestAdmin())) { return; }
	const toggling = TRACK_CATEGORY_TOGGLING[category];
	toggling.value = true;
	try {
		const io = defaultMachineIO();
		const numOm = (path: string): number => {
			const v = resolveOmPath(machineStore.model, path);
			return typeof v === "number" ? v : 0;
		};
		const numArrOm = (path: string): Array<number> | undefined => {
			const v = resolveOmPath(machineStore.model, path);
			return Array.isArray(v) ? v.map((n) => (typeof n === "number" ? n : 0)) : undefined;
		};
		const tracking = { axes: trackAxesEnabled.value, fans: trackFansEnabled.value, heaters: trackHeatersEnabled.value };
		tracking[category] = enabled;
		await seedMaintenanceState(io, numOm("global.flMaintSpindleIndex"), numOm("global.flMaintSpindleSec"), {
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
		}, trackingEnabled.value, tracking);
	} finally {
		toggling.value = false;
	}
}

// --- Item E: CSV export --------------------------------------------------------------------------

function onExportCsv(): void {
	downloadBlob("flexible-layouts-maintenance-log.csv", new Blob([maintenanceLogToCsv(log.value)], { type: "text/csv" }), "text/csv");
}

// --- Display helpers -----------------------------------------------------------------------------------

const sortedEntries = computed(() => [...log.value.entries].sort((a, b) => b.loggedAt - a.loggedAt));

function formatWhen(loggedAt: number): string {
	try { return new Date(loggedAt).toLocaleString(); } catch { return String(loggedAt); }
}

// --- Item D: per-counter "since" badges -----------------------------------------------------------

// Live value / title / unit formatting for every counter kind (fixed, per-axis/fan/heater, user) live in
// model/maintenance/counters.ts. secondsSince() is just `max(0, live - baseline)` with null-propagation,
// generic despite the name.
function counterLabel(counter: MaintenanceCounterKey): string {
	return counterTitle(counter, machineStore.model, (k, p) => i18n.global.t(k, p ?? {}) as string, rulesState.doc.customCounters);
}

interface ServiceBadge { label: string; display: string }

/** One badge per counter this entry is still the newest servicer of. An entry with explicit
 *  `services` shows one labelled badge per named counter; an entry with none (the pre-Item-D shape)
 *  keeps the original single unlabelled badge, scoped by category and whichever counter this
 *  machine's mode actually accumulates - unchanged behaviour for every log written before this. */
function sinceEntryBadges(entry: MaintenanceEntry): Array<ServiceBadge> {
	if (entry.services && entry.services.length > 0) {
		const badges: Array<ServiceBadge> = [];
		for (const counter of entry.services) {
			if (mostRecentEntryForCounter(log.value, counter)?.id !== entry.id) { continue; }
			const delta = secondsSince(liveCounterValue(machineStore.model, counter), baselineForCounter(entry, counter));
			if (delta == null) { continue; }
			badges.push({ label: counterLabel(counter), display: formatCounterAmount(counter, delta) });
		}
		return badges;
	}
	if (mostRecentEntry(log.value, entry.category)?.id !== entry.id) { return []; } // only the newest entry per category shows this
	const seconds = isFff.value
		? secondsSince(livePrintSeconds.value, entry.printSecondsAtEntry ?? null)
		: secondsSince(liveSpindleSeconds.value, entry.spindleSecondsAtEntry);
	return seconds != null ? [{ label: "", display: i18n.global.t("plugins.flexibleLayouts.maintenance.sinceLastService", { hours: (seconds / 3600).toFixed(1) }) }] : [];
}
</script>

<style scoped>
.mnt-detail-group { margin-bottom: 12px; }
.mnt-detail-group:last-child { margin-bottom: 0; }
.mnt-detail-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 0.85em; }

/* Item G: plain CSS bars (see the template comment on why not ChartWidget) - a fixed-height row of
   flex columns, each bar's height set inline as a percentage of the busiest day in the window. */
.mnt-trend-bars { display: flex; align-items: flex-end; gap: 2px; height: 60px; }
.mnt-trend-bar-col { flex: 1 1 0; height: 100%; display: flex; align-items: flex-end; min-width: 2px; }
.mnt-trend-bar { width: 100%; background: rgb(var(--v-theme-primary)); border-radius: 2px 2px 0 0; min-height: 2px; }

.mnt-outcome-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: rgba(127, 127, 127, 0.2); }
.mnt-outcome-finished { background: rgb(var(--v-theme-success)); }
.mnt-outcome-cancelled { background: rgb(var(--v-theme-error)); }

.mnt-detail-switch { flex: none; margin: 0; padding: 0; }
.mnt-detail-switch :deep(.v-selection-control) { min-height: 0; }
</style>
