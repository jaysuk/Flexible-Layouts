<template>
	<v-app>
		<v-app-bar :elevation="2" :color="appBarColor">
			<v-app-bar-nav-icon @click="drawer = !drawer" />

			<img v-if="headerLogo" :src="headerLogo" class="header-logo ms-2 me-2" alt="" />
			<div v-else class="text-truncate machine-name ms-2 me-2" :title="headerTitle || machineName">
				{{ headerTitle || machineName }}
			</div>

			<ConnectButton v-if="showConnectButton && mdAndUp" class="ms-2" />

			<!-- Quick profile switcher (only when more than one profile exists) -->
			<v-menu v-if="profiles.length > 1">
				<template #activator="{ props: menuProps }">
					<v-btn v-bind="menuProps" variant="tonal" rounded="md" size="small" class="ms-2"
						   prepend-icon="mdi-layers-triple" append-icon="mdi-menu-down">
						{{ activeProfileName }}
					</v-btn>
				</template>
				<v-list density="compact">
					<v-list-item v-for="p in profiles" :key="p.id" :title="p.name"
								 :prepend-icon="p.id === activeProfileId ? 'mdi-check' : ''"
								 @click="switchToProfile(p.id)" />
					<v-divider />
					<v-list-item prepend-icon="mdi-cog" :title="$t('plugins.flexibleLayouts.profiles.manage')"
								 @click="profilesOpen = true" />
				</v-list>
			</v-menu>

			<v-spacer />

			<CodeInput v-if="mdAndUp" class="flex-grow-0 flex-shrink-0 code-input mx-3" />

			<v-spacer />

			<!-- User-pinned mini widgets (temperatures, quick buttons, …) -->
			<HeaderWidgets v-if="mdAndUp" class="me-2" />

			<!-- On small screens the code box + pinned header widgets don't fit in the bar; surface them
				 in an overflow menu so they're still reachable (the maintainer's "top section disappears"
				 on mobile). -->
			<v-menu v-if="!mdAndUp" :close-on-content-click="false" location="bottom end">
				<template #activator="{ props: menuProps }">
					<v-btn v-bind="menuProps" icon="mdi-dots-vertical" variant="text" class="me-1"
						   :title="$t('plugins.flexibleLayouts.shell.more')" />
				</template>
				<v-card min-width="300" max-width="92vw" class="pa-3">
					<CodeInput class="mb-3" />
					<HeaderWidgets />
				</v-card>
			</v-menu>

			<!-- Edit-mode toggle: the heart of the custom shell. Present only here, so the built-in
				 layout is never affected -->
			<v-btn :prepend-icon="editMode ? 'mdi-check' : (editLocked ? 'mdi-lock' : 'mdi-pencil-ruler')"
				   :color="editMode ? 'primary' : undefined"
				   :variant="editMode ? 'flat' : 'tonal'" rounded="md" class="me-2"
				   @click="attemptToggleEdit">
				{{ editMode ? $t("plugins.flexibleLayouts.shell.done") : $t("plugins.flexibleLayouts.shell.edit") }}
			</v-btn>

			<UploadButton v-if="lgAndUp" class="me-2" />

			<EmergencyButton v-if="settingsStore.showEmergencyStop" class="me-2" />
		</v-app-bar>

		<v-navigation-drawer v-model="drawer" :temporary="!mdAndUp">
			<v-list nav density="compact">
				<template v-for="group in navGroups" :key="group.category.key">
					<v-list-subheader>{{ $t(group.category.captionKey) }}</v-list-subheader>
					<v-list-item v-for="item in group.items" :key="item.path"
								 :to="item.path" :prepend-icon="item.icon" :title="resolveItemTitle(item)" />
				</template>
			</v-list>

			<template v-if="editMode" #append>
				<div class="pa-2 d-flex flex-column ga-2">
					<v-switch :model-value="!statusHidden" color="primary" density="compact" hide-details
							  :label="$t('plugins.flexibleLayouts.shell.showStatusBar')"
							  @update:model-value="setStatusHidden(!$event)" />
					<v-btn block color="primary" variant="tonal" size="small" prepend-icon="mdi-file-tree"
						   @click="pageManagerOpen = true">
						{{ $t("plugins.flexibleLayouts.pages.manage") }}
					</v-btn>
					<v-btn block variant="tonal" size="small" prepend-icon="mdi-palette"
						   @click="themeEditorOpen = true">
						{{ $t("plugins.flexibleLayouts.theme.title") }}
					</v-btn>
					<v-btn block variant="tonal" size="small" prepend-icon="mdi-share-variant"
						   @click="ioOpen = true">
						{{ $t("plugins.flexibleLayouts.io.title") }}
					</v-btn>
					<v-btn block variant="tonal" size="small" prepend-icon="mdi-layers-triple"
						   @click="profilesOpen = true">
						{{ $t("plugins.flexibleLayouts.profiles.title") }}
					</v-btn>
					<v-btn block variant="text" size="small" prepend-icon="mdi-help-circle"
						   @click="openHelp">
						{{ $t("plugins.flexibleLayouts.help.title") }}
					</v-btn>
				</div>
			</template>
		</v-navigation-drawer>

		<v-main>
			<!-- Editable, hideable status region. Defaults to the stock status panels (fallback);
				 turns into an editable grid the moment the user adds a widget to it. -->
			<template v-if="statusPanelVisible && !statusHidden">
				<ErrorBoundary>
					<FlexPage page-id="__status__" kind="custom" :fallback="StatusFallback" />
				</ErrorBoundary>
				<v-divider />
			</template>

			<!-- Edit-mode toolbar. On editable pages it explains the controls; on built-in DWC pages
				 (Console/Settings/Explorer/…) it makes clear they can't be customised. -->
			<v-sheet v-if="editMode" :color="isEditablePage ? 'primary' : 'warning'"
					 class="d-flex align-center ga-2 px-3 py-2" variant="flat"
					 :class="isEditablePage ? 'text-on-primary' : 'text-on-warning'">
				<v-icon size="small">{{ isEditablePage ? 'mdi-pencil-ruler' : 'mdi-lock-outline' }}</v-icon>
				<span class="text-body-small flex-grow-1">{{
					isEditablePage
						? $t('plugins.flexibleLayouts.shell.editBanner')
						: $t('plugins.flexibleLayouts.shell.notEditable')
				}}</span>
				<v-btn v-if="!mdAndUp" size="small" variant="tonal" prepend-icon="mdi-file-tree"
					   @click="pageManagerOpen = true">
					{{ $t("plugins.flexibleLayouts.pages.manage") }}
				</v-btn>
				<v-btn v-if="!mdAndUp" size="small" variant="tonal" icon="mdi-palette"
					   :title="$t('plugins.flexibleLayouts.theme.title')" @click="themeEditorOpen = true" />
				<v-btn v-if="!mdAndUp" size="small" variant="tonal" icon="mdi-share-variant"
					   :title="$t('plugins.flexibleLayouts.io.title')" @click="ioOpen = true" />
			</v-sheet>

			<!-- Render pages through DWC's own DwcRouterView so native pages (Explorer, etc.) cache
				 via meta.keepAlive exactly as they do in the stock shell. A single error boundary wraps
				 the lot and clears on navigation (reset-key), recovering from any page-level crash. -->
			<v-container fluid class="pa-0 pa-md-4">
				<ErrorBoundary :reset-key="currentPath">
					<DwcRouterView />
				</ErrorBoundary>
			</v-container>
		</v-main>

		<PageManager v-model="pageManagerOpen" @open-import="ioOpen = true" />
		<ThemeEditor v-model="themeEditorOpen" />
		<ImportExportDialog v-model="ioOpen" />
		<ProfilesDialog v-model="profilesOpen" />
		<HelpDialog v-model="helpOpen" :first-run="helpFirstRun" />
		<PasswordDialog />

		<!-- SD-card restore offer: shown when the live layout is empty but a backup exists on the card. -->
		<v-dialog v-model="restoreOpen" max-width="460" persistent>
			<v-card>
				<v-card-title class="d-flex align-center">
					<v-icon class="me-2" color="primary">mdi-sd</v-icon>
					{{ $t("plugins.flexibleLayouts.sdBackup.restoreTitle") }}
				</v-card-title>
				<v-card-text>
					<p class="mb-2">{{ $t("plugins.flexibleLayouts.sdBackup.restoreBody") }}</p>
					<div class="text-caption text-medium-emphasis">
						{{ $t("plugins.flexibleLayouts.sdBackup.restoreMeta", { date: restoreSavedAt, count: restoreProfileCount }) }}
					</div>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="declineRestore">{{ $t("plugins.flexibleLayouts.sdBackup.restoreDecline") }}</v-btn>
					<v-btn color="primary" variant="flat" @click="confirmRestore">{{ $t("plugins.flexibleLayouts.sdBackup.restoreConfirm") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- New-version popup, shown on load when a newer release is available (and not skipped). -->
		<v-dialog v-model="updateOpen" max-width="460">
			<v-card v-if="updateState">
				<v-card-title class="d-flex align-center">
					<v-icon class="me-2" color="primary">mdi-rocket-launch</v-icon>
					{{ $t("plugins.flexibleLayouts.updates.title") }}
				</v-card-title>
				<v-card-text>
					<div class="font-weight-medium mb-1">{{ $t("plugins.flexibleLayouts.updates.available", { version: updateState.latestVersion }) }}</div>
					<div class="text-caption text-medium-emphasis">{{ $t("plugins.flexibleLayouts.updates.installedNow", { version: updateState.currentVersion }) }}</div>
					<div v-if="updateState.scenario === 'dwcUpdate'" class="text-caption text-warning mt-1">
						{{ $t("plugins.flexibleLayouts.updates.needsDwc", { dwc: updateState.requiredDwc, running: updateState.runningDwc }) }}
					</div>
				</v-card-text>
				<v-card-actions class="flex-wrap">
					<v-btn variant="text" size="small" @click="skipUpdate">{{ $t("plugins.flexibleLayouts.updates.skipVersion") }}</v-btn>
					<v-spacer />
					<v-btn variant="text" @click="viewUpdateNotes">{{ $t("plugins.flexibleLayouts.updates.viewOnGithub") }}</v-btn>
					<v-btn variant="text" @click="updateOpen = false">{{ $t("plugins.flexibleLayouts.updates.close") }}</v-btn>
					<v-btn v-if="updateState.scenario === 'pluginUpdate'" color="primary" variant="flat"
						   :loading="applying" :disabled="!machineStore.isConnected" @click="updateNow">
						{{ $t("plugins.flexibleLayouts.updates.updateNow") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-app>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import Events from "@/utils/events";
import i18n from "@/i18n";
import { type MenuItem, useMenuStore } from "@/stores/menu";
import { useCacheStore } from "@/stores/cache";
import { useMachineStore } from "@/stores/machine";
import { useSettingsStore } from "@/stores/settings";

import { useFlexDisplay } from "../composables/useFlexDisplay";
import { attemptToggleEdit, editMode, exitEditMode } from "../model/editorState";
import { applying, applyUpdateNow, dismissCurrentUpdate, dismissedVersion, pendingReload, runUpdateCheck, updateState } from "../model/updateCheck";
import { applyStartupRoute } from "../model/startup";
import { startChartSampler, stopChartSampler } from "../model/chartSampler";
import { applyBackup, checkForRestore, dismissRestore, type FlBackup, isAutoBackupEnabled, writeBackup } from "../model/sdBackup";
import { isPrintingStatus } from "../util/printLock";
import { isLocked } from "../model/lock";
import { applyNavOrder, isHidden } from "../model/pageManager";
import { getActiveProfileId, listProfiles, useLayoutStore } from "../model/store";
import { switchProfile } from "../model/profiles";
import { BUILTIN_PAGES } from "../model/builtinPages";
import { PLUGIN_MANIFEST_ID } from "../model/constants";
import { CUSTOM_PAGE_PREFIX } from "../model/pageManager";
import { evaluateRule } from "../util/conditions";
import FlexPage from "../page/FlexPage.vue";
import StatusFallback from "./StatusFallback.vue";
import HeaderWidgets from "./HeaderWidgets.vue";
import ErrorBoundary from "./ErrorBoundary.vue";
import PageManager from "../editor/PageManager.vue";
import ThemeEditor from "../editor/ThemeEditor.vue";
import ImportExportDialog from "../editor/ImportExportDialog.vue";
import ProfilesDialog from "../editor/ProfilesDialog.vue";
import HelpDialog from "../editor/HelpDialog.vue";
import PasswordDialog from "../editor/PasswordDialog.vue";

const machineStore = useMachineStore();
const menuStore = useMenuStore();
const settingsStore = useSettingsStore();

const router = useRouter();

// Editable = a user custom page, or one of the overridden built-in pages. The override paths can be
// parameterised (e.g. Jobs `/Jobs/:volume?/:path(.*)?`), which never equal the resolved URL, so match
// against the matched route record's pattern path rather than the live path string.
const builtinEditablePaths = new Set(BUILTIN_PAGES.flatMap((d) => d.paths));
const currentPath = computed(() => router.currentRoute.value.path);
const isEditablePage = computed(() => {
	const route = router.currentRoute.value;
	if (route.path.startsWith(CUSTOM_PAGE_PREFIX) || builtinEditablePaths.has(route.path)) {
		return true;
	}
	return route.matched.some((m) => builtinEditablePaths.has(m.path));
});

// Whether the Edit button should show a lock (lock enabled and not yet unlocked this session).
const editLocked = computed(() => isLocked());

// Route of DWC's plugin-management page, where the plugin could be stopped/uninstalled.
const PLUGINS_PATH = "/Plugins";

const { mdAndUp, lgAndUp } = useFlexDisplay();

// Mirror the built-in shell: the manual connect button only matters in the dev server (production
// auto-connects), so gate it on DEV like static.vue does.
const showConnectButton = import.meta.env.DEV;

const pageManagerOpen = ref(false);
const themeEditorOpen = ref(false);
const ioOpen = ref(false);
const profilesOpen = ref(false);
const helpOpen = ref(false);
const helpFirstRun = ref(false);
const cacheStore = useCacheStore();

function openHelp() {
	helpFirstRun.value = false;
	helpOpen.value = true;
}

// Block navigation to the Plugins page while locked, so a casual user can't reach the Stop button.
// (Bypassable via dev tools / direct API like the rest of the soft lock - see model/lock.ts.)
let removePluginsGuard: (() => void) | null = null;

// Tear the Plugins-page guard down. Driven both by component unmount (the normal path) and by the
// shared event bus on plugin stop, so the guard never outlives the plugin even if the two fire in
// an unexpected order.
function dropPluginsGuard(): void {
	removePluginsGuard?.();
	removePluginsGuard = null;
}
function onPluginUnloaded(id: string): void {
	if (id === PLUGIN_MANIFEST_ID) {
		dropPluginsGuard();
	}
}

// Show the welcome once per browser the first time the custom shell renders.
onMounted(() => {
	const seen = (cacheStore.plugins as Record<string, Record<string, unknown>>)?.flexibleLayouts?.seenWelcome;
	if (!seen) {
		helpFirstRun.value = true;
		helpOpen.value = true;
		cacheStore.setPluginData("flexibleLayouts", "seenWelcome", true);
	}

	removePluginsGuard = router.beforeEach((to) => {
		if (isLocked() && to.path === PLUGINS_PATH) {
			return { path: "/" };
		}
		return true;
	});
	Events.on("dwcPluginUnloaded", onPluginUnloaded);

	// Honour the layout's "open this page on startup" setting (once per page load).
	applyStartupRoute(router);

	// Collect chart data in the background so a chart shows history even before its page is opened.
	startChartSampler();

	// Things that need a live connection: the update check (installed version comes from the object
	// model) and the SD-card restore check (reads the backup file). Run once, when connected.
	if (machineStore.isConnected) {
		void onConnected();
	} else {
		stopConnWatch = watch(() => machineStore.isConnected, (connected) => {
			if (connected) {
				void onConnected();
				stopConnWatch?.();
			}
		});
	}
});

async function onConnected(): Promise<void> {
	// Offer to restore from the SD card if the live layout is empty but a backup exists (e.g. DWC
	// settings were wiped switching 3.6↔3.7). That's the more urgent prompt, so it wins if both apply.
	try {
		const backup = await checkForRestore();
		if (backup) {
			restoreBackup.value = backup;
			restoreOpen.value = true;
			return;
		}
	} catch { /* best-effort */ }

	// Surface a new release as a popup on load (was only a easily-missed toast before). The check is
	// throttled to once/day but rehydrates the last result, so the popup still shows on reloads.
	try {
		await runUpdateCheck();
		const s = updateState.value;
		if (s?.updateAvailable && dismissedVersion.value !== s.latestVersion && !pendingReload.value) {
			updateOpen.value = true;
		}
	} catch { /* best-effort */ }
}

// --- New-version popup ---
const updateOpen = ref(false);
async function updateNow(): Promise<void> {
	await applyUpdateNow();
	updateOpen.value = false;
}
function skipUpdate(): void {
	dismissCurrentUpdate();
	updateOpen.value = false;
}
function viewUpdateNotes(): void {
	if (updateState.value?.releaseUrl) {
		window.open(updateState.value.releaseUrl, "_blank", "noopener");
	}
}

// --- Jump to a chosen page when a print/job starts ---
// Mirrors DWC's own "switch to Job page on print start": isPrintingStatus treats the whole print
// session (incl. paused) as "printing" so the jump fires once at the real start, not again on resume.
const machineState = machineStore.model as { state?: { status?: string } };
let wasPrinting = isPrintingStatus(machineState.state?.status);
watch(() => machineState.state?.status, (now) => {
	const nowPrinting = isPrintingStatus(now);
	if (!wasPrinting && nowPrinting) {
		const path = layoutStore.document.value.jobStartPath;
		if (path && !editMode.value && router.currentRoute.value.path !== path && router.resolve(path).matched.length) {
			router.push(path).catch(() => { /* navigation guard rejections are fine */ });
		}
	}
	wasPrinting = nowPrinting;
});

// Persist the whole layout to the SD card whenever the user finishes editing (Done), so there's
// always an off-settings copy to recover from. Skipped for empty layouts / no-op changes inside.
watch(editMode, (now, was) => {
	if (was && !now && isAutoBackupEnabled()) {
		void writeBackup();
	}
});

// --- SD restore prompt ---
const restoreOpen = ref(false);
const restoreBackup = ref<FlBackup | null>(null);
const restoreSavedAt = computed(() =>
	restoreBackup.value?.savedAt ? new Date(restoreBackup.value.savedAt).toLocaleString() : "");
const restoreProfileCount = computed(() => Object.keys(restoreBackup.value?.profiles ?? {}).length);
function confirmRestore(): void {
	if (restoreBackup.value) {
		applyBackup(restoreBackup.value);
		router.push("/").catch(() => { /* already there */ });
	}
	restoreOpen.value = false;
}
function declineRestore(): void {
	if (restoreBackup.value) {
		dismissRestore(restoreBackup.value);
	}
	restoreOpen.value = false;
}

let stopConnWatch: (() => void) | undefined;
onUnmounted(() => stopConnWatch?.());

// Profile switcher (reactive via the Pinia-backed document; document identity flips on switch).
const profiles = computed(() => { void layoutStore.document.value; return listProfiles(); });
const activeProfileId = computed(() => { void layoutStore.document.value; return getActiveProfileId(); });
const activeProfileName = computed(() =>
	profiles.value.find((p) => p.id === activeProfileId.value)?.name ?? "");
function switchToProfile(id: string) {
	if (id !== activeProfileId.value) {
		switchProfile(id);
		router.push("/").catch(() => { /* already there */ });
	}
}

const layoutStore = useLayoutStore();
const statusHidden = computed(() => layoutStore.document.value.statusHidden === true);

// Header styling (per profile).
const appBarColor = computed(() => layoutStore.document.value.header?.color || "surface");
const headerTitle = computed(() => layoutStore.document.value.header?.title || "");
const headerLogo = computed(() => layoutStore.document.value.header?.logo || "");
function setStatusHidden(hidden: boolean) {
	layoutStore.document.value.statusHidden = hidden;
}

// Apply the user's persisted nav order, then drop plugin-hidden items. itemsByCategory already
// removes DWC's own globally-hidden items; isHidden additionally removes pages hidden via this
// plugin (document.nav.hidden), which the built-in layout never sees.
function pageVisible(path: string): boolean {
	const page = layoutStore.document.value.pages[path];
	return evaluateRule(machineStore.model, page?.showWhen);
}

function orderedItems(categoryKey: string): Array<MenuItem> {
	// While locked, hide the Plugins page from the nav too (it's where the plugin could be stopped).
	const hidePlugins = isLocked();
	const items = menuStore.itemsByCategory(categoryKey)
		.filter((i) => !isHidden(i.path) && pageVisible(i.path) && !(hidePlugins && i.path === PLUGINS_PATH));
	const byPath = new Map(items.map((i) => [i.path, i]));
	return applyNavOrder(items.map((i) => i.path)).map((p) => byPath.get(p)).filter(Boolean) as Array<MenuItem>;
}

// Categories that still have at least one visible item after plugin-hide filtering, so empty
// sections don't render a dangling subheader.
const navGroups = computed(() =>
	menuStore.visibleCategories
		.map((category) => ({ category, items: orderedItems(category.key) }))
		.filter((group) => group.items.length > 0));

const drawer = ref(true);
// Keep the drawer pinned open whenever we cross into desktop width; on smaller widths it
// collapses so the canvas gets the full viewport
watch(mdAndUp, (value) => { drawer.value = value; }, { immediate: true });

const machineName = computed(() => machineStore.model.network.name || "Duet Web Control");
const statusPanelVisible = computed(() => mdAndUp.value || settingsStore.showStatusPanel);

function resolveItemTitle(item: MenuItem): string {
	return item.translated ? item.caption : i18n.global.t(item.caption);
}

// Leaving the custom shell (user switched back to the built-in layout) must drop edit mode so
// the next activation starts clean
onUnmounted(() => {
	exitEditMode();
	stopChartSampler();
	Events.off("dwcPluginUnloaded", onPluginUnloaded);
	dropPluginsGuard();
});
</script>

<style scoped>
.machine-name {
	min-width: 0;
	max-width: 12rem;
	font-size: 1.1rem;
	font-weight: 500;
}
.header-logo {
	height: 40px;
	max-width: 180px;
	object-fit: contain;
}
@media (min-width: 600px) {
	.machine-name { max-width: 20rem; }
}
@media (min-width: 840px) {
	.machine-name { max-width: none; }
}

.code-input {
	width: 330px;
}
</style>
