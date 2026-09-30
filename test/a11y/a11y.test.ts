import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { mountInDwc, setConnected } from "dwc-plugin-test-kit";

import PropertiesDialog from "../../src/editor/PropertiesDialog.vue";
import { createDefaultWidget } from "../../src/model/document";
import { FREEFORM_WIDGETS } from "../../src/widgets/registry";
import WidgetView from "../../src/widgets/WidgetView.vue";
import { A11Y_ALLOWLIST } from "./allowlist";
import { axeViolations } from "./axe";

/**
 * Accessibility net (MISSING-FEATURES-PLAN §B8 step 1): mount every registered widget with its defaults, and
 * its Properties dialog, and run axe-core over the result. New widgets are covered automatically, like
 * `widgets.smoke.test.ts`. Colour contrast needs a layout engine and runs in the Playwright e2e instead.
 */
function check(subject: string, found: string[]) {
	const allowed = A11Y_ALLOWLIST[subject] ?? [];
	expect(found.filter((r) => !allowed.includes(r)), `new axe violations in ${subject}`).toEqual([]);
	expect(allowed.filter((r) => !found.includes(r)), `${subject}: allowlisted violations that are now fixed - remove them`).toEqual([]);
}

describe("axe: widgets with default config", () => {
	for (const entry of FREEFORM_WIDGETS) {
		it(entry.type, async () => {
			setConnected(true);
			const wrapper = mountInDwc(WidgetView, { props: { widget: createDefaultWidget(entry.type) } });
			const host = document.createElement("div");
			try {
				// Widgets load through async components; let them settle before auditing.
				await flushPromises();
				await new Promise((r) => setTimeout(r, 0));
				await flushPromises();
				// `attachTo` renders nothing into a host under the test kit, so audit the rendered markup.
				host.innerHTML = wrapper.html();
				document.body.appendChild(host);
				expect(host.innerHTML.length, "widget did not render").toBeGreaterThan(20);
				check(`widget:${entry.type}`, await axeViolations(host));
			} finally {
				wrapper.unmount();
				host.remove();
			}
		});
	}
});

describe("axe: Properties dialog per widget type", () => {
	for (const entry of FREEFORM_WIDGETS) {
		it(entry.type, async () => {
			const item = { i: "a11y", x: 0, y: 0, w: 4, h: 4, widget: createDefaultWidget(entry.type) };
			const wrapper = mountInDwc(PropertiesDialog, { props: { modelValue: false, item, attach: true } });
			const host = document.createElement("div");
			try {
				await wrapper.setProps({ modelValue: true });
				await flushPromises();
				// The dialog's content is not reachable through `document` under the test kit (it lives in the
				// wrapper's own tree), so audit the rendered markup, re-parented into a real element.
				host.innerHTML = wrapper.html();
				document.body.appendChild(host);
				// Guard against a vacuous pass: the dialog's own controls must actually be in the markup.
				expect(host.querySelectorAll("button").length, "dialog content did not render").toBeGreaterThan(0);
				check(`properties:${entry.type}`, await axeViolations(host));
			} finally {
				wrapper.unmount();
				host.remove();
			}
		});
	}
});

describe("axe harness self-check", () => {
	it("flags an unnamed icon button, so a silent no-op harness cannot pass", async () => {
		const host = document.createElement("div");
		host.innerHTML = `<button><i class="mdi mdi-close"></i></button>`;
		document.body.appendChild(host);
		expect(await axeViolations(host)).toContain("button-name");
		host.remove();
	});
});
