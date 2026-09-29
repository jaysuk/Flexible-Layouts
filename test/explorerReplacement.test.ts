import { describe, expect, it } from "vitest";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

import ExplorerPanel from "../src/widgets/ExplorerPanel.vue";
import ExplorerFallback from "../src/page/fallbacks/ExplorerFallback.vue";
import { EXPLORER_PAGE, builtinPages } from "../src/model/builtinPages";

describe("builtinPages", () => {
	it("leaves the Explorer native by default", () => {
		expect(builtinPages(false).map((d) => d.pageId)).not.toContain("/Explorer");
	});

	it("adds the Explorer replacement, matching DWC's route pattern, when asked", () => {
		const pages = builtinPages(true);
		expect(pages).toContain(EXPLORER_PAGE);
		// both spellings vue-router has used for the catch-all; existingRoutePaths picks the one DWC has
		expect(EXPLORER_PAGE.paths).toEqual(["/Explorer/:tab?/:volume?/:path*", "/Explorer/:tab?/:volume?/:path(.*)?"]);
	});

	it("makes the replacement full-page by default, and never print-locks a file editor", () => {
		expect(EXPLORER_PAGE.fullPage).toBe(true);
		expect(EXPLORER_PAGE.lockWhilePrinting).toBe(false);
	});
});

describe("ExplorerPanel target", () => {
	it("opens a file target in an editor tab", async () => {
		const w = mountInDwc(ExplorerPanel, { props: { target: { kind: "editor", path: "0:/sys/config.g" } } });
		await nextTick();
		expect(w.text()).toContain("config.g");
	});

	it("keeps browsing for a directory target (no editor tab)", async () => {
		const w = mountInDwc(ExplorerPanel, { props: { target: { kind: "directory", path: "0:/macros" } } });
		await nextTick();
		expect(w.findAll(".v-tab")).toHaveLength(0); // a lone browser tab renders no tab bar
	});
});

describe("ExplorerFallback", () => {
	it("mounts, following the current route", async () => {
		Object.assign(dwc.route, { path: "/Explorer/edit/sys/config.g", params: { tab: "edit", volume: "sys", path: "config.g" } });
		const w = mountInDwc(ExplorerFallback);
		await nextTick();
		expect(w.text()).toContain("config.g");
	});
});
