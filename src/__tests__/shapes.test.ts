import { describe, expect, it } from "vitest";

import {
	hexLayout,
	polar,
	ringLayout,
	sectorPath,
	shapePath,
	type Box,
} from "../util/shapes";

const BOX: Box = { w: 100, h: 100 };
const RECT_BOX: Box = { w: 120, h: 60 };

// Helper: count occurrences of "L" and "M" in a path to approximate vertex count.
function countMoves(d: string): number { return (d.match(/[ML]/g) ?? []).length; }

describe("shapePath — each shape returns a non-empty string", () => {
	it("rect (no radius)", () => {
		const d = shapePath({ kind: "rect" }, BOX);
		expect(d.length).toBeGreaterThan(0);
		expect(d).toContain("Z");
	});

	it("rect (with radius)", () => {
		const d = shapePath({ kind: "rect", rx: 8 }, BOX);
		expect(d).toContain("Q");
	});

	it("pill", () => {
		const d = shapePath({ kind: "pill" }, RECT_BOX);
		expect(d.length).toBeGreaterThan(0);
	});

	it("squircle", () => {
		const d = shapePath({ kind: "squircle" }, BOX);
		expect(d).toContain("C");
	});

	it("circle", () => {
		const d = shapePath({ kind: "circle" }, BOX);
		expect(d).toContain("A");
	});

	it("ellipse", () => {
		const d = shapePath({ kind: "ellipse" }, RECT_BOX);
		expect(d).toContain("A");
	});

	it("polygon — triangle (3 vertices)", () => {
		const d = shapePath({ kind: "polygon", sides: 3 }, BOX);
		// M + 2 L commands = 3 vertices
		expect(countMoves(d)).toBe(3);
	});

	it("polygon — hexagon (6 vertices)", () => {
		const d = shapePath({ kind: "polygon", sides: 6 }, BOX);
		expect(countMoves(d)).toBe(6);
	});

	it("polygon — octagon (8 vertices)", () => {
		const d = shapePath({ kind: "polygon", sides: 8 }, BOX);
		expect(countMoves(d)).toBe(8);
	});

	it("star — 5 points (10 total vertices in path)", () => {
		const d = shapePath({ kind: "star", points: 5 }, BOX);
		expect(countMoves(d)).toBe(10);
	});

	it("wedge — returns a non-empty path with arc commands", () => {
		const d = shapePath({ kind: "wedge", startAngle: 0, sweepAngle: 45, innerRadius: 0.3, outerRadius: 1.0 }, BOX);
		expect(d).toContain("A");
		expect(d.length).toBeGreaterThan(10);
	});

	it("chevron", () => {
		const d = shapePath({ kind: "chevron" }, BOX);
		expect(d).toContain("Z");
	});

	it("arrow", () => {
		const d = shapePath({ kind: "arrow" }, BOX);
		expect(d).toContain("Z");
	});

	it("diamond", () => {
		const d = shapePath({ kind: "diamond" }, BOX);
		expect(d).toContain("Z");
	});

	it("trapezoid", () => {
		const d = shapePath({ kind: "trapezoid" }, BOX);
		expect(d).toContain("Z");
	});

	it("polygonPoints — custom 3-pt triangle", () => {
		const d = shapePath({ kind: "polygonPoints", points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }, BOX);
		expect(d).toContain("Z");
	});

	it("path — passthrough", () => {
		const custom = "M10 10 L90 10 L50 90 Z";
		const d = shapePath({ kind: "path", d: custom }, BOX);
		expect(d).toBe(custom);
	});
});

describe("wedge inner/outer radii", () => {
	it("wedge with innerRadius 0 starts at centre", () => {
		// When inner radius = 0, the path should start near the centre
		const d = shapePath({ kind: "wedge", startAngle: 0, sweepAngle: 90, innerRadius: 0, outerRadius: 1 }, BOX);
		expect(d.length).toBeGreaterThan(0);
	});

	it("wedge with non-zero innerRadius differs from zero innerRadius", () => {
		const d0 = shapePath({ kind: "wedge", startAngle: 0, sweepAngle: 90, innerRadius: 0, outerRadius: 1 }, BOX);
		const d1 = shapePath({ kind: "wedge", startAngle: 0, sweepAngle: 90, innerRadius: 0.3, outerRadius: 1 }, BOX);
		expect(d0).not.toBe(d1);
	});
});

