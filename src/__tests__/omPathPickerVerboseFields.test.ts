import { afterEach, describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

const { acquireVerboseQueries, releaseVerboseQueries } = vi.hoisted(() => ({
	acquireVerboseQueries: vi.fn(),
	releaseVerboseQueries: vi.fn(),
}));
vi.mock("../model/verboseFields", () => ({ acquireVerboseQueries, releaseVerboseQueries }));

import OmPathPicker from "../editor/OmPathPicker.vue";

afterEach(() => {
	acquireVerboseQueries.mockClear();
	releaseVerboseQueries.mockClear();
});

// Verbose fields (spindle RPM range etc. - see model/verboseFields.ts) are omitted from the object
// model entirely unless something asks for them, so the picker's own tree would never be able to
// offer them as selectable in the first place without this - unconditionally, since the picker can't
// know in advance which of the many fields it might browse to are verbose ones.
describe("OmPathPicker - verbose OM query lifecycle", () => {
	it("acquires while open, releases when closed via modelValue", async () => {
		const w = mountInDwc(OmPathPicker, { props: { modelValue: false } });
		expect(acquireVerboseQueries).not.toHaveBeenCalled();

		await w.setProps({ modelValue: true });
		expect(acquireVerboseQueries).toHaveBeenCalledTimes(1);
		expect(releaseVerboseQueries).not.toHaveBeenCalled();

		await w.setProps({ modelValue: false });
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1);
	});

	it("releases on unmount if it was left open, but not if it was already closed", async () => {
		// The picker is normally kept mounted with modelValue toggled (matching the surrounding
		// v-dialog's own :model-value pattern), so "unmount while open" happens when the DIALOG's
		// host (e.g. PropertiesDialog) is torn down without the picker having been closed first.
		const openWrapper = mountInDwc(OmPathPicker, { props: { modelValue: false } });
		await openWrapper.setProps({ modelValue: true });
		openWrapper.unmount();
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1);

		releaseVerboseQueries.mockClear();
		const closedWrapper = mountInDwc(OmPathPicker, { props: { modelValue: false } });
		closedWrapper.unmount();
		expect(releaseVerboseQueries).not.toHaveBeenCalled();
	});

	it("does not double-acquire across repeated opens without an intervening close call being missed", async () => {
		const w = mountInDwc(OmPathPicker, { props: { modelValue: false } });
		await w.setProps({ modelValue: true });
		expect(acquireVerboseQueries).toHaveBeenCalledTimes(1);
		await w.setProps({ modelValue: false });
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1);
		await w.setProps({ modelValue: true });
		expect(acquireVerboseQueries).toHaveBeenCalledTimes(2);
	});
});
