<template>
	<div class="fuw-root fill-height d-flex flex-column px-2 py-1">
		<span v-if="widget.label" class="fuw-label text-truncate flex-shrink-0">{{ widget.label }}</span>

		<div v-if="!main" class="text-caption text-medium-emphasis pa-2">
			{{ $t("plugins.flexibleLayouts.firmwareUpdate.noBoard") }}
		</div>
		<template v-else>
			<div class="fuw-board text-caption flex-shrink-0">
				<div><strong>{{ main.shortName || main.name }}</strong> — {{ $t("plugins.flexibleLayouts.firmwareUpdate.running", { version: main.firmwareVersion || "—" }) }}</div>
				<div class="text-medium-emphasis">{{ $t("plugins.flexibleLayouts.firmwareUpdate.flashesFrom", { file: main.firmwareFileName || "—" }) }}</div>
			</div>

			<div v-if="isSbc" class="fuw-warn text-caption flex-shrink-0 mt-1">
				{{ $t("plugins.flexibleLayouts.firmwareUpdate.sbcNotice") }}
			</div>
			<div v-else-if="machineBusy" class="fuw-warn text-caption flex-shrink-0 mt-1">
				{{ $t("plugins.flexibleLayouts.firmwareUpdate.busyNotice", { status: machineStatus }) }}
			</div>

			<template v-else>
				<v-alert v-if="availableUpdate" type="info" density="compact" variant="tonal" closable
						 class="mt-1 flex-shrink-0" @click:close="dismissAvailableUpdate">
					{{ $t("plugins.flexibleLayouts.firmwareUpdate.updateAvailable", { version: availableUpdate.tag, running: main.firmwareVersion }) }}
					<template #append>
						<v-btn size="x-small" variant="tonal" @click="viewAvailableUpdate">
							{{ $t("plugins.flexibleLayouts.firmwareUpdate.viewUpdate") }}
						</v-btn>
					</template>
				</v-alert>

				<div class="d-flex ga-1 align-center flex-shrink-0 mt-1 flex-wrap">
					<v-select v-model="sourceId" :items="sourceItems" density="compact" variant="outlined" hide-details
							  class="fuw-source" :label="$t('plugins.flexibleLayouts.firmwareUpdate.source')" @update:model-value="onSourceChanged" />
					<v-btn size="small" :loading="listing" @click="loadReleases">
						{{ releases.length ? $t("plugins.flexibleLayouts.firmwareUpdate.refresh") : $t("plugins.flexibleLayouts.firmwareUpdate.list") }}
					</v-btn>
					<v-checkbox v-model="includePrereleases" density="compact" hide-details
								:label="$t('plugins.flexibleLayouts.firmwareUpdate.includeBetas')" @update:model-value="onChannelChanged" />
				</div>

				<div v-if="listError" class="fuw-error text-caption mt-1 flex-shrink-0">{{ listError }}</div>

				<div class="fuw-releases flex-grow-1 mt-1">
					<div v-for="r in offeredReleases" :key="r.tag" class="fuw-release-row"
						 :class="{ 'fuw-release-selected': selectedRelease?.tag === r.tag }">
						<div class="fuw-release-main">
							<strong>{{ r.tag }}</strong>
							<span v-if="r.prerelease" class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.firmwareUpdate.prerelease") }}</span>
							<a v-if="r.htmlUrl" :href="r.htmlUrl" target="_blank" rel="noreferrer" class="text-caption">{{ $t("plugins.flexibleLayouts.firmwareUpdate.notes") }}</a>
						</div>
						<v-btn size="x-small" variant="tonal" :loading="selectedRelease?.tag === r.tag && findingFiles" @click="selectRelease(r)">
							{{ $t("plugins.flexibleLayouts.firmwareUpdate.select") }}
						</v-btn>
					</div>
					<div v-if="!offeredReleases.length && !listing" class="text-caption text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.firmwareUpdate.noneListed") }}
					</div>
				</div>

				<!-- Direct source (gloomyandy): matching files fetched automatically, ready to send. -->
				<template v-if="selectedRelease && activeSource?.id === 'gloomyandy'">
					<div v-if="findError" class="fuw-error text-caption mt-1 flex-shrink-0">{{ findError }}</div>
					<div v-else-if="matchedFiles.length" class="fuw-match text-caption mt-1 flex-shrink-0">
						{{ $t("plugins.flexibleLayouts.firmwareUpdate.foundFiles", { files: matchedFiles.map((f) => f.name).join(", ") }) }}
					</div>
					<v-btn v-if="matchedFiles.length" block class="mt-1 flex-shrink-0" color="warning" :loading="uploading"
						   @click="downloadAndUpload(matchedFiles)">
						{{ $t("plugins.flexibleLayouts.firmwareUpdate.fetchAndPrepare") }}
					</v-btn>
				</template>

				<!-- Duet3D: release assets aren't directly downloadable by browser JS (CORS) - open the
					 asset link for a normal download, then hand the downloaded file(s) back in. -->
				<template v-else-if="selectedRelease && activeSource?.id === 'duet3d'">
					<div v-if="findError" class="fuw-error text-caption mt-1 flex-shrink-0">{{ findError }}</div>
					<template v-else-if="suggestedAsset">
						<v-btn block variant="tonal" class="mt-1 flex-shrink-0" :href="suggestedAsset.url" target="_blank" rel="noreferrer"
							   prepend-icon="mdi-download">
							{{ $t("plugins.flexibleLayouts.firmwareUpdate.downloadAsset", { name: suggestedAsset.name }) }}
						</v-btn>
						<div class="text-caption text-medium-emphasis mt-1">{{ $t("plugins.flexibleLayouts.firmwareUpdate.manualStepHelp") }}</div>
						<v-file-input v-model="pickedFiles" density="compact" variant="outlined" hide-details multiple
									  class="mt-1" :label="$t('plugins.flexibleLayouts.firmwareUpdate.pickFiles')" />
						<v-btn v-if="pickedFilesArray.length" block class="mt-1 flex-shrink-0" color="warning" :loading="uploading"
							   @click="uploadPicked">
							{{ $t("plugins.flexibleLayouts.firmwareUpdate.prepare") }}
						</v-btn>
					</template>
				</template>
			</template>
		</template>

		<!-- DWC's own firmware dialogs (from DuetWebControl/components, DWC's externalised public
			 component palette - see the script section's doc comment). -->
		<FirmwareUpdateDialog v-model:shown="controller.firmwareDialog.shown" :plan="controller.firmwareDialog.plan"
							   @confirmed="controller.onFirmwareUpdateConfirmed" @cancelled="controller.onFirmwareUpdateCancelled" />
		<ConfigUpdatedDialog v-model:shown="controller.configUpdatedDialog.shown" />
	</div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from "vue";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import type { Widget } from "../model/document";
