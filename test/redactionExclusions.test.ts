import { afterEach, describe, expect, it } from "vitest";
import { DOMWrapper, type VueWrapper } from "@vue/test-utils";
import { mountInDwc } from "dwc-plugin-test-kit";

import RedactionSummary from "../src/configBackup/RedactionSummary.vue";

// Vuetify's v-dialog Teleports its content to the real document.body, which mountInDwc() never
// attaches its own root to (nor unmounts automatically) - left unmounted, a dialog's DOM nodes
// outlive the test that created them and pollute the next test's document.body queries. Track and
// unmount every wrapper.
let mounted: VueWrapper | null = null;
function mountTracked(...args: Parameters<typeof mountInDwc>): VueWrapper {
	mounted = mountInDwc(...args);
	return mounted;
}
afterEach(() => {
	mounted?.unmount();
	mounted = null;
});

/** Vuetify's v-dialog Teleports its content to the real document.body, outside mountInDwc's
 *  (detached) mount point - a VueWrapper's own find()/findAll() only searches its own tree, so
 *  dialog content has to be queried from document.body directly and wrapped for the same
 *  trigger()/attributes() API. */
function findInBody(selector: string): DOMWrapper<Element> | undefined {
	const el = document.body.querySelector(selector);
	return el ? new DOMWrapper(el) : undefined;
}
function findAllInBody(selector: string): Array<DOMWrapper<Element>> {
	return Array.from(document.body.querySelectorAll(selector)).map((el) => new DOMWrapper(el));
}

/**
 * dwc-config-backup-core's REDACTION-EXCLUSIONS-PLAN.md §7 - "a component test that the action
 * renders only for rows with excludableName". Covers the row-level gating, the strong-word
 * escalation, and the final emit - the actual redaction logic (which entries GET excludableName) is
 * core's job and tested there.
 *
 * dwc-plugin-test-kit's `registerPluginMessages` stub is a no-op (see its stubs/plugins.ts), so
 * `$t()` never resolves real English here - every assertion below matches the raw i18n key, which
 * IS what actually renders under this harness (see configBackup.smoke.test.ts, which never asserts
 * on rendered text at all for the same reason).
 */
const EXCLUDE_KEY = "plugins.flexibleLayouts.configBackup.redaction.excludeAction";
const CONFIRM_KEY = "plugins.flexibleLayouts.configBackup.redaction.excludeConfirmButton";

describe("RedactionSummary - exclude action", () => {
	const entries = [
		{ id: 0, path: "files/macros/bed.g", line: 2, tier: 3 as const, kind: "gcode-command" as const, code: "VAR", params: ["maxpass"], label: 'Variable "maxpass"', restoreHint: "credential" as const, excludableName: "maxpass" },
		{ id: 1, path: "files/sys/config.g", tier: 1 as const, kind: "gcode-command" as const, code: "M551", params: ["P"], label: "Machine password", restoreHint: "credential" as const },
	];

	async function mountExpanded(allowExclude: boolean) {
		const wrapper = mountTracked(RedactionSummary, { props: { entries, redacted: true, allowExclude } });
		// The table starts collapsed - open it, same as a real user would (this is the "Show
		// details"/"collapse" toggle; its own label is also a raw key here, irrelevant to this click).
		await wrapper.find("button").trigger("click");
		return wrapper;
	}

	it("shows no Exclude action when allowExclude is off, even for an excludable row", async () => {
		const wrapper = await mountExpanded(false);
		expect(wrapper.text()).not.toContain(EXCLUDE_KEY);
	});

	it("shows the Exclude action only on the row with excludableName, when allowExclude is on", async () => {
		const wrapper = await mountExpanded(true);
		const rows = wrapper.findAll("tbody tr");
		expect(rows).toHaveLength(2);
		expect(rows[0].text()).toContain(EXCLUDE_KEY); // maxpass - excludableName set
		expect(rows[1].text()).not.toContain(EXCLUDE_KEY); // M551 P - fixed param rule, not excludable
	});

	it("emits exclude with the name after a plain confirm", async () => {
		const wrapper = await mountExpanded(true);
		await wrapper.findAll("tbody tr")[0].find("button").trigger("click"); // open confirm dialog (teleported to body)
		const confirmBtn = findAllInBody("button").find((b) => b.text() === CONFIRM_KEY);
		expect(confirmBtn?.attributes("disabled")).toBeUndefined(); // plain name - no checkbox gate
		await confirmBtn?.trigger("click");
		expect(wrapper.emitted("exclude")).toEqual([["maxpass"]]);
	});

	it("gates the confirm button behind an acknowledgement checkbox for a strong credential word", async () => {
		const strongEntries = [
			{ id: 0, path: "files/sys/config.g", tier: 3 as const, kind: "json-value" as const, pointer: "/configTool/password", label: "JSON value at /configTool/password", restoreHint: "credential" as const, excludableName: "password" },
		];
		const wrapper = mountTracked(RedactionSummary, { props: { entries: strongEntries, redacted: true, allowExclude: true } });
		await wrapper.find("button").trigger("click"); // expand
		await wrapper.find("tbody tr button").trigger("click"); // open confirm dialog (teleported to body)

		const confirmBtn = findAllInBody("button").find((b) => b.text() === CONFIRM_KEY);
		expect(confirmBtn?.attributes("disabled")).toBeDefined();

		await findInBody('input[type="checkbox"]')?.setValue(true);
		expect(confirmBtn?.attributes("disabled")).toBeUndefined();
	});
});
