import { describe, expect, it } from "vitest";
import { loadObjectModel, mountInDwc, setModel } from "dwc-plugin-test-kit";

import { createDefaultWidget } from "../model/document";
import WidgetView from "../widgets/WidgetView.vue";

function mountHealth() {
	return mountInDwc(WidgetView, { props: { widget: createDefaultWidget("machineHealth") } });
}

describe("MachineHealthWidget - probe display", () => {
	it("shows a load-cell probe's force in grams, with the raw counts alongside", () => {
		setModel(loadObjectModel(undefined, {
			overrides: { sensors: { probes: [{ type: 8, value: [12000], threshold: 50, loadCell: { force: 62.4 } }] } },
		}));
		const w = mountHealth();
		expect(w.text()).toContain("62.4 g");
		expect(w.text()).toContain("(12000)");
	});

	it("falls back to raw counts only for a non-load-cell probe (no regression)", () => {
		setModel(loadObjectModel(undefined, {
			overrides: { sensors: { probes: [{ type: 1, value: [456], threshold: 500 }] } },
		}));
		const w = mountHealth();
		expect(w.text()).toContain("456");
		expect(w.text()).not.toContain(" g");
	});
});
