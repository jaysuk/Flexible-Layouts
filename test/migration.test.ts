import { describe, expect, it } from "vitest";

import {
	backfillWidgetDefaults,
	createEmptyDocument,
	DOCUMENT_SCHEMA_VERSION,
	forEachWidget,
	type GridItemModel,
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

describe("v3 -> v5 header chrome seeding (free x/y/w/h positions)", () => {
	it("seeds one of each new top-bar chrome widget alongside existing header items, clamped on-canvas", () => {
		const out = migrateDocument(sampleDoc());
		const types = out.header?.items.map((it) => it.widget.type) ?? [];
		expect(types).toContain("clock"); // pre-existing pinned item preserved
		expect(types).toContain("codeInput");
		expect(types).toContain("editModeToggle");
		expect(types).toContain("uploadButton");
		// The edit/upload pair replicate their old right-hand position in the bar.
		const editItem = out.header?.items.find((it) => it.widget.type === "editModeToggle");
		const uploadItem = out.header?.items.find((it) => it.widget.type === "uploadButton");
		expect(editItem!.x).toBeGreaterThan(50);
		expect(uploadItem!.x).toBeGreaterThan(50);
		// Nothing seeded outside the 0-100% canvas.
		for (const it of out.header?.items ?? []) {
			expect(it.x).toBeGreaterThanOrEqual(0);
			expect(it.x + it.w).toBeLessThanOrEqual(100.001);
		}
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
		expect(types).toEqual(expect.arrayContaining(["codeInput", "editModeToggle", "uploadButton"]));
	});

	it("converts a real v1.4.0-shaped document (headerWidth/headerAlign) into free x/y/w/h, start-aligned items first", () => {
		// v1.4.0's original v3->v4 step (and the header editor's own "+" button, which existed since
		// before either the chrome widgets or free positioning) always set headerWidth on every item -
		// this is what a document that already went through that release actually looks like on disk.
		const doc = sampleDoc();
		doc.schemaVersion = 4;
		doc.header = {
			items: [
				{ i: "clock", x: 0, y: 0, w: 2, h: 1, widget: { type: "clock" }, headerWidth: 90 } as unknown as GridItemModel,
				{ i: "chip", x: 0, y: 0, w: 2, h: 1, widget: { type: "accessChip" }, headerWidth: 100 } as unknown as GridItemModel,
				{ i: "edit", x: 0, y: 0, w: 2, h: 1, widget: { type: "editModeToggle" }, headerWidth: 110, headerAlign: "end" } as unknown as GridItemModel,
			],
		};
		const out = migrateDocument(doc);
		const items = out.header!.items;
		expect(items).toHaveLength(3);
		// headerWidth/headerAlign are gone; every item got real free x/y/w/h instead.
		for (const it of items) {
			expect((it as unknown as { headerWidth?: number }).headerWidth).toBeUndefined();
			expect(it.w).toBeGreaterThan(0);
			expect(it.x).toBeGreaterThanOrEqual(0);
			expect(it.x + it.w).toBeLessThanOrEqual(100.001);
		}
		// Start-aligned items (clock, chip) come before the end-aligned one (edit) left-to-right,
		// replicating their old left/right grouping as a starting point.
		const byId = Object.fromEntries(items.map((it) => [it.i, it]));
		expect(byId.clock.x).toBeLessThan(byId.edit.x);
		expect(byId.chip.x).toBeLessThan(byId.edit.x);
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

	it("v5 -> v6: splits jog/octopusJog's legacy xyFeedrate into independent xFeedrate/yFeedrate", () => {
		const doc = sampleDoc();
		doc.schemaVersion = 5;
		doc.pages["/"].items.push(
			{ i: "j", x: 0, y: 6, w: 5, h: 8, widget: { type: "jog", xyFeedrate: 2400 } as unknown as Widget },
			{ i: "o", x: 5, y: 6, w: 6, h: 9, widget: { type: "octopusJog", xyFeedrate: 1800 } as unknown as Widget },
		);
		const out = migrateDocument(doc);
		expect(out.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);

		const jog = out.pages["/"].items.find((it) => it.i === "j")!.widget as unknown as Record<string, unknown>;
		expect(jog.xFeedrate).toBe(2400);
		expect(jog.yFeedrate).toBe(2400); // old combined value carried into BOTH - identical behaviour until split
		expect("xyFeedrate" in jog).toBe(false);

		const oct = out.pages["/"].items.find((it) => it.i === "o")!.widget as unknown as Record<string, unknown>;
		expect(oct.xFeedrate).toBe(1800);
		expect(oct.yFeedrate).toBe(1800);
		expect("xyFeedrate" in oct).toBe(false);
	});

	it("v5 -> v6: a jog widget with no legacy xyFeedrate (already-default or already-migrated) is untouched", () => {
		const doc = sampleDoc();
		doc.schemaVersion = 5;
		doc.pages["/"].items.push(
			{ i: "j2", x: 0, y: 6, w: 5, h: 8, widget: { type: "jog", xFeedrate: 500, yFeedrate: 700 } as unknown as Widget },
		);
		const out = migrateDocument(doc);
		const jog = out.pages["/"].items.find((it) => it.i === "j2")!.widget as unknown as Record<string, unknown>;
		expect(jog.xFeedrate).toBe(500);
		expect(jog.yFeedrate).toBe(700);
	});

	it("v6 -> v7: converts a retired jobControl widget in place to the builtin JobControlPanel", () => {
		const doc = sampleDoc();
		doc.schemaVersion = 6;
		doc.pages["/"].items.push(
			{ i: "jc", x: 0, y: 6, w: 4, h: 4, widget: { type: "jobControl", showProgress: true, color: "warning" } as unknown as Widget },
		);
		const out = migrateDocument(doc);
		expect(out.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);

		const item = out.pages["/"].items.find((it) => it.i === "jc")!;
		// Grid position/size is untouched - only the widget payload itself converts.
		expect(item.x).toBe(0);
		expect(item.y).toBe(6);
		expect(item.w).toBe(4);
		expect(item.h).toBe(4);

		const widget = item.widget as unknown as Record<string, unknown>;
		expect(widget.type).toBe("builtinPanel");
		expect(widget.component).toBe("JobControlPanel");
		expect("showProgress" in widget).toBe(false); // no equivalent on the builtin panel
		expect("color" in widget).toBe(false);
	});

	it("v8 -> v9: clears a macros widget's stale hard-coded '0:/macros' folder so the OM-aware fallback takes over", () => {
		const doc = sampleDoc();
		doc.schemaVersion = 8;
		doc.pages["/"].items.push(
			{ i: "m1", x: 0, y: 8, w: 4, h: 4, widget: { type: "macros", folder: "0:/macros", columns: 2 } as unknown as Widget },
			// A deliberately-typed custom folder must survive untouched - only the exact old default clears.
			{ i: "m2", x: 4, y: 8, w: 4, h: 4, widget: { type: "macros", folder: "0:/macros/Filament", columns: 2 } as unknown as Widget },
		);
		const out = migrateDocument(doc);
		expect(out.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);

		const w1 = out.pages["/"].items.find((it) => it.i === "m1")!.widget as unknown as Record<string, unknown>;
		expect(w1.folder).toBe("");
		const w2 = out.pages["/"].items.find((it) => it.i === "m2")!.widget as unknown as Record<string, unknown>;
		expect(w2.folder).toBe("0:/macros/Filament");
	});
});
