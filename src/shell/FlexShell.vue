<template>
	<v-app>
		<v-app-bar :elevation="2" :color="appBarColor">
			<!-- Grouped so the floating "+" below can anchor to this block's own right edge, wherever
				 that ends up (it shifts with the logo/machine-name width and whether the connect button
				 and profile switcher are showing) - without becoming a flex sibling itself, so it never
				 takes layout space or pushes HeaderWidgets' canvas around when it appears/disappears. -->
			<div class="fl-app-bar-left">
				<v-app-bar-nav-icon @click="drawer = !drawer" />

				<img v-if="headerLogo" :src="headerLogo" class="header-logo ms-2 me-2" alt="" />
				<div v-else class="text-truncate machine-name ms-2 me-2" :title="headerTitle || machineName">
					{{ headerTitle || machineName }}
				</div>

				<ConnectButton v-if="showConnectButton && mdAndUp" class="ms-2" />

				<!-- Quick profile switcher (only when more than one profile exists). Switching layouts/managing
					 profiles is an editorial action, so it needs Admin just like the Edit button — otherwise a
					 restricted session could hop to a differently-configured profile from FL's own chrome. -->
				<v-menu v-if="profiles.length > 1 && canEditLayoutNow">
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

				<!-- Floats in front of the header canvas's left edge rather than taking its own flex space,
					 so entering/leaving edit mode never shifts or resizes any pinned header widget. -->
				<v-btn v-if="mdAndUp && editMode" icon="mdi-plus" size="x-small" variant="tonal" class="fl-header-add-btn"
					   :title="$t('plugins.flexibleLayouts.editor.addWidget')" @click="headerWidgetsRef?.openPalette()" />
			</div>

			<!-- Everything else in the top bar — the access-level chip, the code-input box, pinned
				 read-outs/buttons, the edit-mode toggle, and the upload button — is now an editable header
				 item (drag left/right to reposition, drag the right edge to resize its width; see
				 HeaderWidgets.vue), rather than fixed shell chrome. It fills the rest of the bar itself
				 (flex:1), so no spacer is needed here. A layout upgraded from an older version had
				 one of each seeded in (see DOC_MIGRATIONS v4/v5) so nothing was lost in the transition. The
				 e-stop and profile-switcher above stay hard-coded: the e-stop must always work regardless of
				 what a user does to the header (see model/access.ts's accessLockedFor), and the
				 profile-switcher's visibility depends on profile count, which the generic header-item system
				 doesn't model. -->
			<HeaderWidgets v-if="mdAndUp" ref="headerWidgetsRef" class="me-2" />

			<!-- Edit mode has exactly one entry point (see FlexPage.vue's comment), and on mobile the
				 pinned editModeToggle header widget is otherwise buried inside the "⋮" overflow below,
				 sized/shrunk along with whatever else is pinned there. That's an unrecoverable-feeling
				 dead end for anyone who doesn't dig for it, so mobile gets its own always-visible,
				 fixed-position Edit control here instead - the header item itself is hidden out of the
				 overflow menu (below) on mobile to avoid showing the same toggle twice. -->
			<v-btn v-if="!mdAndUp" :icon="editMode ? 'mdi-check' : (!canEditLayoutNow ? 'mdi-lock' : 'mdi-pencil-ruler')"
				   :color="editMode ? 'primary' : undefined" :variant="editMode ? 'flat' : 'text'" class="me-1"
				   :title="editMode ? $t('plugins.flexibleLayouts.shell.done') : $t('plugins.flexibleLayouts.shell.edit')"
				   @click="attemptToggleEdit" />

			<!-- On small screens the header items don't fit in the bar; surface them in an overflow menu
				 (the maintainer's "top section disappears" on mobile). -->
			<v-menu v-if="!mdAndUp" :close-on-content-click="false" location="bottom end">
				<template #activator="{ props: menuProps }">
					<v-btn v-bind="menuProps" icon="mdi-dots-vertical" variant="text" class="me-1"
						   :title="$t('plugins.flexibleLayouts.shell.more')" />
				</template>
				<v-card min-width="300" max-width="92vw" class="pa-3">
					<HeaderWidgets ref="headerWidgetsRef" :hide-types="['editModeToggle']" />
					<v-btn v-if="editMode" block variant="tonal" size="small" class="mt-2" prepend-icon="mdi-plus"
						   @click="headerWidgetsRef?.openPalette()">
						{{ $t("plugins.flexibleLayouts.editor.addWidget") }}
					</v-btn>
				</v-card>
			</v-menu>

			<EmergencyButton v-if="showEmergencyStopNow" class="me-2" />
		</v-app-bar>

		<v-navigation-drawer v-model="drawer" :temporary="!mdAndUp" :width="drawerWidth">
			<!-- Drag to resize - only while editing, matching HeaderWidgets.vue's own item-resize handles
				 (same pointer-capture idiom, see onDrawerResizePointerDown above). -->
			<div v-if="editMode" class="fl-drawer-resizer" @pointerdown="onDrawerResizePointerDown" />
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
					<FlexPage page-id="__status__" kind="custom" :fallback="StatusFallback" :seed="statusBarSeed" />
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
		<WhatsNewDialog v-model="whatsNewOpen" :entries="whatsNewEntries" />
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

		<!-- Aggregated new-version popup: one dialog listing every plugin (not just FL) with an update. -->
		<v-dialog v-model="updateOpen" max-width="480">
			<v-card>
				<v-card-title class="d-flex align-center">
					<v-icon class="me-2" color="primary">mdi-rocket-launch</v-icon>
					{{ updates.length > 1
						? $t("plugins.flexibleLayouts.updates.titleCount", { count: updates.length })
						: $t("plugins.flexibleLayouts.updates.title") }}
				</v-card-title>
				<v-card-text class="pt-0">
					<div v-for="u in updates" :key="u.pluginId" class="flex-upd-row">
						<div class="d-flex align-center ga-2">
							<v-icon size="small">mdi-puzzle</v-icon>
							<span class="font-weight-medium">{{ u.name }}</span>
							<v-spacer />
							<span class="text-caption text-medium-emphasis">{{ u.currentVersion }} → {{ u.latestVersion }}</span>
						</div>
						<div v-if="u.scenario === 'dwcUpdate'" class="text-caption text-warning">
							{{ $t("plugins.flexibleLayouts.updates.needsDwc", { dwc: u.requiredDwc, running: u.runningDwc }) }}
						</div>
						<div class="d-flex align-center ga-1 mt-1 flex-wrap">
							<v-btn size="x-small" variant="text" @click="skipRow(u)">{{ $t("plugins.flexibleLayouts.updates.skipVersion") }}</v-btn>
							<v-spacer />
							<v-btn v-if="u.releaseUrl" size="small" variant="text" @click="notesRow(u)">{{ $t("plugins.flexibleLayouts.updates.viewOnGithub") }}</v-btn>
							<v-btn v-if="u.scenario === 'pluginUpdate' && u.assetUrl" size="small" color="primary" variant="flat"
								   :loading="applyingId === u.pluginId" :disabled="!machineStore.isConnected || applyingId !== null"
								   @click="applyRow(u)">
								{{ $t("plugins.flexibleLayouts.updates.updateNow") }}
							</v-btn>
						</div>
						<v-divider class="mt-2" />
					</div>
				</v-card-text>
				<v-card-actions>
					<v-spacer />
					<v-btn variant="text" @click="closeUpdates">{{ $t("plugins.flexibleLayouts.updates.close") }}</v-btn>
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
import { LogLevel, useUiStore } from "@/stores/ui";

import { type AnnouncedUpdate, applyUpdate, claimUpdateHost, clearAnnouncedUpdate, getAnnouncedUpdates, subscribeToUpdates } from "dwc-plugin-runtime";

import { useFlexDisplay } from "../composables/useFlexDisplay";
import { attemptToggleEdit, editMode, exitEditMode } from "../model/editorState";
import { applyUpdateNow, currentVersion, dismissCurrentUpdate, dismissedVersion, pendingReload, runUpdateCheck, updateChecksEnabled } from "../model/updateCheck";
import { fetchWhatsNewHistory, getLastSeenVersion, markWhatsNewSeen, shouldShowWhatsNew } from "../model/whatsNew";
import { applyStartupRoute } from "../model/startup";
import { startChartSampler, stopChartSampler } from "../model/chartSampler";
import { applyBackup, checkForRestore, dismissRestore, type FlBackup, isAutoBackupEnabled, writeBackup, writeHistorySnapshot } from "../model/sdBackup";
import { isPrintingStatus } from "../util/printLock";
import { can, currentLevel, getAccess } from "../model/access";
import { applyNavOrder, isHidden } from "../model/pageManager";
import { getActiveProfileId, listProfiles, useLayoutStore } from "../model/store";
import { switchProfile } from "../model/profiles";
import { BUILTIN_PAGES, statusBarSeed } from "../model/builtinPages";
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
import WhatsNewDialog from "../editor/WhatsNewDialog.vue";
import PasswordDialog from "../editor/PasswordDialog.vue";

const machineStore = useMachineStore();
const menuStore = useMenuStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

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

// Still needed here: the profile-switcher menu gate (editLayout) and the e-stop's own visibility
// (independent of the header-items system - see the template comment above HeaderWidgets).
const canEditLayoutNow = computed(() => can("editLayout"));
const showEmergencyStopNow = computed(() =>
	settingsStore.showEmergencyStop && !(currentLevel() === "observer" && getAccess().hideEmergencyStop));

// Route of DWC's plugin-management page, where the plugin could be stopped/uninstalled.
const PLUGINS_PATH = "/Plugins";

const { mdAndUp } = useFlexDisplay();

// Mirror the built-in shell: the manual connect button only matters in the dev server (production
// auto-connects), so gate it on DEV like static.vue does.
const showConnectButton = import.meta.env.DEV;

const pageManagerOpen = ref(false);
const themeEditorOpen = ref(false);
const ioOpen = ref(false);
const profilesOpen = ref(false);
const helpOpen = ref(false);
const helpFirstRun = ref(false);
const whatsNewOpen = ref(false);
const whatsNewEntries = ref<Awaited<ReturnType<typeof fetchWhatsNewHistory>>>([]);
const cacheStore = useCacheStore();

function openHelp() {
	helpFirstRun.value = false;
	helpOpen.value = true;
}

// Block navigation to the Plugins page while restricted, so a casual user can't reach the Stop button.
// (Bypassable via dev tools / direct API like the rest of the soft lock - see model/access.ts.)
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
		if (!can("leaveLayout") && to.path === PLUGINS_PATH) {
			return { path: "/" };
		}
		return true;
	});
	Events.on("dwcPluginUnloaded", onPluginUnloaded);

	// Be the update-popup host: claim it (so other plugins suppress their own notifications), listen for
	// announcements, and show anything already announced before the shell mounted.
	releaseUpdateHost = claimUpdateHost();
	unsubscribeUpdates = subscribeToUpdates(refreshUpdates);
	refreshUpdates();

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

	// "What's new since you last looked": needs a live connection to know the real installed version
	// (currentVersion() reads it from the object model), so it's seeded/checked here, not in the
	// synchronous onMounted welcome block above. On the very first connection this browser has ever
	// made (lastSeenVersion never set - true first run, or an upgrade from a pre-feature FL build),
	// just seed the baseline silently: showing "everything since v0.0.0" would be a wall of noise, not
	// a useful summary. Every later connection compares against that baseline instead.
	try {
		const lastSeen = getLastSeenVersion();
		if (lastSeen === null) {
			markWhatsNewSeen(currentVersion());
		} else if (updateChecksEnabled() && shouldShowWhatsNew(currentVersion(), lastSeen)) {
			const entries = await fetchWhatsNewHistory(lastSeen);
			if (entries.length) {
				whatsNewEntries.value = entries;
				whatsNewOpen.value = true;
				markWhatsNewSeen(currentVersion());
				return;
			}
			// Empty result (offline/rate-limited/parse failure) - leave lastSeenVersion unadvanced so
			// this retries on the next connection instead of silently giving up on the notice.
		}
	} catch { /* best-effort */ }

	// Run FL's own check (announces into the shared hub via updateCheck.syncHub), then refresh the
	// aggregated list. The hub subscription keeps it live if other plugins announce later.
	try {
		await runUpdateCheck();
		refreshUpdates();
	} catch { /* best-effort */ }
}