import { duet3dSource } from "../model/firmware/duet3dSource";
import { gloomyandySource } from "../model/firmware/gloomyandySource";
import { matchAllBoardFiles, matchesBoardFile, type FirmwareCandidateFile, type FirmwareRelease, type FirmwareSource } from "../model/firmware/sources";
import { evaluateFirmwareUpdate } from "../model/firmware/updateNotify";
import { resolveOmPath } from "../util/omPath";
import { WIDGET_PATCH_KEY } from "../util/widgetPatch";

// Static imports, deliberately NOT dynamic import(): Rollup's `external` marking (build-plugin.js's
// PLUGIN_GLOBALS/the @/composables regex) only rewrites STATIC import bindings to `window.DWC.*`
// references - a dynamic `import("@/composables/...")` call is left in the output bundle verbatim as
// a real, unrewritten specifier string, which the browser then tries to resolve natively and fails
// ("Failed to resolve module specifier") - confirmed by inspecting the actual built bundle, not just
// theorised. Static imports of both these paths ARE correctly externalised at build time, and
// dwc-plugin-test-kit's stub map covers both for `npm test` (as of v0.2.5/v0.2.6), so there's no
// remaining reason to defer either import.
import { ConfigUpdatedDialog, FirmwareUpdateDialog } from "DuetWebControl/components";
import { useFirmwareInstallController } from "@/composables/useFirmwareInstallController";

