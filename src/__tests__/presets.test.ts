import { describe, expect, it } from "vitest";

import { createHexPadPreset } from "../util/presets";
import { type GridItemModel, migrateDocument, DOCUMENT_SCHEMA_VERSION } from "../model/document";
import { ringLayout } from "../util/shapes";

// ── Hex Pad preset ─────────────────────────────────────────────────────────

describe("createHexPadPreset", () => {
	it("returns a group widget with layoutMode: free", () => {
		const item = createHexPadPreset();
		expect(item.widget.type).toBe("group");
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		expect(g.layoutMode).toBe("free");
	});

	it("contains 6 hex polygon buttons of uniform size", () => {
		const item = createHexPadPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const hexes = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "polygon",
		);
		expect(hexes.length).toBe(6);
		const { w: w0, h: h0 } = hexes[0];
		for (const b of hexes) {
			expect(b.w).toBeCloseTo(w0, 3);
			expect(b.h).toBeCloseTo(h0, 3);
		}
	});

	it("lays the hexes out in offset rows that don't overlap horizontally (honeycomb)", () => {
		const item = createHexPadPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const hexes = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "polygon",
		);
		const cx = (b: GridItemModel): number => b.x + b.w / 2;
		const cy = (b: GridItemModel): number => b.y + b.h / 2;
		const row0 = hexes.filter(b => cy(b) < 35).map(cx).sort((a, b) => a - b);
		const row1 = hexes.filter(b => cy(b) >= 35).map(cx).sort((a, b) => a - b);
		expect(row0.length).toBe(3);
		expect(row1.length).toBe(3);
		const colGap = row0[1] - row0[0];
		expect(row0[2] - row0[1]).toBeCloseTo(colGap, 0);   // uniform column spacing
		expect(colGap).toBeGreaterThan(hexes[0].w);         // gap > cell width → no horizontal overlap
		expect(row1[0] - row0[0]).toBeCloseTo(colGap / 2, 0); // alternate rows offset by half a column
	});

	it("all items have x/y/w/h within the 0–100 percent box", () => {
		const item = createHexPadPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		for (const child of g.items) {
			expect(child.x).toBeGreaterThanOrEqual(0);
			expect(child.y).toBeGreaterThanOrEqual(0);
			expect(child.x + child.w).toBeLessThanOrEqual(101);
			expect(child.y + child.h).toBeLessThanOrEqual(101);
		}
	});
});

// ── Migration: existing grid groups unaffected ──────────────────────────────

describe("migrateDocument — free-mode back-compat", () => {
	it("leaves an existing grid group's layoutMode undefined (schema v2→v3)", () => {
		const rawDoc = {
			schemaVersion: 2,
			meta: { name: "Old Layout" },
			theme: { enabled: false, colors: {} },
			pages: {
				"/Dashboard": {
					kind: "override" as const,
					grid: { cols: 12, rowHeight: 30 },
					items: [
						{
							i: "g1", x: 0, y: 0, w: 6, h: 6,
							widget: {
								type: "group",
								title: "My Group",
								items: [],
								cols: 12,
								rowHeight: 30,
								// no layoutMode — this is an old grid group
							},
						},
					],
				},
			},
			nav: { order: [], hidden: [] },
			dependencies: [],
		};

		const migrated = migrateDocument(rawDoc);
		expect(migrated.schemaVersion).toBe(DOCUMENT_SCHEMA_VERSION);
		const group = migrated.pages["/Dashboard"].items[0].widget as Extract<typeof migrated.pages["/Dashboard"]["items"][0]["widget"], { type: "group" }>;
		// layoutMode should still be absent/undefined — the group renders as grid, untouched
		expect(group.layoutMode).toBeUndefined();
	});

	it("preserves a free-mode group (layoutMode + freeRotation/freeZ children) through migration", () => {
		const freePreset = createHexPadPreset();
		const rawDoc = {
			schemaVersion: DOCUMENT_SCHEMA_VERSION,
			meta: { name: "Free Layout" },
			theme: { enabled: false, colors: {} },
			pages: {
				"/Dashboard": {
					kind: "override" as const,
					grid: { cols: 12, rowHeight: 30 },
					items: [freePreset],
				},
			},
			nav: { order: [], hidden: [] },
			dependencies: [],
		};

		const migrated = migrateDocument(rawDoc);
		const group = migrated.pages["/Dashboard"].items[0].widget as Extract<typeof migrated.pages["/Dashboard"]["items"][0]["widget"], { type: "group" }>;
		expect(group.layoutMode).toBe("free");
		// A shaped child survives untouched.
		const child = group.items[0] as GridItemModel;
		expect((child.widget as Extract<typeof child.widget, { type: "codeButton" }>).shape?.kind).toBe("polygon");
	});
});

// ── ringLayout geometry helper (used by the auto-arrange tool) ───────────────

describe("ringLayout — used by the auto-arrange tool", () => {
	it("places items at the correct angles and radius (8-arm ring)", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 25, count: 8 });
		expect(items.length).toBe(8);
		const topItem = items[0];  // 0° = top
		expect(topItem.y).toBeCloseTo(50 - 25, 0);
		expect(topItem.x).toBeCloseTo(50, 0);
	});

	it("returns zero rotation when faceOutward is false (default)", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 25, count: 4 });
		for (const item of items) {
			expect(item.rotation).toBe(0);
		}
	});
});
