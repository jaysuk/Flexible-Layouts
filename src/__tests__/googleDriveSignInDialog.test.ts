import { flushPromises } from "@vue/test-utils";
import { mountInDwc } from "dwc-plugin-test-kit";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	closeDriveSignInPrompt, openDriveSignInPrompt, resetForTests, updateDriveSignInStatus,
} from "../composables/useDriveSignInPrompt";
import GoogleDriveSignInDialog from "../configBackup/GoogleDriveSignInDialog.vue";

// Regression coverage for two real reported bugs:
// 1. The device-code prompt used to be a DWC toast (uiStore.log()), which auto-dismisses - a user who
//    switched tabs to enter the code at Google's verification page came back to find it already gone.
//    It must now be a persistent dialog, closed ONLY by the user clicking its own button - never on any
//    kind of timer.
// 2. If the user never completed sign-in, the backup used to sit "at packaging archive" indefinitely
//    with no way out (Google's own device-code expiry is ~30 minutes). There must be a real Cancel
//    action while still waiting, distinct from the terminal-state OK that just dismisses.

afterEach(() => {
	resetForTests();
});

// attach: true keeps v-dialog's content in the local DOM tree instead of teleporting to <body> - see
// WhatsNewDialog.test.ts/GcodeFilePickerDialog.vue's own tests for the same pattern.
function mountDialog() {
	return mountInDwc(GoogleDriveSignInDialog, { props: { attach: true } });
}

describe("GoogleDriveSignInDialog", () => {
	it("is not shown at all until openDriveSignInPrompt is called", () => {
		const w = mountDialog();
		expect(w.find(".v-overlay--active").exists()).toBe(false);
	});

	it("shows the code and verification link once opened, and stays open with no timeout prop set", async () => {
		openDriveSignInPrompt("ABCD-1234", "https://www.google.com/device", () => {});
		const w = mountDialog();
		await flushPromises();
		expect(w.text()).toContain("ABCD-1234");
		const link = w.find("a[href='https://www.google.com/device']");
		expect(link.exists()).toBe(true);
		// The regression itself: a v-snackbar (what the old toast used) takes a `timeout` prop that
		// auto-closes it. This is a v-dialog with none - nothing here can time out on its own.
		expect(w.findComponent({ name: "VDialog" }).props("persistent")).toBe(true);
	});

	it("does NOT close itself when the underlying status changes - only the user's own click does", async () => {
		openDriveSignInPrompt("ABCD-1234", "https://www.google.com/device", () => {});
		const w = mountDialog();
		await flushPromises();
		updateDriveSignInStatus("authorized");
		await flushPromises();
		// Test-kit's i18n stub returns raw keys rather than translated en.json text (consistent with
		// this repo's other dialog tests, which assert structure/keys rather than literal copy) -
		// asserting the key is still a real check that the SUCCESS branch rendered, not the waiting one.
		expect(w.text()).toContain("signInSuccess");
		expect(w.find(".v-overlay--active").exists()).toBe(true); // still open - no auto-dismiss on success
	});

	it("shows the denied/expired/error states distinctly", async () => {
		openDriveSignInPrompt("ABCD-1234", "https://www.google.com/device", () => {});
		const w = mountDialog();
		updateDriveSignInStatus("denied");
		await flushPromises();
		expect(w.text()).toContain("signInDenied");

		updateDriveSignInStatus("expired");
		await flushPromises();
		expect(w.text()).toContain("signInExpired");

		updateDriveSignInStatus("error", "Something specific went wrong.");
		await flushPromises();
		expect(w.text()).toContain("Something specific went wrong.");
	});

	it("shows a Cancel button (not OK) while still waiting, and clicking it invokes the registered cancel handler AND closes", async () => {
		const onCancel = vi.fn();
		openDriveSignInPrompt("ABCD-1234", "https://www.google.com/device", onCancel);
		const w = mountDialog();
		await flushPromises();
		expect(w.text()).toContain("signInCancel");
		expect(w.text()).not.toContain("signInOk");

		await w.find("button").trigger("click");
		await flushPromises();
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(w.find(".v-overlay--active").exists()).toBe(false); // the real fix - a way out, not stuck forever
	});

	it("shows an OK button (not Cancel) once resolved, and clicking it does NOT invoke the cancel handler", async () => {
		const onCancel = vi.fn();
		openDriveSignInPrompt("ABCD-1234", "https://www.google.com/device", onCancel);
		const w = mountDialog();
		updateDriveSignInStatus("authorized");
		await flushPromises();
		expect(w.text()).toContain("signInOk");
		expect(w.text()).not.toContain("signInCancel");

		await w.find("button").trigger("click");
		await flushPromises();
		expect(onCancel).not.toHaveBeenCalled();
		expect(w.find(".v-overlay--active").exists()).toBe(false);
	});

	it("closeDriveSignInPrompt is the only way state.open goes false (sanity on the composable itself)", () => {
		openDriveSignInPrompt("code", "https://example.com", () => {});
		closeDriveSignInPrompt();
		const w = mountDialog();
		expect(w.find(".v-overlay--active").exists()).toBe(false);
	});
});
