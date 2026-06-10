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
