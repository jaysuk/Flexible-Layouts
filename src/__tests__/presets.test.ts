import { describe, expect, it } from "vitest";

import { createHexPadPreset, createJogDialPreset } from "../util/presets";
import { type GridItemModel, migrateDocument, DOCUMENT_SCHEMA_VERSION } from "../model/document";
import { hexLayout, ringLayout } from "../util/shapes";

// ── Jog Dial preset ────────────────────────────────────────────────────────

describe("createJogDialPreset", () => {
	it("returns a group widget with layoutMode: free", () => {
		const item = createJogDialPreset();
		expect(item.widget.type).toBe("group");
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		expect(g.layoutMode).toBe("free");
	});

	it("contains at least 16 XY jog wedge buttons (8 inner + 8 outer)", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const wedges = g.items.filter(
			c => c.widget.type === "codeButton" && (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "wedge",
		);
		expect(wedges.length).toBeGreaterThanOrEqual(16);
	});

	it("contains a home circle button", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const homeCircle = g.items.find(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "circle"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).code?.includes("G28"),
		);
		expect(homeCircle).toBeDefined();
	});

	it("contains Z jog buttons", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const zBtns = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).code?.includes(" Z"),
		);
		expect(zBtns.length).toBeGreaterThanOrEqual(4);  // Z+step0, Z+step1, homeZ, Z-step1, Z-step0
	});

	it("all items have x/y/w/h in 0–100 percent range", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		for (const child of g.items) {
			expect(child.x).toBeGreaterThanOrEqual(-1);
			expect(child.y).toBeGreaterThanOrEqual(-1);
			// Allow small floating point overshoot
			expect(child.x + child.w).toBeLessThanOrEqual(101);
			expect(child.y + child.h).toBeLessThanOrEqual(101);
		}
	});

	it("wedge shape parameters have innerRadius < outerRadius", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		for (const child of g.items) {
			if (child.widget.type !== "codeButton") continue;
			const w = child.widget as Extract<typeof child.widget, { type: "codeButton" }>;
			if (w.shape?.kind !== "wedge") continue;
			expect(w.shape.innerRadius).toBeLessThan(w.shape.outerRadius!);
		}
	});

	it("wedge buttons centred on the group centre (50, 50)", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const wedges = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "wedge",
		);
		// All wedges should be the same cell, centred at 50%, 50%
		for (const w of wedges) {
			const cx = w.x + w.w / 2;
			const cy = w.y + w.h / 2;
			expect(cx).toBeCloseTo(50, 0);
			expect(cy).toBeCloseTo(50, 0);
		}
	});

	it("inner ring buttons have lower freeZ than outer ring buttons", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const wedges = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "wedge",
		);
		// Split into inner (freeZ=1) and outer (freeZ=2)
		const inner = wedges.filter(w => (w.freeZ ?? 0) === 1);
		const outer = wedges.filter(w => (w.freeZ ?? 0) === 2);
		expect(inner.length).toBe(8);
		expect(outer.length).toBe(8);
	});

	it("inner and outer ring radii don't overlap (perfect nesting)", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const wedges = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "wedge",
		);
		const innerWedges = wedges.filter(w => (w.freeZ ?? 0) === 1);
		const outerWedges = wedges.filter(w => (w.freeZ ?? 0) === 2);
		if (innerWedges.length === 0 || outerWedges.length === 0) return;
		const firstInner = (innerWedges[0].widget as Extract<typeof innerWedges[0].widget, { type: "codeButton" }>).shape as { kind: "wedge"; innerRadius: number; outerRadius: number };
		const firstOuter = (outerWedges[0].widget as Extract<typeof outerWedges[0].widget, { type: "codeButton" }>).shape as { kind: "wedge"; innerRadius: number; outerRadius: number };
		// Outer ring's inner radius should be ≥ inner ring's outer radius (no gap or exact match)
		expect(firstOuter.innerRadius).toBeGreaterThanOrEqual(firstInner.outerRadius - 0.01);
	});

	it("each XY jog button code contains G91 and G1", () => {
		const item = createJogDialPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const xyBtns = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "wedge",
		);
		for (const btn of xyBtns) {
			const code = (btn.widget as Extract<typeof btn.widget, { type: "codeButton" }>).code;
			expect(code).toContain("G91");
			expect(code).toContain("G1");
		}
	});
});

// ── Hex Pad preset ─────────────────────────────────────────────────────────

describe("createHexPadPreset", () => {
	it("returns a group widget with layoutMode: free", () => {
		const item = createHexPadPreset();
		expect(item.widget.type).toBe("group");
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		expect(g.layoutMode).toBe("free");
	});

	it("contains 6 hex polygon buttons", () => {
		const item = createHexPadPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const hexBtns = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "polygon",
		);
		expect(hexBtns.length).toBe(6);
	});

	it("hex buttons are placed at positions consistent with hexLayout()", () => {
		const item = createHexPadPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const hexBtns = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "polygon",
		);
		// centres should roughly match hexLayout output (within a few %)
		const SPACING = 32;
		const ORIGIN_X = 16;
		const ORIGIN_Y = 18;
		const positions = hexLayout({
			cols: 3,
			count: 6,
			spacing: SPACING,
			orientation: "pointy",
			originX: ORIGIN_X,
			originY: ORIGIN_Y,
		});
		expect(hexBtns.length).toBe(positions.length);
		for (let i = 0; i < hexBtns.length; i++) {
			const btn = hexBtns[i];
			const pos = positions[i];
			const cx = btn.x + btn.w / 2;
			const cy = btn.y + btn.h / 2;
			expect(cx).toBeCloseTo(pos.x, 0);
			expect(cy).toBeCloseTo(pos.y, 0);
		}
	});

	it("all hex button cells have identical size (uniform tiling)", () => {
		const item = createHexPadPreset();
		const g = item.widget as Extract<typeof item.widget, { type: "group" }>;
		const hexBtns = g.items.filter(
			c => c.widget.type === "codeButton"
				&& (c.widget as Extract<typeof c.widget, { type: "codeButton" }>).shape?.kind === "polygon",
		);
		const { w: w0, h: h0 } = hexBtns[0];
		for (const btn of hexBtns) {
			expect(btn.w).toBeCloseTo(w0, 3);
			expect(btn.h).toBeCloseTo(h0, 3);
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

	it("preserves layoutMode: free on a v3 document after re-migration", () => {
		const freePreset = createJogDialPreset();
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
	});
});

// ── ringLayout / hexLayout geometry helpers ─────────────────────────────────

describe("ringLayout — used by jog dial preset", () => {
	it("places items at the correct angles and radius (8-arm ring)", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 25, count: 8 });
		expect(items.length).toBe(8);
		// Each consecutive item should be 45° around the circle
		// y increases going down (clockwise from top)
		const topItem = items[0];  // 0° = top = Y-
		expect(topItem.y).toBeCloseTo(50 - 25, 0);   // top of circle
		expect(topItem.x).toBeCloseTo(50, 0);         // centred horizontally
	});

	it("returns zero rotation when faceOutward is false (default)", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 25, count: 4 });
		for (const item of items) {
			expect(item.rotation).toBe(0);
		}
	});
});