type SourceId = "duet3d" | "gloomyandy36" | "gloomyandy37";

const props = defineProps<{ widget: Extract<Widget, { type: "firmwareUpdate" }> }>();
const machineStore = useMachineStore();
const uiStore = useUiStore();
const patch = inject(WIDGET_PATCH_KEY, null);

// Safe to create eagerly: the controller only sets up reactive dialog state here - it never touches
// the board until runFirmwareUpload() is actually called from a real operator action below.
const controller = useFirmwareInstallController();

// Firmware must never be touched while the machine is doing anything else - conservative on
// purpose (better to refuse a legitimate update than let one race a running job).
const FIRMWARE_BUSY_STATUSES = new Set([
	"starting", "updating", "processing", "simulating", "pausing", "paused",
	"resuming", "cancelling", "busy", "changingTool", "halted",
]);

interface RawBoard {
	canAddress?: number | null; shortName?: string; name?: string; firmwareVersion?: string;
	firmwareFileName?: string; iapFileNameSD?: string | null; firmwareName?: string;
}

const boards = computed<Array<RawBoard>>(() => {
	const arr = resolveOmPath(machineStore.model, "boards");
	return Array.isArray(arr) ? (arr as Array<RawBoard | null>).filter((b): b is RawBoard => !!b) : [];
});
const main = computed<RawBoard | null>(() => boards.value.find((b) => b.canAddress === 0) ?? boards.value[0] ?? null);
const isSbc = computed(() => resolveOmPath(machineStore.model, "sbc") !== null);
const machineStatus = computed<string>(() => {
	const s = resolveOmPath(machineStore.model, "state.status");
	return typeof s === "string" ? s : "";
});
const machineBusy = computed(() => FIRMWARE_BUSY_STATUSES.has(machineStatus.value));

// Auto-detect the source from the board's own reported firmware name (established this session:
// gloomyandy's STM32 port reports "STM32" in firmwareName, unlike a genuine Duet3 board) and, for an
// STM32 board, its running version's major.minor (a 3.7.x report picks the 3.7-dev branch, anything
// else defaults to 3.6-dev) - getting the branch right matters more now that the auto-check below
// drives an unattended notification, not just a manual-browse default. A manual override is always
// available - a genuine board owner testing a fork build, or vice versa, should never be blocked
// from picking the other source themselves.
function detectedSourceId(): SourceId {
	const name = main.value?.firmwareName ?? "";
	if (!/stm32/i.test(name)) { return "duet3d"; }
	const m = (main.value?.firmwareVersion ?? "").match(/^(\d+)\.(\d+)/);
	return (m && Number(m[1]) === 3 && Number(m[2]) >= 7) ? "gloomyandy37" : "gloomyandy36";
}
function sourceForId(id: SourceId): FirmwareSource {
	if (id === "gloomyandy36") { return gloomyandySource("v3.6-dev"); }
	if (id === "gloomyandy37") { return gloomyandySource("v3.7-dev"); }
	return duet3dSource;
}
const sourceId = ref<SourceId>(props.widget.sourceId ?? detectedSourceId());
const sourceItems = [
	{ title: "Duet3D (official)", value: "duet3d" },
	{ title: "gloomyandy fork (RRF 3.6)", value: "gloomyandy36" },
	{ title: "gloomyandy fork (RRF 3.7)", value: "gloomyandy37" },
];
const activeSource = computed<FirmwareSource>(() => sourceForId(sourceId.value));

