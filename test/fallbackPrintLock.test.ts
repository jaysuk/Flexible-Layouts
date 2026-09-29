import { describe, expect, it } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { defineComponent, h } from "vue";

import FlexPage from "../src/page/FlexPage.vue";
import { BUILTIN_PAGES } from "../src/model/builtinPages";

// Regression: the un-customised stock Console page used to be interaction-locked for the whole
// print (the fallback lock was unconditional), so you couldn't answer a M291 prompt, run M122,
// or tune anything from the console mid-print. Only fallbacks that can move the machine lock now.
const Stock = defineComponent({ render: () => h("div", { class: "stock-content" }) });

function setStatus(status: string): void {
	(dwc.model as unknown as { state: Record<string, unknown> }).state.status = status;
}

function mountFallback(lockFallbackWhilePrinting?: boolean) {
	return mountInDwc(FlexPage, {
		props: { pageId: "/Test", kind: "override", fallback: Stock, lockFallbackWhilePrinting },
	});
}

describe("stock fallback print lock", () => {
	it("locks a motion-capable fallback (the default) while printing", () => {
		setStatus("processing");
		expect(mountFallback().find(".flex-interaction-lock").exists()).toBe(true);
	});

	it("does not lock a fallback that opted out, even while printing", () => {
		setStatus("processing");
		const w = mountFallback(false);
		expect(w.find(".stock-content").exists()).toBe(true);
		expect(w.find(".flex-interaction-lock").exists()).toBe(false);
	});

	it("does not lock anything while idle", () => {
		setStatus("idle");
		expect(mountFallback().find(".flex-interaction-lock").exists()).toBe(false);
	});

	it("registers Console and Temperatures as unlocked, Dashboard and Macros as locked", () => {
		const locks = Object.fromEntries(BUILTIN_PAGES.map((d) => [d.pageId, d.lockWhilePrinting !== false]));
		expect(locks).toEqual({ "/Dashboard": true, "/Console": false, "/Temperatures": false, "/Macros": true });
	});
});
