/**
 * Certificate-expiry reminder: a one-click toast (never automatic renewal) shown once per connect when
 * the cached expiry date (recorded at upload time - see storage.ts) is within the configured warning
 * window. Mirrors `../configBackup/autoBackupNudges.ts`'s install/uninstall lifecycle exactly, wired
 * into index.ts the same way.
 */
import { watch } from "vue";

import { LogLevel, useUiStore } from "@/stores/ui";
import { useMachineStore } from "@/stores/machine";
import i18n from "@/i18n";

import { isExpiringSoon } from "./certExpiry";
import { getCertExpiryDate, getCertReminderSettings } from "./storage";

// There's no dedicated route for the TLS setup dialog (it's a Settings-tab popup, not a routed page),
// so the toast links to Settings itself rather than a precise deep link - same as clicking the button.
const SETTINGS_ROUTE_PATH = "/Settings";

let stopConnectWatch: (() => void) | null = null;
let checkedThisSession = false;

export function installCertExpiryNudge(): void {
	const uiStore = useUiStore();
	const machineStore = useMachineStore();

	function checkOnConnect(): void {
		if (!machineStore.isConnected || checkedThisSession) { return; }
		checkedThisSession = true;
		const settings = getCertReminderSettings();
		if (!settings.enabled) { return; }
		const expiryIso = getCertExpiryDate();
		if (!expiryIso) { return; }
		const notAfter = new Date(expiryIso);
		if (Number.isNaN(notAfter.getTime())) { return; }
		if (!isExpiringSoon(notAfter, settings.warningDays)) { return; }

		const daysLeft = Math.ceil((notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
		uiStore.log(
			LogLevel.warning,
			i18n.global.t("plugins.flexibleLayouts.tlsSetup.nudge.title"),
			daysLeft <= 0
				? i18n.global.t("plugins.flexibleLayouts.tlsSetup.nudge.expired")
				: i18n.global.t("plugins.flexibleLayouts.tlsSetup.nudge.expiringSoon", { days: daysLeft }),
			SETTINGS_ROUTE_PATH,
		);
	}
	stopConnectWatch = watch(() => machineStore.isConnected, (connected) => { if (connected) { checkOnConnect(); } }, { immediate: true });
}

export function uninstallCertExpiryNudge(): void {
	if (stopConnectWatch) { stopConnectWatch(); stopConnectWatch = null; }
	checkedThisSession = false;
}