const releases = ref<Array<FirmwareRelease>>([]);
const listing = ref(false);
const listError = ref("");
const includePrereleases = ref(props.widget.includePrereleases ?? false);
const offeredReleases = computed(() => releases.value.filter((r) => includePrereleases.value || !r.prerelease).slice(0, 15));

function onSourceChanged(): void {
	patch?.({ sourceId: sourceId.value });
	releases.value = [];
	selectedRelease.value = null;
	matchedFiles.value = [];
	suggestedAsset.value = null;
}

function onChannelChanged(): void {
	patch?.({ includePrereleases: includePrereleases.value });
	void loadReleases();
}

async function loadReleases(): Promise<void> {
	listing.value = true;
	listError.value = "";
	try {
		releases.value = await activeSource.value.listReleases();
	} catch (e) {
		listError.value = (e as Error)?.message ?? String(e);
	} finally {
		listing.value = false;
	}
}

const selectedRelease = ref<FirmwareRelease | null>(null);
const findingFiles = ref(false);
const findError = ref("");
const matchedFiles = ref<Array<FirmwareCandidateFile>>([]);
const suggestedAsset = ref<FirmwareCandidateFile | null>(null);

async function selectRelease(release: FirmwareRelease): Promise<void> {
	selectedRelease.value = release;
	matchedFiles.value = [];
	suggestedAsset.value = null;
	findError.value = "";
	const board = main.value;
	if (!board?.firmwareFileName) {
		findError.value = uiT("noFirmwareFileName");
		return;
	}
	findingFiles.value = true;
	try {
		const files = await activeSource.value.listFiles(release);

		if (activeSource.value.id === "gloomyandy") {
			// gloomyandy's release tree has no combined bundle (unlike Duet3D's zip below), so every
			// configured board (main AND every CAN-connected expansion/toolboard) needs its own file
			// matched, not just the main one.
			const matched = matchAllBoardFiles(boards.value, files);
			if (!matched.some((f) => matchesBoardFile(board.firmwareFileName!, f.name))) {
				findError.value = uiT("notFound", { release: release.tag });
				return;
			}
			matchedFiles.value = matched;
		} else {
			// duet3d: prefer a loose asset matching the main image; fall back to a plausible combined
			// bundle so the operator has SOMETHING to download - DWC's own planFiles() sorts out what's
			// actually inside it once the file comes back in, the same as it would for a drag-and-drop.
			const looseMain = files.find((f) => matchesBoardFile(board.firmwareFileName!, f.name));
			suggestedAsset.value = looseMain
				?? files.find((f) => /firmware/i.test(f.name) && /\.zip$/i.test(f.name) && !/duetwebcontrol/i.test(f.name))
				?? null;
			if (!suggestedAsset.value) {
				findError.value = uiT("notFound", { release: release.tag });
			}
		}
	} catch (e) {
		findError.value = (e as Error)?.message ?? String(e);
	} finally {
		findingFiles.value = false;
	}
}

function uiT(key: string, args?: Record<string, unknown>): string {
	return i18n.global.t(`plugins.flexibleLayouts.firmwareUpdate.${key}`, args ?? {});
}

// --- Background "is a newer release available" notification ---------------------------------------
// Throttled (~24h) per source, so switching source doesn't inherit a stale "already checked" flag
// from a different one, and never crosses branches (a gloomyandy36-detected board is only ever
// compared against v3.6-dev releases, never offered a v3.7-dev tag as a routine "update") - that's a
// branch migration, not a patch update, and stays a manual-browse-only discovery.
const FIRMWARE_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LS_PREFIX = "flexibleLayouts.firmwareUpdateCheck.";
const availableUpdate = ref<{ sourceId: SourceId; tag: string; htmlUrl?: string } | null>(null);

function ls(): Storage | null {
	try { return window.localStorage; } catch { return null; }
}

