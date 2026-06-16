/**
 * Self-update for Flexible Layouts: on load (when FL is the active layout) check GitHub for a newer
 * release and, if one is compatible with the running DuetWebControl, let the user apply it in one
 * click. The heavy lifting (GitHub fetch, version compare, ZIP download + install) lives in the shared
 * dwc-plugin-runtime so every plugin can reuse it; this module is the thin FL wiring: throttling,
 * opt-out, the notification, and supplying DWC's installer.
 */
import { ref } from "vue";

import { announceUpdate, applyUpdate, checkForUpdate, clearAnnouncedUpdate, compareVersions, type UpdateResult } from "dwc-plugin-runtime";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

import { PLUGIN_MANIFEST_ID } from "./constants";

const OWNER = "jaysuk";
const REPO = "Flexible-Layouts";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // re-check at most once a day on load

const LS_ENABLED = "flexibleLayouts.updateCheck.enabled";
const LS_LAST = "flexibleLayouts.updateCheck.lastCheck";
const LS_DISMISSED = "flexibleLayouts.updateCheck.dismissed";
const LS_RESULT = "flexibleLayouts.updateCheck.lastResult";

export const updateState = ref<UpdateResult | null>(null);
export const checking = ref(false);
export const applying = ref(false);
/**
 * Set to true after a successful one-click update. Updating a running plugin leaves stale code
 * executing until the page reloads — DWC's own install wizard prompts the same way (it shows a
 * "reload to finish" message after hot-installing any plugin). The UI shows a reload prompt.
 */
export const pendingReload = ref(false);

const t = (key: string, named?: Record<string, unknown>) => i18n.global.t(`plugins.flexibleLayouts.updates.${key}`, named ?? {});

/**
 * Mirror the current result into the cross-plugin update hub, so the shell's aggregated popup can show
 * FL's update alongside any other plugin's. Announces a not-yet-dismissed available update; otherwise
 * clears FL's entry.
 */
function syncHub(): void {
	const s = updateState.value;
	if (s?.updateAvailable && dismissedVersion.value !== s.latestVersion) {
		announceUpdate(PLUGIN_MANIFEST_ID, i18n.global.t("plugins.flexibleLayouts.settings.caption"), s);
	} else {
		clearAnnouncedUpdate(PLUGIN_MANIFEST_ID);
	}
}

/** Whether on-load update checks are enabled (default on; users can opt out in settings). */
export function updateChecksEnabled(): boolean {
	return localStorage.getItem(LS_ENABLED) !== "false";
}
export function setUpdateChecksEnabled(on: boolean): void {
	localStorage.setItem(LS_ENABLED, on ? "true" : "false");
}

/** Last check result persisted across reloads, so a popup can be shown while the check is throttled. */
function cachedResult(): UpdateResult | null {
	try {
		const s = localStorage.getItem(LS_RESULT);
		return s ? (JSON.parse(s) as UpdateResult) : null;
	} catch {
		return null;
	}
}

/**
 * Re-evaluate a (cached) result against the version installed right now: the cache may have been
 * written before the user updated, so its `currentVersion`/`updateAvailable` can be stale. If the
 * installed version already meets the latest, the update is no longer available — clear the cache so
 * the popup doesn't reappear after a successful update.
 */
function revalidate(result: UpdateResult | null): UpdateResult | null {
	if (!result) {
		return null;
	}
	const cur = currentVersion();
	const stillNewer = !!result.latestVersion && compareVersions(result.latestVersion, cur) > 0;
	if (!stillNewer) {
		try { localStorage.removeItem(LS_RESULT); } catch { /* ignore */ }
		return { ...result, currentVersion: cur, updateAvailable: false, scenario: "upToDate" };
	}
	return { ...result, currentVersion: cur };
}

/** Installed plugin version, from the object model's plugins map (the authoritative source). */
function currentVersion(): string {
	const plugins = (useMachineStore().model as { plugins?: Map<string, { version?: string }> }).plugins;
	return plugins?.get(PLUGIN_MANIFEST_ID)?.version ?? "0.0.0";
}

/**
 * Run a check. Throttled to once per {@link CHECK_INTERVAL_MS} unless `force`d, and skipped entirely
 * when checks are disabled (unless forced). With `notify`, raises a one-off notification for a new
 * version the user hasn't already dismissed. Never throws.
 */
