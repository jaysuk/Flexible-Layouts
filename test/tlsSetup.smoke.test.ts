import { describe, expect, it } from "vitest";
import { mountInDwc, setConnected } from "dwc-plugin-test-kit";

import TlsSetupDialog from "../src/tlsSetup/TlsSetupDialog.vue";

/**
 * Mirrors configBackup.smoke.test.ts: mount the TLS setup dialog connected + disconnected and assert
 * it renders without throwing, both closed and open (open exercises the capability-detection step).
 */
describe("TLS setup dialog mounts without throwing", () => {
	it("mounts closed", () => {
		const wrapper = mountInDwc(TlsSetupDialog, { props: { modelValue: false } });
		expect(wrapper.exists()).toBe(true);
		wrapper.unmount();
	});

	it("mounts open", () => {
		const wrapper = mountInDwc(TlsSetupDialog, { props: { modelValue: true } });
		expect(wrapper.exists()).toBe(true);
		wrapper.unmount();
	});

	it("mounts open while disconnected", () => {
		setConnected(false);
		const wrapper = mountInDwc(TlsSetupDialog, { props: { modelValue: true } });
		expect(wrapper.exists()).toBe(true);
		wrapper.unmount();
	});
});
