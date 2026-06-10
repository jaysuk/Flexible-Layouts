import { describe, expect, it } from "vitest";

import { createEmptyDocument, createEmptyPage, type LayoutDocument } from "../src/model/document";
import { mergeImported } from "../src/model/io";

function docWithPages(...paths: Array<string>): LayoutDocument {
	const doc = createEmptyDocument();
	for (const p of paths) {
		doc.pages[p] = createEmptyPage("custom");
		doc.nav.order.push(p);
	}
	return doc;
}

describe("import merge (additive by default)", () => {
	it("keeps existing pages and adds the imported ones alongside them", () => {
		const current = docWithPages("/Plugins/FlexibleLayouts/p/mine");
		const imported = docWithPages("/Plugins/FlexibleLayouts/p/theirs");

		const merged = mergeImported(current, imported, { pages: "all" });
		expect(Object.keys(merged.pages).sort()).toEqual([
			"/Plugins/FlexibleLayouts/p/mine",
			"/Plugins/FlexibleLayouts/p/theirs",
		]);
		// Existing page stays first in the nav order; the imported one is appended.
		expect(merged.nav.order).toEqual([
			"/Plugins/FlexibleLayouts/p/mine",
			"/Plugins/FlexibleLayouts/p/theirs",
		]);
	});

	it("preserves existing hidden pages (union, not replace)", () => {
		const current = docWithPages("/Plugins/FlexibleLayouts/p/mine");
		current.nav.hidden = ["/Plugins/FlexibleLayouts/p/mine"];
		const imported = docWithPages("/Plugins/FlexibleLayouts/p/theirs");

		const merged = mergeImported(current, imported, {});
		expect(merged.nav.hidden).toContain("/Plugins/FlexibleLayouts/p/mine");
	});

	it("deletes current pages only when replaceExisting is set", () => {
		const current = docWithPages("/Plugins/FlexibleLayouts/p/mine");
		const imported = docWithPages("/Plugins/FlexibleLayouts/p/theirs");

		const merged = mergeImported(current, imported, { replaceExisting: true });
		expect(Object.keys(merged.pages)).toEqual(["/Plugins/FlexibleLayouts/p/theirs"]);
		expect(merged.nav.order).toEqual(["/Plugins/FlexibleLayouts/p/theirs"]);
	});

	it("overwrites a same-keyed page but never drops the others", () => {
		const current = docWithPages("/", "/Plugins/FlexibleLayouts/p/mine");
		current.pages["/"].title = "My dashboard";
		const imported = docWithPages("/");
		imported.pages["/"].title = "Imported dashboard";

		const merged = mergeImported(current, imported, { pages: "all" });
		expect(merged.pages["/"].title).toBe("Imported dashboard"); // same key replaced
		expect(merged.pages["/Plugins/FlexibleLayouts/p/mine"]).toBeTruthy(); // other page kept
	});
});