export async function runUpdateCheck(opts: { force?: boolean; notify?: boolean } = {}): Promise<UpdateResult | null> {
	if (!opts.force) {
		if (!updateChecksEnabled()) {
			return null;
		}
		const last = Number(localStorage.getItem(LS_LAST) || 0);
		if (Date.now() - last < CHECK_INTERVAL_MS) {
			// Throttled: don't hit the network, but rehydrate the last known result so a popup can still
			// be shown this page load (the in-memory state is empty after a reload). Re-validate it
			// against the version installed RIGHT NOW — after the user updates, the cached result still
			// names the old version, so recompute "available" instead of trusting the stale flag.
			if (!updateState.value) {
				updateState.value = revalidate(cachedResult());
			}
			syncHub();
			return updateState.value;
		}
	}

	checking.value = true;
	try {
		const result = await checkForUpdate({ owner: OWNER, repo: REPO, currentVersion: currentVersion() });
		updateState.value = result;
		localStorage.setItem(LS_LAST, String(Date.now()));
		try { localStorage.setItem(LS_RESULT, JSON.stringify(result)); } catch { /* storage full/disabled */ }
		if (opts.notify && result.updateAvailable && localStorage.getItem(LS_DISMISSED) !== result.latestVersion) {
			const message = result.scenario === "dwcUpdate"
				? t("notifyDwc", { version: result.latestVersion, dwc: result.requiredDwc })
				: t("notifyPlugin", { version: result.latestVersion });
			useUiStore().makeNotification(LogLevel.info, t("title"), message);
		}
		syncHub();
		return result;
	} finally {
		checking.value = false;
	}
}

/**
 * Version the user chose to skip (reactive mirror of localStorage so the settings alert hides
 * immediately). Suppresses both the load notification and the update alert until a newer release.
 */
export const dismissedVersion = ref<string | null>(safeGetDismissed());
function safeGetDismissed(): string | null {
	try { return localStorage.getItem(LS_DISMISSED); } catch { return null; }
}

/** Stop nagging about the currently-offered version (until the next, newer release). */
export function dismissCurrentUpdate(): void {
	if (updateState.value?.latestVersion) {
		localStorage.setItem(LS_DISMISSED, updateState.value.latestVersion);
		dismissedVersion.value = updateState.value.latestVersion;
		clearAnnouncedUpdate(PLUGIN_MANIFEST_ID); // drop FL from the aggregated popup
	}
}

/** Forget a skipped version (an explicit "Check now" means the user wants to see the offer again). */
export function undismissUpdate(): void {
	localStorage.removeItem(LS_DISMISSED);
	dismissedVersion.value = null;
}

/** Snapshot of the update-checker state for the diagnostics report (debugs "update didn't show"). */
export function updateDiagnostics(): Record<string, unknown> {
	const last = Number(localStorage.getItem(LS_LAST) || 0);
	const s = updateState.value;
	return {
		enabled: updateChecksEnabled(),
		lastCheck: last ? new Date(last).toISOString() : null,
		dismissedVersion: dismissedVersion.value,
		pendingReload: pendingReload.value,
		scenario: s?.scenario ?? null,
		currentVersion: s?.currentVersion ?? null,
		latestVersion: s?.latestVersion ?? null,
		requiredDwc: s?.requiredDwc ?? null,
		runningDwc: s?.runningDwc ?? null,
		error: s?.error ?? null,
	};
}

/**
 * Apply the offered update: download the release ZIP and install it through DWC, which hot-reloads
 * the new bundle. Requires a connected machine. On any failure (incl. a browser blocking the asset
 * download) falls back to opening the release page so the user can install manually.
 */
export async function applyUpdateNow(): Promise<void> {
	const result = updateState.value;
	const machine = useMachineStore();
	const ui = useUiStore();
	if (!result?.assetUrl || !result.assetName) {
		ui.makeNotification(LogLevel.warning, t("title"), t("applyFailed"));
		return;
	}

	applying.value = true;
	try {
		await applyUpdate({
			assetUrl: result.assetUrl,
			assetName: result.assetName,
			// DWC 3.7+ validates the manifest + compatibility, uploads the ZIP (reconstructing JSZip from
			// the blob if needed), and hot-loads the bundle. The signature is (filename, blob, start).
			installPlugin: (filename, blob, start) => machine.installPlugin(filename, blob, start),
		});
		pendingReload.value = true;
		ui.makeNotification(LogLevel.success, t("title"), t("installedReload", { version: result.latestVersion }));
	} catch (e) {
		console.warn("[FlexibleLayouts] update failed:", e);
		// One-click failed (likely CORS). Offer direct download link instead.
		ui.makeNotification(LogLevel.warning, t("title"), t("corsBlocked"));
		// Open the direct asset link so user can download manually
		window.location.href = result.assetUrl;
	} finally {
		applying.value = false;
	}
}
