import { describe, expect, it } from "vitest";

import {
	createDefaultWidget,
	createEmptyDocument,
	DOCUMENT_SCHEMA_VERSION,
	type GridItemModel,
	migrateDocument,
	reidItem,
} from "../model/document";

describe("migrateDocument", () => {
	it("returns a valid empty document for junk input", () => {
		expect(migrateDocument(null).schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(migrateDocument(42).pages).toEqual({});
		expect(migrateDocument("nope").dependencies).toEqual([]);
	});

	it("preserves a well-formed document's pages and meta", () => {
		const doc = createEmptyDocument();
		doc.meta.name = "My Layout";
		doc.pages["/Dashboard"] = { kind: "override", grid: { cols: 12, rowHeight: 30 }, items: [] };
		const out = migrateDocument(doc);
		expect(out.meta.name).toBe("My Layout");
		expect(out.pages["/Dashboard"]).toBeDefined();
		expect(out.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
	});
});

describe("reidItem", () => {
	it("assigns fresh ids recursively through groups", () => {
		const item: GridItemModel = {
			i: "a", x: 0, y: 0, w: 6, h: 6,
			widget: {
				type: "group",
				items: [{ i: "b", x: 0, y: 0, w: 2, h: 2, widget: { type: "label", variant: "text", content: "hi" } }],
			},
		};
		const clone = reidItem(item);
		expect(clone.i).not.toBe("a");
		const inner = (clone.widget as Extract<GridItemModel["widget"], { type: "group" }>).items[0];
		expect(inner.i).not.toBe("b");
		// Original is untouched.
		expect(item.i).toBe("a");
	});
});

describe("createDefaultWidget", () => {
	it("produces the right discriminant per type", () => {
		expect(createDefaultWidget("codeButton").type).toBe("codeButton");
		expect(createDefaultWidget("value").type).toBe("value");
		expect(createDefaultWidget("group").type).toBe("group");
		expect(createDefaultWidget("builtinPanel").type).toBe("builtinPanel");
	});
});
