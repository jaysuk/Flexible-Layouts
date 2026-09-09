/**
 * Google Drive access-token acquisition, shared by both the Create tab (runBackup.ts) and the Restore
 * tab (RestorePanel.vue) - the device flow's own auth is identical either way, only what's done with
 * the resulting token differs (upload vs. list/download/delete).
 *
 * Three-tier lookup, cheapest first:
 *   1. An in-memory cached access token, if still valid - covers several backups/restores in a row
 *      within the same page load with zero network round trips.
 *   2. A stored refresh token, silently exchanged for a new access token - Google's device flow ALWAYS
 *      issues one (confirmed in Google's own docs), so this is what actually delivers "sign in once,
 *      not every time" across page reloads, for as long as the refresh token itself stays valid
 *      (months, typically - see GoogleDriveSignInDialog's setup help for the one Console step needed
 *      to avoid Testing-mode's 7-day refresh-token cap).
 *   3. The full interactive device flow - only reached when neither of the above works.
 *
 * Real bug fixed here (not present in the very first version of this flow): every backup used to
 * re-run the full device flow from scratch, even seconds after a previous one succeeded, because
 * nothing was ever cached or persisted at all.
 */
import type { GoogleDriveSettings } from "dwc-config-backup-core";
import { getGoogleDriveSettings, setGoogleDriveSettings } from "dwc-config-backup-core";
import { pollDeviceToken, refreshAccessToken, requestDeviceCode } from "dwc-config-backup-core/destinations/googleDrive";

import i18n from "@/i18n";

import { openDriveSignInPrompt, updateDriveSignInStatus } from "../../composables/useDriveSignInPrompt";

/** Real reported bug this fixes: CloudPanel's Save button used to write `{clientId, clientSecret}`
 * unconditionally, silently dropping an already-stored refresh token every time - so a user who was
 * already signed in and just reopened Settings (e.g. to double-check the client ID) lost it for no
 * reason and got sent through the full device flow again next time. A refresh token IS tied to the
 * specific client it was issued for though, so a GENUINE client-ID/secret change correctly still drops
 * it - the old one wouldn't work with a different client anyway. Exported as its own pure function
 * (rather than inlined in CloudPanel.vue's onSaveDrive) so this decision is unit-testable without
 * mounting the component. */
export function resolveDriveRefreshTokenOnSave(existing: GoogleDriveSettings | null, newClientId: string, newClientSecret: string): string | undefined {
	if (existing?.clientId === newClientId && existing?.clientSecret === newClientSecret) {
		return existing.refreshToken;
	}
	return undefined;
}

interface CachedToken { token: string; expiresAt: number }
let cachedAccessToken: CachedToken | null = null;

function cacheToken(token: string, expiresInSeconds: number): void {
	// Renew 60s before Google's own stated expiry, not right at it - avoids a request landing just past
	// the boundary and failing with an auth error for no visible reason. Floors at 30s so a very short
	// (or malformed) expiresInSeconds can't produce a negative/zero cache window.
	cachedAccessToken = { token, expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 30) * 1000 };
}

/** The one entry point both the Create and Restore tabs use. Throws with a translated message if Drive
 *  isn't configured at all, if the user cancels/declines/times out, or on a genuine Google error. */
export async function getGoogleDriveAccessToken(): Promise<string> {
	const settings = getGoogleDriveSettings();
	if (!settings) {
		throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.create.notConfigured", {
			destination: i18n.global.t("plugins.flexibleLayouts.configBackup.drive.heading"),
		}));
	}

	if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
		return cachedAccessToken.token;
	}

	if (settings.refreshToken) {
		const renewed = await refreshAccessToken(settings.clientId, settings.clientSecret, settings.refreshToken);
		if (renewed) {
			cacheToken(renewed.accessToken, renewed.expiresInSeconds);
			return renewed.accessToken;
		}
		// The refresh token itself was rejected (revoked, 6 months unused, Testing-mode's 7-day cap,
		// etc.) - fall through to a full re-sign-in rather than treating this as fatal.
	}

	const authorized = await signInWithDeviceFlow(settings.clientId, settings.clientSecret);
	cacheToken(authorized.accessToken, authorized.expiresInSeconds);
	// Always re-fetch settings rather than reusing the `settings` closed over above - sign-in can take
	// a long time (the user may be away for minutes), and a client-ID/secret edit saved via CloudPanel
	// in the meantime must not be clobbered by writing back a stale copy of those two fields.
	const current = getGoogleDriveSettings();
	if (current) {
		setGoogleDriveSettings({ ...current, refreshToken: authorized.refreshToken });
	}
	return authorized.accessToken;
}

async function signInWithDeviceFlow(clientId: string, clientSecret: string): Promise<{ accessToken: string; refreshToken: string; expiresInSeconds: number }> {
	const code = await requestDeviceCode(clientId);
	window.open(code.verificationUrl, "_blank", "noopener");
	let cancelled = false;
	openDriveSignInPrompt(code.userCode, code.verificationUrl, () => { cancelled = true; });

	let intervalMs = Math.max(code.pollIntervalSeconds, 1) * 1000;
	const deadline = Date.now() + code.expiresInSeconds * 1000;
	while (Date.now() < deadline) {
		if (cancelled) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInCancelled")); }
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
		if (cancelled) { throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInCancelled")); }
		const outcome = await pollDeviceToken(clientId, clientSecret, code.deviceCode);
		switch (outcome.status) {
			case "authorized":
				updateDriveSignInStatus("authorized");
				return { accessToken: outcome.accessToken, refreshToken: outcome.refreshToken, expiresInSeconds: outcome.expiresInSeconds };
			case "pending": continue;
			// Google calls this out explicitly - a fixed retry ignores the instruction and can escalate.
			case "slowDown": intervalMs += 5000; continue;
			case "denied":
				updateDriveSignInStatus("denied");
				throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInDenied"));
			case "expired":
				updateDriveSignInStatus("expired");
				throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInExpired"));
			case "error":
				updateDriveSignInStatus("error", outcome.message);
				throw new Error(outcome.message);
		}
	}
	updateDriveSignInStatus("expired");
	throw new Error(i18n.global.t("plugins.flexibleLayouts.configBackup.drive.signInExpired"));
}

/** Test-only: clears the in-memory access-token cache between tests. */
export function resetForTests(): void {
	cachedAccessToken = null;
}
