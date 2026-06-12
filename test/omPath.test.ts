import { describe, expect, it } from "vitest";
import { loadObjectModel, mountInDwc, setGlobals, setModel } from "dwc-plugin-test-kit";

import { omChildren, resolveOmPath } from "../src/util/omPath";
import WidgetView from "../src/widgets/WidgetView.vue";
import type { Widget } from "../src/model/document";

// Parts of DWC's object model are Maps (global, plugins, ...), not plain objects. A user reported
// the Value widget showing nothing for global variables - plain property access on a Map silently
// returns undefined, and Object.keys() enumerates it as empty (so globals never even appeared in
// the path picker).
describe("resolveOmPath with Map segments", () => {
	const model = { global: new Map<string, unknown>([["zOffset", 0.25], ["counters", { prints: 7 }]]), state: { status: "idle" } };

	it("resolves values inside Maps and beyond them", () => {
		expect(resolveOmPath(model, "global.zOffset")).toBe(0.25);
		expect(resolveOmPath(model, "global.counters.prints")).toBe(7);
		expect(resolveOmPath(model, "global.missing")).toBeUndefined();
		expect(resolveOmPath(model, "state.status")).toBe("idle"); // plain objects unaffected
	});

	it("omChildren enumerates Maps, arrays and objects uniformly", () => {
		expect(omChildren(model.global).map(([k]) => k)).toEqual(["zOffset", "counters"]);
		expect(omChildren([10, 20]).map(([k]) => k)).toEqual(["0", "1"]);
		expect(omChildren({ a: 1 })).toEqual([["a", 1]]);
		expect(omChildren(null)).toEqual([]);
	});
});

describe("Value widget displays globals (regression)", () => {
	it("shows a global variable's value", () => {
		// loadObjectModel converts a plain `global` object into the real Map the model uses.
		setModel(loadObjectModel({ global: { myTemp: 42.5 } }));
		setGlobals({ myTemp: 42.5 });
		const widget = { type: "value", omPath: "global.myTemp", label: "My temp", display: "number", precision: 1 } as Extract<Widget, { type: "value" }>;
		const wrapper = mountInDwc(WidgetView, { props: { widget } });
		expect(wrapper.text()).toContain("42.5");
		wrapper.unmount();
	});
});
