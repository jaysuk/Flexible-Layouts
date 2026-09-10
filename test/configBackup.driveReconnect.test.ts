import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mountInDwc } from "dwc-plugin-test-kit";
import {
	configureHost, resetForTests, resetHostConfigForTests, setGoogleDriveSettings,
} from "dwc-config-backup-core";

// The reconnect button just wraps getGoogleDriveAccessToken() (the cached-token -> refresh-token ->
// device-flow ladder, itself covered by googleDriveAuth.test.ts). This checks the wiring: the button
// appears only when Drive is configured, calls that function, and surfaces success/failure.
const getGoogleDriveAccessToken = vi.hoisted(() => vi.fn());
vi.mock("../src/model/configBackup/googleDriveAuth", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	getGoogleDriveAccessToken,
}));

// The test kit's `@/plugins` stub doesn't export isPluginLoaded (same gap configBackup.migrate.test.ts
// works around).
vi.mock("@/plugins", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	isPluginLoaded: () => false,
}));

vi.mock("@/composables/useConfirmDialog", () => ({
	showConfirmDialog: () => Promise.resolve(false),
	showMessageBox: () => Promise.resolve(),
}));

import CloudPanel from "../src/configBackup/CloudPanel.vue";

const RECONNECT = "plugins.flexibleLayouts.configBackup.drive.reconnectButton";
const SIGN_IN_NOW = "plugins.flexibleLayouts.configBackup.drive.signInNowButton";
const RECONNECT_OK = "plugins.flexibleLayouts.configBackup.drive.reconnectOk";
const DRIVE_HEADING = "plugins.flexibleLayouts.configBackup.drive.heading";

// The reconnect UI lives inside the collapsed "Google Drive" v-expansion-panel, so a test has to open
// it first (the panels are uncontrolled - no v-model - so this clicks the title).
async function mountWithDrivePanelOpen(w: ReturnType<typeof mountInDwc>) {
	const title = w.findAll(".v-expansion-panel-title").find((t) => t.text().includes(DRIVE_HEADING));
	if (title) { await title.trigger("click"); await flushPromises(); }
	return w;
}

beforeEach(() => {
	resetForTests();
	resetHostConfigForTests();
	configureHost({ storageNamespace: "flexibleLayouts.configBackup" });
	getGoogleDriveAccessToken.mockReset();
});

describe("CloudPanel - Google Drive reconnect", () => {
	it("shows no reconnect control until Drive is configured", async () => {
		const w = await mountWithDrivePanelOpen(mountInDwc(CloudPanel));
		expect(w.text()).not.toContain(RECONNECT);
		expect(w.text()).not.toContain(SIGN_IN_NOW);
	});

	it("offers 'sign in now' when configured but never signed in, and 'reconnect' once a refresh token exists", async () => {
		setGoogleDriveSettings({ clientId: "id", clientSecret: "secret" });
		let w = await mountWithDrivePanelOpen(mountInDwc(CloudPanel));
		expect(w.text()).toContain(SIGN_IN_NOW);
		expect(w.text()).not.toContain(RECONNECT);

		setGoogleDriveSettings({ clientId: "id", clientSecret: "secret", refreshToken: "r" });
		w = await mountWithDrivePanelOpen(mountInDwc(CloudPanel));
		expect(w.text()).toContain(RECONNECT);
	});

	it("calls getGoogleDriveAccessToken and shows success", async () => {
		setGoogleDriveSettings({ clientId: "id", clientSecret: "secret" });
		getGoogleDriveAccessToken.mockResolvedValue("access-token");
		const w = await mountWithDrivePanelOpen(mountInDwc(CloudPanel));

		const btn = w.findAll("button").find((b) => b.text().includes(SIGN_IN_NOW));
		expect(btn).toBeDefined();
		await btn!.trigger("click");
		await flushPromises();

		expect(getGoogleDriveAccessToken).toHaveBeenCalledTimes(1);
		expect(w.text()).toContain(RECONNECT_OK);
	});

	it("surfaces a failed/cancelled sign-in as an error message", async () => {
		setGoogleDriveSettings({ clientId: "id", clientSecret: "secret" });
		getGoogleDriveAccessToken.mockRejectedValue(new Error("Google sign-in was cancelled."));
		const w = await mountWithDrivePanelOpen(mountInDwc(CloudPanel));

		const btn = w.findAll("button").find((b) => b.text().includes(SIGN_IN_NOW));
		await btn!.trigger("click");
		await flushPromises();

		expect(w.text()).toContain("Google sign-in was cancelled.");
	});
});