async function checkForFirmwareUpdate(): Promise<void> {
	// Always targets detectedSourceId(), never whatever the manual browse dropdown currently has
	// selected - a manual override for interactive browsing must not silently drive the automatic
	// banner against a mismatched source.
	const detected = detectedSourceId();
	const version = main.value?.firmwareVersion;
	if (!version || isSbc.value || machineBusy.value) {
		return;
	}
	const store = ls();
	const lastCheckKey = `${LS_PREFIX}lastCheck.${detected}`;
	const last = Number(store?.getItem(lastCheckKey) || 0);
	if (Date.now() - last < FIRMWARE_UPDATE_CHECK_INTERVAL_MS) {
		return;
	}
	try {
		const offered = (await sourceForId(detected).listReleases())
			.filter((r) => includePrereleases.value || !r.prerelease);
		store?.setItem(lastCheckKey, String(Date.now()));
		const latest = offered[0] ?? null;
		const result = evaluateFirmwareUpdate({ runningFirmwareVersion: version, latestTag: latest?.tag ?? null });
		if (result.updateAvailable && latest) {
			const dismissed = store?.getItem(`${LS_PREFIX}dismissed.${detected}`);
			if (dismissed !== latest.tag) {
				availableUpdate.value = { sourceId: detected, tag: latest.tag, htmlUrl: latest.htmlUrl };
			}
		}
	} catch {
		// A background check failing (offline, rate-limited) must never surface as an error toast.
	}
}

function dismissAvailableUpdate(): void {
	if (availableUpdate.value) {
		ls()?.setItem(`${LS_PREFIX}dismissed.${availableUpdate.value.sourceId}`, availableUpdate.value.tag);
	}
	availableUpdate.value = null;
}

async function viewAvailableUpdate(): Promise<void> {
	const found = availableUpdate.value;
	if (!found) { return; }
	sourceId.value = found.sourceId;
	patch?.({ sourceId: found.sourceId });
	availableUpdate.value = null;
	await loadReleases();
	const release = releases.value.find((r) => r.tag === found.tag);
	if (release) {
		await selectRelease(release);
	}
}

onMounted(() => { void checkForFirmwareUpdate(); });

const uploading = ref(false);
async function downloadAndUpload(files: Array<FirmwareCandidateFile>): Promise<void> {
	uploading.value = true;
	try {
		const fetched = await Promise.all(files.map(async (f) => {
			const res = await fetch(f.url);
			if (!res.ok) { throw new Error(`Download of ${f.name} failed (${res.status})`); }
			const blob = await res.blob();
			return new File([blob], f.name, { type: "application/octet-stream" });
		}));
		await controller.runFirmwareUpload(fetched);
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, "Firmware", (e as Error)?.message ?? String(e));
	} finally {
		uploading.value = false;
	}
}

const pickedFiles = ref<Array<File> | File | null>(null);
// Vuetify's v-file-input model type is `File[] | File | null` regardless of the `multiple` prop.
const pickedFilesArray = computed<Array<File>>(() => {
	const v = pickedFiles.value;
	return v ? (Array.isArray(v) ? v : [v]) : [];
});
async function uploadPicked(): Promise<void> {
	const files = pickedFilesArray.value;
	if (!files.length) { return; }
	uploading.value = true;
	try {
		await controller.runFirmwareUpload(files);
	} catch (e) {
		uiStore.makeNotification(LogLevel.error, "Firmware", (e as Error)?.message ?? String(e));
	} finally {
		uploading.value = false;
	}
}
</script>

<style scoped>
.fuw-root { min-height: 0; }
.fuw-label { font-size: 0.8em; font-weight: 600; opacity: 0.85; }
.fuw-board { line-height: 1.4; }
.fuw-warn { color: rgb(var(--v-theme-warning)); }
.fuw-error { color: rgb(var(--v-theme-error)); }
.fuw-source { max-width: 220px; }
.fuw-releases { min-height: 0; overflow-y: auto; }
.fuw-release-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 4px; border-radius: 4px; }
.fuw-release-selected { background: rgba(var(--v-theme-primary), 0.08); }
.fuw-release-main { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.fuw-match { color: rgb(var(--v-theme-success)); }
</style>
