import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { dwc, mountInDwc, setFiles, setGlobals } from "dwc-plugin-test-kit";

import { createDefaultWidget, type Widget } from "../src/model/document";
import { setAccess } from "../src/model/access";
import WidgetView from "../src/widgets/WidgetView.vue";

/**
 * Regression coverage for the "Conditional behaviour" colour rule silently doing nothing: a grid
 * item's `conditions` are evaluated into `effects.color` by FlexGridItem.vue and passed to WidgetView
 * as the `override-color` prop, but until now WidgetView only forwarded it to 4 of ~50 widget types
 * (codeButton/value/label, plus heater fixed in the same pass as this test). Every widget listed here
 * has its own `widget.color` accent (or, for accessChip, gained one) that a matching rule should be
 * able to override - this asserts the override actually reaches the rendered DOM through the full
 * FlexGridItem-shaped path (WidgetView's own `override-color` prop), not just that the widget mounts.
 *
 * A distinctive literal hex is used (not a theme token) because Vuetify/inline styles pass a literal
 * colour straight through as text, unlike a token name which resolves to a CSS custom property - so
 * a plain string search on the rendered HTML is a reliable, implementation-agnostic assertion.
 *
 * `probeRoutines` is deliberately NOT in this list: every colourable button there is gated behind
 * mid-routine state (a probed workpiece/skew/bore result) that isn't worth faking here - its fix is
 * the same one-line `overrideColor || widget.color` idiom as everywhere else, reviewed by eye.
 */
const PROBE = "#123456";

const CASES: Array<{ type: Parameters<typeof createDefaultWidget>[0]; setup?: () => void; widgetPatch?: Record<string, unknown> }> = [
	{ type: "heater" },
	{ type: "bedTram" },
	{ type: "console" },
	{ type: "extruder" },
	{ type: "fan" },
	// Default widget.folder is "" (falls back to the live OM macros/gcodes dir) with nothing in it in
	// the base fixture - give each a file to render its per-file button.
	{ type: "files", setup: () => setFiles("0:/gcodes", [{ name: "test.gcode", isDirectory: false }]) },
	{ type: "input" },
	{ type: "jog" },
	{ type: "macros", setup: () => setFiles("0:/macros", [{ name: "Test Macro.g", isDirectory: false }]) },
	{ type: "maintenanceWidget" },
	{ type: "neopixel" },
	{ type: "octopusJog" },
	{ type: "preflight" },
	{ type: "probe" },
	{ type: "progress" },
	{ type: "slider" },
	{ type: "spindle" },
	{ type: "stepper" },
	{ type: "surfacing" },
	// Default toggle widget is off; Vuetify's v-switch only threads a literal `color` into the DOM
	// once it's actually on (there's nothing to tint in the untouched "off" track/thumb).
	{ type: "toggle", setup: () => { (dwc.model as { state: { atxPower?: boolean } }).state.atxPower = true; } },
	// The colour only applies to whichever tool row is "current" - the fixture's Tool 0 is current by
	// default (-1), so point currentTool at it.
	{ type: "toolAlign", setup: () => { (dwc.model as { state: { currentTool: number } }).state.currentTool = 0; } },
	{ type: "toolSelect", setup: () => { (dwc.model as { state: { currentTool: number } }).state.currentTool = 0; } },
	{ type: "toolpath" },
	{ type: "wcs" },
	{ type: "wcsTable" },
	{ type: "xyzProbe" },
	// The chip only renders at all once access control is turned on.
	{ type: "accessChip", setup: () => setAccess({ observerEnabled: true, operatorEnabled: false, adminHash: "", operatorHash: "", hideEmergencyStop: false }) },
	{ type: "bedMesh" },
	{ type: "firmwareUpdate" },
	// dro/gaugeCluster/sparkline/note render with default data - no setup needed.
	{ type: "dro" },
	{ type: "gaugeCluster" },
	{ type: "sparkline" },
	{ type: "note" },
	// The read-only value span (the thing override-color targets) only renders with allowEdit: false,
	// and needs at least one global to actually show a row.
	{ type: "globals", widgetPatch: { allowEdit: false }, setup: () => setGlobals({ myVar: 1 }) },
];

beforeEach(() => setAccess({ observerEnabled: false, operatorEnabled: false, adminHash: "", operatorHash: "", hideEmergencyStop: false }));

describe("WidgetView forwards override-color through to every widget with a colour accent", () => {
	for (const { type, setup, widgetPatch } of CASES) {
		it(`${type} reflects override-color in its rendered output`, async () => {
			setup?.();
			const widget = { ...createDefaultWidget(type), ...widgetPatch } as Widget;
			const wrapper = mountInDwc(WidgetView, { props: { widget, overrideColor: PROBE } });
			await flushPromises(); // files/macros load their listing asynchronously
			expect(wrapper.html()).toContain(PROBE);
			wrapper.unmount();
		});
	}
});
