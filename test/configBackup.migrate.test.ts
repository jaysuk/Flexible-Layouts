import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { byText, mountInDwc } from "dwc-plugin-test-kit";
import {
	configureHost, enableEncryption, getDropboxSettings, resetForTests, resetHostConfigForTests,
	setDropboxSettings, setGithubSettings,
} from "dwc-config-backup-core";

import CloudPanel from "../src/configBackup/CloudPanel.vue";

// Same-browser credential import (credentialsMigrate.ts) reads another host's raw localStorage keys
// by explicit namespace string - these two match the real production namespaces (see index.ts in each
// repo's configureHost() call), and are what makes this test realistic rather than testing a fiction.
const STANDALONE_NAMESPACE = "duetConfigBackup";
const FL_NAMESPACE = "flexibleLayouts.configBackup";

// The test harness doesn't load real translations, so $t() just returns its key - assert against
// those keys directly (the established convention here, see controlsFixes.test.ts's byText() calls).
const MIGRATE = "plugins.flexibleLayouts.configBackup.migrate";

let pluginLoaded = false;
// The test kit's `@/plugins` stub doesn't export isPluginLoaded at all (same gap sdBackup.history.
// test.ts hits for unregisterTheme) - extend it locally, toggled per test via the closed-over var.
vi.mock("@/plugins", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	isPluginLoaded: () => pluginLoaded,
}));

let confirmAnswer = true;
// The stub's showConfirmDialog always resolves false (no UI in tests) - override so the import flow
// past the confirm dialog is actually reachable.
vi.mock("@/composables/useConfirmDialog", () => ({
	showConfirmDialog: () => Promise.resolve(confirmAnswer),
	showMessageBox: () => Promise.resolve(),
}));

describe("CloudPanel - import from standalone plugin", () => {
	beforeEach(() => {
		pluginLoaded = false;
		confirmAnswer = true;
		resetForTests();
		resetHostConfigForTests();
		configureHost({ storageNamespace: FL_NAMESPACE });
	});

	it("doesn't show the card when the standalone plugin isn't loaded", () => {
		const wrapper = mountInDwc(CloudPanel);
		expect(wrapper.text()).not.toContain(`${MIGRATE}.heading`);
	});

	it("says nothing was found when the standalone plugin is loaded but has no saved credentials", () => {
		pluginLoaded = true;
		const wrapper = mountInDwc(CloudPanel);
		expect(wrapper.text()).toContain(`${MIGRATE}.heading`);
		expect(wrapper.text()).toContain(`${MIGRATE}.nothingFound`);
	});

	it("points at the SD/file path instead when the standalone plugin has its own encryption on", async () => {
		pluginLoaded = true;
		configureHost({ storageNamespace: STANDALONE_NAMESPACE });
		await enableEncryption("passphrase");
		configureHost({ storageNamespace: FL_NAMESPACE });

		const wrapper = mountInDwc(CloudPanel);
		expect(wrapper.text()).toContain(`${MIGRATE}.sourceEncrypted`);
	});

	it("imports plaintext credentials from the standalone plugin's namespace into FL's own on confirm", async () => {
		pluginLoaded = true;
		configureHost({ storageNamespace: STANDALONE_NAMESPACE });
		setGithubSettings({ token: "ghp_plain", repo: "user/repo", branch: "main" });
		setDropboxSettings({ token: "dbx_plain" });
		configureHost({ storageNamespace: FL_NAMESPACE });
		expect(getDropboxSettings()).toBeNull(); // nothing under FL's own namespace yet

		const wrapper = mountInDwc(CloudPanel);
		const button = byText(wrapper, `${MIGRATE}.importButton`);
		expect(button).toBeTruthy();
		await button!.trigger("click");
		await flushPromises();

		expect(getDropboxSettings()).toEqual({ token: "dbx_plain" });
		expect(wrapper.text()).toContain(`${MIGRATE}.imported`);
	});

	it("does nothing when the confirm dialog is declined", async () => {
		pluginLoaded = true;
		confirmAnswer = false;
		configureHost({ storageNamespace: STANDALONE_NAMESPACE });
		setDropboxSettings({ token: "dbx_plain" });
		configureHost({ storageNamespace: FL_NAMESPACE });

		const wrapper = mountInDwc(CloudPanel);
		const button = byText(wrapper, `${MIGRATE}.importButton`);
		await button!.trigger("click");
		await flushPromises();

		expect(getDropboxSettings()).toBeNull();
	});
});
