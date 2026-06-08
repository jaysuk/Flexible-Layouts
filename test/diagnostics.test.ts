import { describe, expect, it, beforeEach } from "vitest";
import { loadObjectModel, mountInDwc, setConnected, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../src/model/document";
import WidgetView from "../src/widgets/WidgetView.vue";
import {
	buildReport,
	clearErrors,
	getErrors,
	recordError,
	reportToJson,
	sanitizeModel,
} from "dwc-plugin-runtime";

describe("diagnostics report", () => {
	beforeEach(() => clearErrors());

	it("records errors into a capped ring buffer", () => {
		for (let i = 0; i < 30; i++) recordError("test", new Error(`e${i}`));
		const errs = getErrors();
		expect(errs.length).toBe(25);
		expect(errs[errs.length - 1].message).toBe("e29"); // newest kept
		expect(errs[0].message).toBe("e5"); // oldest dropped
	});

	it("scrubs network details, serials and file names but keeps structure", () => {
		const model = loadObjectModel({
			network: { hostname: "duet3", name: "myprinter", interfaces: [{ actualIP: "192.168.1.50", mac: "AA:BB", ssid: "Home", state: "active" }] },
			boards: [{ uniqueId: "SECRET-SERIAL", firmwareVersion: "3.7.0", firmwareName: "RRF" }],
			job: { lastFileName: "0:/gcodes/private.gcode", file: { fileName: "0:/gcodes/private.gcode" } },
			state: { status: "idle" },
		}, { mapGlobals: false });
		const clean = sanitizeModel(model) as any;
		expect(clean.network.hostname).toBe("<redacted>");
		expect(clean.network.interfaces[0].actualIP).toBe("<redacted>");
		expect(clean.network.interfaces[0].mac).toBe("<redacted>");
		expect(clean.network.interfaces[0].state).toBe("active"); // non-sensitive kept
		expect(clean.boards[0].uniqueId).toBe("<redacted>");
		expect(clean.boards[0].firmwareVersion).toBe("3.7.0"); // kept
		expect(clean.job.lastFileName).toBe("<redacted>");
	});

	it("derives versions from model.plugins + boards and serialises a Map global", () => {
		const model = loadObjectModel({
			boards: [{ firmwareName: "RepRapFirmware", firmwareVersion: "3.7.0-beta" }],
			plugins: { FlexibleLayouts: { version: "9.9.9", dwcVersion: "3.7.0" } },
			global: { myVar: 7 },
			state: { status: "idle" },
		});
		const report = buildReport({ pluginId: "FlexibleLayouts", model });
		expect(report.plugin).toEqual({ id: "FlexibleLayouts", version: "9.9.9" });
		expect(report.dwcVersion).toBe("3.7.0");
		expect(report.firmware).toEqual({ name: "RepRapFirmware", version: "3.7.0-beta" });
		// Map `global` survives serialisation as an object (not {}).
		expect(reportToJson(report)).toContain("\"myVar\": 7");
	});

	// The payoff loop: a captured report's state.widget + model replay straight into a mount test.
	it("a captured failing-widget report reproduces as a mount test", () => {
		setConnected(true);
		setModel(loadObjectModel());
		const report = buildReport({
			pluginId: "FlexibleLayouts",
			model: loadObjectModel(),
			state: { widget: createDefaultWidget("jog") },
		});
		const capturedWidget = (report.state as { widget: ReturnType<typeof createDefaultWidget> }).widget;
		const w = mountInDwc(WidgetView, { props: { widget: capturedWidget } });
		expect(w.find(".jog-root").exists()).toBe(true);
	});
});
