import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for a real reported bug: EVERY backup used to re-run the full device flow from
// scratch, even seconds after a previous one succeeded, because nothing was ever cached or persisted.
// dwc-config-backup-core's own credential storage is mocked here (it's already covered by that
// package's own test suite) so these tests stay focused on googleDriveAuth.ts's OWN three-tier
// lookup: cached token -> stored refresh token -> full device flow.

const { getGoogleDriveSettings, setGoogleDriveSettings } = vi.hoisted(() => ({
	getGoogleDriveSettings: vi.fn(),
	setGoogleDriveSettings: vi.fn(),
}));
vi.mock("dwc-config-backup-core", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return { ...actual, getGoogleDriveSettings, setGoogleDriveSettings };
});

const { requestDeviceCode, pollDeviceToken, refreshAccessToken } = vi.hoisted(() => ({
	requestDeviceCode: vi.fn(),
	pollDeviceToken: vi.fn(),
	refreshAccessToken: vi.fn(),
}));
vi.mock("dwc-config-backup-core/destinations/googleDrive", () => ({ requestDeviceCode, pollDeviceToken, refreshAccessToken }));

import { getGoogleDriveAccessToken, resetForTests, resolveDriveRefreshTokenOnSave } from "../model/configBackup/googleDriveAuth";
import { resetForTests as resetPromptForTests } from "../composables/useDriveSignInPrompt";

const SETTINGS = { clientId: "client-id", clientSecret: "client-secret" };
const DEVICE_CODE = { deviceCode: "d", userCode: "ABCD-1234", verificationUrl: "https://www.google.com/device", expiresInSeconds: 1800, pollIntervalSeconds: 0 };

beforeEach(() => {
	vi.clearAllMocks();
	resetForTests();
	resetPromptForTests();
	getGoogleDriveSettings.mockReturnValue(SETTINGS);
	vi.stubGlobal("open", vi.fn());
});

