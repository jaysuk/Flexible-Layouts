import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../model/document";
import { MAINTENANCE_DAEMON_FILE, MAINTENANCE_DAEMON_MACRO, MAINTENANCE_MACRO_FOLDER } from "../model/maintenance/macros";
import WidgetView from "../widgets/WidgetView.vue";

// The test-kit's machine stub doesn't implement download() at all (this widget is the first thing in
// the repo to need it in a test) - wrap the real stub and add just enough of one to resolve the
// deployed-macro-version check the widget makes on mount, matching how it looks up the daemon macro
// text on a real machine (see model/configBackup/machineIO.ts's downloadText).
vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => {
			const real = actual.useMachineStore();
			return {
				...real,
				async download(options: { filename: string }) {
					if (options.filename === `${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`) {
						return MAINTENANCE_DAEMON_MACRO;
					}
					throw new Error("not found");
				},
			};
		},
	};
});

function mountMaintenance() {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget("maintenanceWidget") } });
}

describe("MaintenanceWidget - mode-aware stats (FFF vs CNC/laser)", () => {
	it("shows print hours / filament used / tool changes on an FFF machine, not spindle hours", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				state: { machineMode: "FFF", currentTool: 0 },
				global: { flMaintPrintSec: 7200, flMaintFilamentMm: 15500, flMaintToolChanges: 3 },
			},
		}));
		const w = mountMaintenance();
		await flushPromises();
		await flushPromises(); // second tick: onMounted's own async chain has more than one await
		expect(w.text()).toContain("plugins.flexibleLayouts.maintenance.printHours");
		expect(w.text()).toContain("plugins.flexibleLayouts.maintenance.filamentUsed");
		expect(w.text()).toContain("plugins.flexibleLayouts.maintenance.toolChanges");
		expect(w.text()).not.toContain("plugins.flexibleLayouts.maintenance.spindleHours");
		expect(w.text()).toContain("2.0"); // 7200s -> 2.0h
		expect(w.text()).toContain("15.5 m"); // 15500mm -> 15.5m
	});

	it("shows spindle hours on a CNC machine, not the FFF stats", async () => {
		setModel(loadObjectModel(undefined, {
			overrides: {
				state: { machineMode: "CNC", currentTool: -1 },
				global: { flMaintSpindleSec: 3600 },
			},
		}));
		const w = mountMaintenance();
		await flushPromises();
		await flushPromises();
		expect(w.text()).toContain("plugins.flexibleLayouts.maintenance.spindleHours");
		expect(w.text()).not.toContain("plugins.flexibleLayouts.maintenance.printHours");
		expect(w.text()).not.toContain("plugins.flexibleLayouts.maintenance.filamentUsed");
		expect(w.text()).not.toContain("plugins.flexibleLayouts.maintenance.toolChanges");
		expect(w.text()).toContain("1.0"); // 3600s -> 1.0h
	});
});
