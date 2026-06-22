import { describe, expect, it } from "vitest";

import {
	createDefaultWidget,
	createEmptyDocument,
	DOCUMENT_SCHEMA_VERSION,
	type GridItemModel,
	migrateDocument,
	reidItem,
	sanitizeRuntimeFields,
	stripItemRuntimeFields,
} from "../model/document";

describe("sanitizeRuntimeFields", () => {
	function item(extra: Record<string, unknown> = {}): GridItemModel {
		return { i: "a", x: 0, y: 0, w: 2, h: 2, widget: { type: "builtinPanel", component: "MovementPanel" }, ...extra } as GridItemModel;
	}

	it("strips the transient `moved` flag from an item, keeping real fields", () => {
		const it0 = item({ moved: false, fit: true });
		stripItemRuntimeFields(it0);
		expect("moved" in it0).toBe(false);
		expect(it0.fit).toBe(true);
	});

	it("recurses into group children", () => {
		const group = item({ widget: { type: "group", title: "g", items: [item({ moved: true })] } });
		stripItemRuntimeFields(group);
		const child = (group.widget as { items: Array<Record<string, unknown>> }).items[0];
		expect("moved" in child).toBe(false);
	});

	it("walks pages, responsive variants and the header", () => {
		const doc = createEmptyDocument();
		doc.pages["/Dashboard"] = {
			kind: "override", grid: { cols: 12, rowHeight: 30 },
			items: [item({ moved: false })],
			variants: { sm: [item({ moved: true })] },
		};
		doc.header = { items: [item({ moved: false })] };
		sanitizeRuntimeFields(doc);
		expect("moved" in doc.pages["/Dashboard"].items[0]).toBe(false);
		expect("moved" in doc.pages["/Dashboard"].variants!.sm![0]).toBe(false);
		expect("moved" in doc.header.items[0]).toBe(false);
	});
});

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

	it("round-trips a page background (colour + SD image source)", () => {
		const doc = createEmptyDocument();
		doc.pages["/Dashboard"] = {
			kind: "custom",
			grid: { cols: 12, rowHeight: 30 },
			items: [],
			background: { color: "primary", image: "0:/www/img/bg.png", imageSource: "sd", size: "contain" },
		};
		const out = migrateDocument(doc);
		expect(out.pages["/Dashboard"].background).toEqual({
			color: "primary", image: "0:/www/img/bg.png", imageSource: "sd", size: "contain",
		});
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