describe("polar helper", () => {
	it("angle 0 (up) returns point directly above centre", () => {
		const [x, y] = polar(50, 50, 10, 0);
		expect(x).toBeCloseTo(50, 5);
		expect(y).toBeCloseTo(40, 5);
	});

	it("angle 90 (right) returns point directly right of centre", () => {
		const [x, y] = polar(50, 50, 10, 90);
		expect(x).toBeCloseTo(60, 5);
		expect(y).toBeCloseTo(50, 5);
	});

	it("angle 180 (down) returns point directly below centre", () => {
		const [x, y] = polar(50, 50, 10, 180);
		expect(x).toBeCloseTo(50, 5);
		expect(y).toBeCloseTo(60, 5);
	});
});

describe("sectorPath", () => {
	it("returns a path with two arc commands", () => {
		const d = sectorPath(50, 50, 0, 45, 10, 30);
		const arcCount = (d.match(/A/g) ?? []).length;
		expect(arcCount).toBe(2);
	});
});

describe("ringLayout", () => {
	it("returns exactly count items", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 30, count: 8 });
		expect(items).toHaveLength(8);
	});

	it("items are spaced at equal angles (8 items = 45° apart)", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 30, count: 8, startAngle: 0 });
		// First item should be directly above centre (angle 0 = up)
		expect(items[0].x).toBeCloseTo(50, 3);
		expect(items[0].y).toBeCloseTo(20, 3);
		// Second item should be 45° clockwise (right+up diagonal)
		const [ex, ey] = polar(50, 50, 30, 45);
		expect(items[1].x).toBeCloseTo(ex, 3);
		expect(items[1].y).toBeCloseTo(ey, 3);
	});

	it("faceOutward sets rotation equal to the item angle", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 30, count: 4, startAngle: 0, faceOutward: true });
		expect(items[0].rotation).toBeCloseTo(0, 5);
		expect(items[1].rotation).toBeCloseTo(90, 5);
		expect(items[2].rotation).toBeCloseTo(180, 5);
		expect(items[3].rotation).toBeCloseTo(270, 5);
	});

	it("without faceOutward, rotation is always 0", () => {
		const items = ringLayout({ cx: 50, cy: 50, radius: 30, count: 6 });
		for (const item of items) {
			expect(item.rotation).toBe(0);
		}
	});
});

describe("hexLayout", () => {
	it("returns exactly count items", () => {
		const items = hexLayout({ cols: 3, count: 7, spacing: 30 });
		expect(items).toHaveLength(7);
	});

	it("first item is at the origin", () => {
		const items = hexLayout({ cols: 3, count: 3, spacing: 30, originX: 10, originY: 20 });
		expect(items[0].x).toBeCloseTo(10, 5);
		expect(items[0].y).toBeCloseTo(20, 5);
	});

	it("items in the same row differ only in x", () => {
		const items = hexLayout({ cols: 3, count: 3, spacing: 30, originX: 0, originY: 0 });
		expect(items[0].y).toBeCloseTo(items[1].y, 5);
		expect(items[0].y).toBeCloseTo(items[2].y, 5);
	});

	it("flat-top orientation produces different positions than pointy", () => {
		const pointy = hexLayout({ cols: 3, count: 6, spacing: 30, orientation: "pointy" });
		const flat = hexLayout({ cols: 3, count: 6, spacing: 30, orientation: "flat" });
		// At least one item should differ
		const differs = pointy.some((p, i) => Math.abs(p.x - flat[i].x) > 0.01 || Math.abs(p.y - flat[i].y) > 0.01);
		expect(differs).toBe(true);
	});
});