// --- Aggregated new-version popup (cross-plugin update hub) ---
// FL's shell is the host: it lists FL's own update AND any other plugin that announced one, so users
// see a single popup instead of one per plugin.
const updateOpen = ref(false);
const updates = ref<Array<AnnouncedUpdate>>([]);
const applyingId = ref<string | null>(null);
let shownSignature = "";
let releaseUpdateHost: (() => void) | null = null;
let unsubscribeUpdates: (() => void) | null = null;
const SKIP_KEY = "flexibleLayouts.updateHub.skipped";

function hubSkipped(): Record<string, string> {
	try { return JSON.parse(localStorage.getItem(SKIP_KEY) || "{}") as Record<string, string>; } catch { return {}; }
}
function isSkipped(u: AnnouncedUpdate): boolean {
	// FL's own dismissal lives with the rest of FL's update state; other plugins use the hub-skip map.
	return u.pluginId === PLUGIN_MANIFEST_ID
		? dismissedVersion.value === u.latestVersion
		: hubSkipped()[u.pluginId] === u.latestVersion;
}

function refreshUpdates(): void {
	updates.value = getAnnouncedUpdates().filter((u) => !isSkipped(u));
	const sig = updates.value.map((u) => `${u.pluginId}@${u.latestVersion}`).sort().join(",");
	if (!updates.value.length) {
		updateOpen.value = false;
	} else if (sig !== shownSignature && !pendingReload.value) {
		// Auto-open only when the set changed since last shown, so closing it doesn't immediately reopen.
		updateOpen.value = true;
		shownSignature = sig;
	}
}
function closeUpdates(): void {
	updateOpen.value = false;
	shownSignature = updates.value.map((u) => `${u.pluginId}@${u.latestVersion}`).sort().join(",");
}
function notesRow(u: AnnouncedUpdate): void {
	if (u.releaseUrl) window.open(u.releaseUrl, "_blank", "noopener");
}
function skipRow(u: AnnouncedUpdate): void {
	if (u.pluginId === PLUGIN_MANIFEST_ID) {
		dismissCurrentUpdate(); // also clears FL from the hub
	} else {
		const map = hubSkipped();
		map[u.pluginId] = u.latestVersion ?? "";
		try { localStorage.setItem(SKIP_KEY, JSON.stringify(map)); } catch { /* ignore */ }
		clearAnnouncedUpdate(u.pluginId);
	}
	refreshUpdates();
}
async function applyRow(u: AnnouncedUpdate): Promise<void> {
	if (u.pluginId === PLUGIN_MANIFEST_ID) {
		// FL's own apply path keeps FL's reload prompt + diagnostics wiring.
		applyingId.value = u.pluginId;
		try { await applyUpdateNow(); } finally { applyingId.value = null; }
		clearAnnouncedUpdate(u.pluginId);
		refreshUpdates();
		return;
	}
	if (!u.assetUrl || !u.assetName) return;
	applyingId.value = u.pluginId;
	try {
		await applyUpdate({ assetUrl: u.assetUrl, assetName: u.assetName, installPlugin: (f, b, s) => machineStore.installPlugin(f, b, s) });
		uiStore.makeNotification(LogLevel.success, u.name, i18n.global.t("plugins.flexibleLayouts.updates.installedOther", { version: u.latestVersion }));
		clearAnnouncedUpdate(u.pluginId);
		refreshUpdates();
	} catch {
		// One-click usually fails on the GitHub asset CDN (CORS) — fall back to a direct download.
		window.location.href = u.assetUrl;
	} finally {
		applyingId.value = null;
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
//
// The same moment is the natural checkpoint for version history: an editing session is the unit a
// user would want to step back over, and snapshotting per-drag would both thrash the card and bury
// the useful snapshots under noise. writeHistorySnapshot() no-ops on an empty layout and prunes the
// ring itself, so this stays fire-and-forget.
watch(editMode, (now, was) => {
	if (was && !now && isAutoBackupEnabled()) {
		void writeBackup();
		void writeHistorySnapshot("edit-session");
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
	// While restricted, hide the Plugins page from the nav too (it's where the plugin could be stopped).
	const hidePlugins = !can("leaveLayout");
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

const headerWidgetsRef = ref<InstanceType<typeof HeaderWidgets> | null>(null);

const drawer = ref(true);
// Keep the drawer pinned open whenever we cross into desktop width; on smaller widths it
// collapses so the canvas gets the full viewport
watch(mdAndUp, (value) => { drawer.value = value; }, { immediate: true });

// --- Side panel (nav drawer) width, adjustable only in edit mode ------------------------------------
//
// Same drag-resize idiom as HeaderWidgets.vue's item resizer (pointer capture, window-level move/up
// listeners), but plain pixels rather than a percentage of a canvas - a nav drawer has no equivalent
// "canvas" to measure against. Persisted directly to localStorage (matching this file's own SKIP_KEY
// precedent below) rather than the layout document - it's a per-browser UI preference, not something
// that belongs in a shareable/exportable layout.
const DRAWER_WIDTH_KEY = "flexibleLayouts.drawerWidth";
const DRAWER_WIDTH_MIN = 220;
const DRAWER_WIDTH_MAX = 560;
const DRAWER_WIDTH_DEFAULT = 256; // Vuetify's own v-navigation-drawer default

function loadDrawerWidth(): number {
	try {
		const raw = Number(localStorage.getItem(DRAWER_WIDTH_KEY));
		if (Number.isFinite(raw) && raw >= DRAWER_WIDTH_MIN && raw <= DRAWER_WIDTH_MAX) { return raw; }
	} catch { /* ignore - falls through to the default */ }
	return DRAWER_WIDTH_DEFAULT;
}
const drawerWidth = ref(loadDrawerWidth());

interface DrawerResizeState { startX: number; origWidth: number }
let drawerResizeState: DrawerResizeState | null = null;

function onDrawerResizePointerDown(e: PointerEvent): void {
	if (!editMode.value) { return; }
	(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	drawerResizeState = { startX: e.clientX, origWidth: drawerWidth.value };
	window.addEventListener("pointermove", onDrawerResizeMove);
	window.addEventListener("pointerup", onDrawerResizeUp, { once: true });
	window.addEventListener("pointercancel", onDrawerResizeUp, { once: true });
}
function onDrawerResizeMove(e: PointerEvent): void {
	if (!drawerResizeState) { return; }
	const dx = e.clientX - drawerResizeState.startX;
	drawerWidth.value = Math.max(DRAWER_WIDTH_MIN, Math.min(DRAWER_WIDTH_MAX, drawerResizeState.origWidth + dx));
}
function onDrawerResizeUp(): void {
	drawerResizeState = null;
	window.removeEventListener("pointermove", onDrawerResizeMove);
	try { localStorage.setItem(DRAWER_WIDTH_KEY, String(drawerWidth.value)); } catch { /* ignore */ }
}

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
	releaseUpdateHost?.();
	unsubscribeUpdates?.();
	Events.off("dwcPluginUnloaded", onPluginUnloaded);
	dropPluginsGuard();
	onDrawerResizeUp();
});
</script>

<style scoped>
.fl-app-bar-left {
	position: relative;
	display: flex;
	align-items: center;
	flex: 0 0 auto;
}
.fl-header-add-btn {
	position: absolute;
	top: 50%;
	right: -32px;
	transform: translateY(-50%);
	z-index: 5;
}
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
.fl-drawer-resizer {
	position: absolute;
	top: 0;
	right: 0;
	width: 6px;
	height: 100%;
	cursor: ew-resize;
	z-index: 5;
}
.fl-drawer-resizer:hover {
	background: rgba(var(--v-theme-primary), 0.4);
}
</style>