describe("getGoogleDriveAccessToken", () => {
	it("throws a translated error when Drive has no saved client ID/secret at all", async () => {
		getGoogleDriveSettings.mockReturnValue(null);
		await expect(getGoogleDriveAccessToken()).rejects.toThrow();
		expect(requestDeviceCode).not.toHaveBeenCalled();
	});

	it("runs the full device flow when there's no stored refresh token yet, and persists the one Google returns", async () => {
		requestDeviceCode.mockResolvedValue(DEVICE_CODE);
		pollDeviceToken.mockResolvedValue({ status: "authorized", accessToken: "token-1", refreshToken: "refresh-1", expiresInSeconds: 3600 });

		const token = await getGoogleDriveAccessToken();
		expect(token).toBe("token-1");
		expect(setGoogleDriveSettings).toHaveBeenCalledWith({ ...SETTINGS, refreshToken: "refresh-1" });
	});

	it("uses the stored refresh token instead of the device flow when one already exists - THE actual bug fix", async () => {
		getGoogleDriveSettings.mockReturnValue({ ...SETTINGS, refreshToken: "refresh-1" });
		refreshAccessToken.mockResolvedValue({ accessToken: "token-2", expiresInSeconds: 3600 });

		const token = await getGoogleDriveAccessToken();
		expect(token).toBe("token-2");
		expect(requestDeviceCode).not.toHaveBeenCalled();
		expect(pollDeviceToken).not.toHaveBeenCalled();
	});

	it("falls back to the full device flow when the stored refresh token is rejected, rather than treating it as fatal", async () => {
		getGoogleDriveSettings.mockReturnValue({ ...SETTINGS, refreshToken: "revoked" });
		refreshAccessToken.mockResolvedValue(null);
		requestDeviceCode.mockResolvedValue(DEVICE_CODE);
		pollDeviceToken.mockResolvedValue({ status: "authorized", accessToken: "token-3", refreshToken: "refresh-2", expiresInSeconds: 3600 });

		const token = await getGoogleDriveAccessToken();
		expect(token).toBe("token-3");
		expect(requestDeviceCode).toHaveBeenCalled();
	});

	it("reuses a cached access token across repeated calls instead of hitting the network again - the reported 'every single time' bug", async () => {
		getGoogleDriveSettings.mockReturnValue({ ...SETTINGS, refreshToken: "refresh-1" });
		refreshAccessToken.mockResolvedValue({ accessToken: "token-4", expiresInSeconds: 3600 });

		const first = await getGoogleDriveAccessToken();
		const second = await getGoogleDriveAccessToken();
		const third = await getGoogleDriveAccessToken();
		expect([first, second, third]).toEqual(["token-4", "token-4", "token-4"]);
		expect(refreshAccessToken).toHaveBeenCalledTimes(1); // only the first call actually touched the network
	});

	it("does NOT reuse a cached token past its expiry - renews again once it's genuinely stale", async () => {
		// Below the 30s floor on the cache window (cacheToken deliberately never caches for LESS than
		// 30s, even for a very short-lived token), so this has to actually advance time to exercise
		// real expiry rather than the early-renewal margin.
		vi.useFakeTimers();
		try {
			getGoogleDriveSettings.mockReturnValue({ ...SETTINGS, refreshToken: "refresh-1" });
			refreshAccessToken.mockResolvedValue({ accessToken: "token-5", expiresInSeconds: 90 });

			await getGoogleDriveAccessToken();
			vi.advanceTimersByTime(91_000); // past the cached 90s - 60s margin, and past the real expiry too
			await getGoogleDriveAccessToken();
			expect(refreshAccessToken).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("re-fetches settings before writing back the new refresh token, so a concurrent client-ID/secret edit isn't clobbered", async () => {
		const editedSettings = { clientId: "edited-id", clientSecret: "edited-secret" };
		getGoogleDriveSettings.mockReturnValueOnce(SETTINGS).mockReturnValueOnce(editedSettings);
		requestDeviceCode.mockResolvedValue(DEVICE_CODE);
		pollDeviceToken.mockResolvedValue({ status: "authorized", accessToken: "token-6", refreshToken: "refresh-3", expiresInSeconds: 3600 });

		await getGoogleDriveAccessToken();
		expect(setGoogleDriveSettings).toHaveBeenCalledWith({ ...editedSettings, refreshToken: "refresh-3" });
	});

	it("propagates a denied sign-in as a rejected promise, with nothing cached and nothing persisted", async () => {
		requestDeviceCode.mockResolvedValue(DEVICE_CODE);
		pollDeviceToken.mockResolvedValue({ status: "denied" });

		await expect(getGoogleDriveAccessToken()).rejects.toThrow();
		expect(setGoogleDriveSettings).not.toHaveBeenCalled();
	});
});

// Regression coverage for a second real bug found while fixing the first: CloudPanel's Save button used
// to write {clientId, clientSecret} unconditionally, silently dropping an already-stored refresh token
// on every re-save - so a user who was already signed in and just reopened Settings to check their
// client ID lost it for no reason.
describe("resolveDriveRefreshTokenOnSave", () => {
	it("preserves the existing refresh token when the client ID and secret are unchanged", () => {
		const existing = { clientId: "id", clientSecret: "secret", refreshToken: "refresh-1" };
		expect(resolveDriveRefreshTokenOnSave(existing, "id", "secret")).toBe("refresh-1");
	});

	it("drops the refresh token when the client ID changes - it's tied to the old client and won't work with a new one", () => {
		const existing = { clientId: "id", clientSecret: "secret", refreshToken: "refresh-1" };
		expect(resolveDriveRefreshTokenOnSave(existing, "different-id", "secret")).toBeUndefined();
	});

	it("drops the refresh token when the client secret changes", () => {
		const existing = { clientId: "id", clientSecret: "secret", refreshToken: "refresh-1" };
		expect(resolveDriveRefreshTokenOnSave(existing, "id", "different-secret")).toBeUndefined();
	});

	it("is undefined (not a throw) when there's nothing saved yet - first-time setup", () => {
		expect(resolveDriveRefreshTokenOnSave(null, "id", "secret")).toBeUndefined();
	});
});
