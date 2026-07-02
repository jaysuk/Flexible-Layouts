import { describe, expect, it } from "vitest";

import {
	backfillWidgetDefaults,
	createEmptyDocument,
	DOCUMENT_SCHEMA_VERSION,
	forEachWidget,
	type LayoutDocument,
	migrateDocument,
	type Widget,
} from "../src/model/document";

function sampleDoc(): LayoutDocument {
	return {
		schemaVersion: 0,
		meta: { name: "Old" },
		theme: { enabled: true, colors: { primary: "#123456" } },
		pages: {
			"/": {
				kind: "custom",
				grid: { cols: 12, rowHeight: 30 },
				items: [
					{ i: "a", x: 0, y: 0, w: 3, h: 3, widget: { type: "extruder" } as unknown as Widget },
					{
						i: "g", x: 0, y: 3, w: 6, h: 6,
						widget: { type: "group", title: "G", items: [
							{ i: "c", x: 0, y: 0, w: 3, h: 3, widget: { type: "value", omPath: "move.axes[0].userPosition" } as unknown as Widget },
						], cols: 12, rowHeight: 30 } as unknown as Widget,
					},
				],
				variants: { md: [{ i: "m", x: 0, y: 0, w: 3, h: 3, widget: { type: "fan" } as unknown as Widget }] },
			},
		},
		header: { items: [{ i: "h", x: 0, y: 0, w: 2, h: 1, widget: { type: "clock" } as unknown as Widget }] },
		statusHidden: true,
		nav: { order: ["/"], hidden: [] },
		dependencies: [],
	} as LayoutDocument;
}

describe("document migration", () => {
	it("returns a fresh document for corrupt/empty input without throwing", () => {
		expect(migrateDocument(undefined).schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(migrateDocument("nonsense").pages).toEqual({});
		expect(migrateDocument(42)).toEqual(createEmptyDocument());
	});

	it("normalises and stamps the current schema version while preserving user data", () => {
		const out = migrateDocument(sampleDoc());
		expect(out.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		expect(out.meta.name).toBe("Old");
		expect(out.theme.colors.primary).toBe("#123456");
		expect(out.statusHidden).toBe(true); // optional fields are carried through, not dropped
		expect(out.header?.items[0].widget.type).toBe("clock");
		expect(Object.keys(out.pages)).toEqual(["/"]);
	});

	it("forEachWidget visits page items, group children, responsive variants and header items", () => {
		const seen: Array<string> = [];
		forEachWidget(sampleDoc(), (w) => seen.push(w.type));
		expect(seen.sort()).toEqual(["clock", "extruder", "fan", "group", "value"].sort());
	});
});

describe("v3 -> v4 header chrome seeding", () => {
	it("seeds one of each new top-bar chrome widget alongside existing header items", () => {
		const out = migrateDocument(sampleDoc());
		const types = out.header?.items.map((it) => it.widget.type) ?? [];
		expect(types).toContain("clock"); // pre-existing pinned item preserved
		expect(types).toContain("accessChip");
		expect(types).toContain("codeInput");
		expect(types).toContain("editModeToggle");
		expect(types).toContain("uploadButton");
		// The edit/upload pair replicate their old right-hand position in the bar.
		const editItem = out.header?.items.find((it) => it.widget.type === "editModeToggle");
		const uploadItem = out.header?.items.find((it) => it.widget.type === "uploadButton");
		expect(editItem?.headerAlign).toBe("end");
		expect(uploadItem?.headerAlign).toBe("end");
	});

	it("never duplicates a chrome item that's already present (e.g. a user re-migrating, or one seeded before)", () => {
		const doc = sampleDoc();
		doc.header!.items.push({ i: "pre", x: 0, y: 0, w: 2, h: 1, widget: { type: "accessChip" } as unknown as Widget });
		const out = migrateDocument(doc);
		const accessChipCount = out.header?.items.filter((it) => it.widget.type === "accessChip").length;
		expect(accessChipCount).toBe(1);
	});

	it("creates a header block from scratch for a document that never had one", () => {
		const doc = sampleDoc();
		delete doc.header;
		const out = migrateDocument(doc);
		const types = out.header?.items.map((it) => it.widget.type) ?? [];
		expect(types).toEqual(expect.arrayContaining(["accessChip", "codeInput", "editModeToggle", "uploadButton"]));
	});
});

describe("backfillWidgetDefaults", () => {
	it("fills parameters added to a widget's template without overwriting existing values", () => {
		const w = { type: "extruder", feedrate: 999 } as unknown as Widget;
		backfillWidgetDefaults(w);
		const e = w as unknown as Record<string, unknown>;
		expect(e.feedrate).toBe(999); // user value kept
		expect(e.mode).toBe("length"); // missing param filled from the template
		expect(e.flowRate).toBe(5);
		expect(e.filamentDiameter).toBe(1.75);
		expect(e.amounts).toEqual([1, 5, 10, 50]);
	});

	it("never injects foreign keys into a widget type the template doesn't own (e.g. pluginPage)", () => {
		const w = { type: "pluginPage", pluginId: "X" } as unknown as Widget;
		backfillWidgetDefaults(w);
		expect("component" in (w as object)).toBe(false); // builtinPanel fallback must not leak in
	});

	it("does not overwrite a builtin panel's component", () => {
		const w = { type: "builtinPanel", component: "StatusPanel" } as unknown as Widget;
		backfillWidgetDefaults(w);
		expect((w as unknown as { component: string }).component).toBe("StatusPanel");
	});

	it("as a migration step, brings every widget (incl. nested group children) up to template", () => {
		const doc = migrateDocument(sampleDoc());
		forEachWidget(doc, backfillWidgetDefaults);
		const groupChild = doc.pages["/"].items[1].widget as Extract<Widget, { type: "group" }>;
		const child = groupChild.items[0].widget as unknown as Record<string, unknown>;
		expect(child.display).toBe("number"); // value widget template default backfilled
		expect(child.precision).toBe(1);
		expect(child.omPath).toBe("move.axes[0].userPosition"); // existing value preserved
	});
});
