/**
 * Self-update for Flexible Layouts: on load (when FL is the active layout) check GitHub for a newer
 * release and, if one is compatible with the running DuetWebControl, let the user apply it in one
 * click. The heavy lifting (GitHub fetch, version compare, ZIP download + install) lives in the shared
 * dwc-plugin-runtime so every plugin can reuse it; this module is the thin FL wiring: throttling,
 * opt-out, the notification, and supplying DWC's installer.
 */
import { ref } from "vue";

import { applyUpdate, checkForUpdate, type UpdateResult } from "dwc-plugin-runtime";

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

export const updateState = ref<UpdateResult | null>(null);
export const checking = ref(false);
export const applying = ref(false);

const t = (key: string, named?: Record<string, unknown>) => i18n.global.t(`plugins.flexibleLayouts.updates.${key}`, named ?? {});

/** Whether on-load update checks are enabled (default on; users can opt out in settings). */
export function updateChecksEnabled(): boolean {
	return localStorage.getItem(LS_ENABLED) !== "false";
}
export function setUpdateChecksEnabled(on: boolean): void {
	localStorage.setItem(LS_ENABLED, on ? "true" : "false");
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
			return updateState.value;
		}
	}

	checking.value = true;
	try {
		const result = await checkForUpdate({ owner: OWNER, repo: REPO, currentVersion: currentVersion() });
		updateState.value = result;
		localStorage.setItem(LS_LAST, String(Date.now()));
		if (opts.notify && result.updateAvailable && localStorage.getItem(LS_DISMISSED) !== result.latestVersion) {
			const message = result.scenario === "dwcUpdate"
				? t("notifyDwc", { version: result.latestVersion, dwc: result.requiredDwc })
				: t("notifyPlugin", { version: result.latestVersion });
			useUiStore().makeNotification(LogLevel.info, t("title"), message);
		}
		return result;
	} finally {
		checking.value = false;
	}
}

/** Stop nagging about the currently-offered version (until the next, newer release). */
export function dismissCurrentUpdate(): void {
	if (updateState.value?.latestVersion) {
		localStorage.setItem(LS_DISMISSED, updateState.value.latestVersion);
	}
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
		if (result?.releaseUrl) {
			window.open(result.releaseUrl, "_blank", "noopener");
		}
		return;
	}

	applying.value = true;
	try {
		await applyUpdate({
			assetUrl: result.assetUrl,
			assetName: result.assetName,
			// DWC's installer validates the manifest + compatibility, uploads, and hot-loads the bundle.
			installPlugin: (filename, blob, zipFile, start) =>
				machine.installPlugin(filename, blob, zipFile as Parameters<typeof machine.installPlugin>[2], start),
		});
		ui.makeNotification(LogLevel.success, t("title"), t("applied", { version: result.latestVersion }));
	} catch (e) {
		console.warn("[FlexibleLayouts] update failed:", e);
		ui.makeNotification(LogLevel.warning, t("title"), t("applyFailed"));
		if (result.releaseUrl) {
			window.open(result.releaseUrl, "_blank", "noopener");
		}
	} finally {
		applying.value = false;
	}
}
