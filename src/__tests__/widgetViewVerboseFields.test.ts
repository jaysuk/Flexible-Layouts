import { afterEach, describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

const { acquireVerboseQueries, releaseVerboseQueries } = vi.hoisted(() => ({
	acquireVerboseQueries: vi.fn(),
	releaseVerboseQueries: vi.fn(),
}));
vi.mock("../model/verboseFields", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../model/verboseFields")>();
	// pathNeedsVerboseQueries stays real (pure, no store access) - only the ref-counted acquire/release
	// calls (already covered on their own in verboseFields.test.ts) are spied on here, so this file can
	// assert WHEN WidgetView calls them without re-testing the ref-counting contract itself.
	return { ...actual, acquireVerboseQueries, releaseVerboseQueries };
});

import { createDefaultWidget } from "../model/document";
import WidgetView from "../widgets/WidgetView.vue";

afterEach(() => {
	acquireVerboseQueries.mockClear();
	releaseVerboseQueries.mockClear();
});

describe("WidgetView - verbose OM query lifecycle", () => {
	it("acquires while mounted with an omPath that needs verbose fields, releases on unmount", () => {
		const widget = { ...createDefaultWidget("value"), omPath: "spindles[0].max" };
		const w = mountInDwc(WidgetView, { props: { widget } });
		expect(acquireVerboseQueries).toHaveBeenCalledTimes(1);
		expect(releaseVerboseQueries).not.toHaveBeenCalled();

		w.unmount();
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1);
	});

	it("does not acquire for an ordinary, non-verbose omPath", () => {
		const widget = { ...createDefaultWidget("value"), omPath: "heat.heaters[0].current" };
		mountInDwc(WidgetView, { props: { widget } });
		expect(acquireVerboseQueries).not.toHaveBeenCalled();
	});

	it("does not acquire for a widget type with no omPath at all", () => {
		const widget = createDefaultWidget("label");
		mountInDwc(WidgetView, { props: { widget } });
		expect(acquireVerboseQueries).not.toHaveBeenCalled();
	});

	it("re-evaluates when omPath changes: releases the old need and acquires the new one", async () => {
		const widget = { ...createDefaultWidget("value"), omPath: "spindles[0].max" };
		const w = mountInDwc(WidgetView, { props: { widget } });
		expect(acquireVerboseQueries).toHaveBeenCalledTimes(1);

		await w.setProps({ widget: { ...widget, omPath: "heat.heaters[0].current" } });
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1);
		expect(acquireVerboseQueries).toHaveBeenCalledTimes(1); // no re-acquire - the new path doesn't need it
	});

	it("does not release twice when unmounted after a path change already released it", async () => {
		const widget = { ...createDefaultWidget("value"), omPath: "spindles[0].max" };
		const w = mountInDwc(WidgetView, { props: { widget } });
		await w.setProps({ widget: { ...widget, omPath: "heat.heaters[0].current" } });
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1);

		w.unmount();
		expect(releaseVerboseQueries).toHaveBeenCalledTimes(1); // still just the one release
	});
});
