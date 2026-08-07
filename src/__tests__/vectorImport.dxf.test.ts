import { describe, expect, it } from "vitest";

import { importDxf } from "../model/vectorImport/dxf";

// A DXF is strictly alternating code/value LINES. Any stray leading newline shifts every
// pair by one and the whole file parses as garbage - build fixtures only via this.
function dxf(...pairs: Array<[number | string, string]>): string {
	return pairs.map(([c, v]) => `${c}\n${v}`).join("\n");
}
function entitiesFile(...body: Array<[number | string, string]>): string {
	return dxf([0, "SECTION"], [2, "ENTITIES"], ...body, [0, "ENDSEC"], [0, "EOF"]);
}
function withInsunits(insunits: string, ...body: Array<[number | string, string]>): string {
	return dxf(
		[0, "SECTION"], [2, "HEADER"], [9, "$INSUNITS"], [70, insunits], [0, "ENDSEC"],
		[0, "SECTION"], [2, "ENTITIES"], ...body, [0, "ENDSEC"], [0, "EOF"],
	);
}

describe("importDxf - entity geometry", () => {
	it("LINE becomes one open 2-point path", () => {
		const result = importDxf(entitiesFile([0, "LINE"], [10, "0"], [20, "0"], [11, "10"], [21, "0"]), { tolerance: 0.02, name: "l.dxf" });
		expect(result.paths).toHaveLength(1);
		expect(result.paths[0].closed).toBe(false);
		expect(result.paths[0].points).toHaveLength(2);
	});

	it("CIRCLE becomes a closed polygon whose vertices sit exactly on the circle", () => {
		const result = importDxf(entitiesFile([0, "CIRCLE"], [10, "0"], [20, "0"], [40, "10"]), { tolerance: 0.02, name: "c.dxf" });
		expect(result.paths).toHaveLength(1);
		const poly = result.paths[0];
		expect(poly.closed).toBe(true);
		// Every remaining point is a subset of the originally sampled points (RDP simplification
		// never introduces new points), and sampleArc places each one exactly on the true circle -
		// so this holds regardless of how many points simplify() kept.
		for (const [x, y] of poly.points) {
			expect(Math.hypot(x, y)).toBeCloseTo(10, 6);
		}
	});

	it("ARC sweeps from its start angle to its end angle", () => {
		const result = importDxf(entitiesFile([0, "ARC"], [10, "0"], [20, "0"], [40, "5"], [50, "0"], [51, "90"]), { tolerance: 0.02, name: "a.dxf" });
		const poly = result.paths[0];
		expect(poly.closed).toBe(false);
		expect(poly.points[0][0]).toBeCloseTo(5, 6);
		expect(poly.points[0][1]).toBeCloseTo(0, 6);
		expect(poly.points[poly.points.length - 1][0]).toBeCloseTo(0, 6);
		expect(poly.points[poly.points.length - 1][1]).toBeCloseTo(5, 6);
	});

	it("LWPOLYLINE bulge produces a real arc, not a chamfer (the single most-missed part of a DXF importer)", () => {
		// Bulge 1 between (0,0) and (10,0) is a true semicircle, radius 5 - a naive importer that
		// ignores bulges would draw a straight line here instead.
		const file = entitiesFile(
			[0, "LWPOLYLINE"], [70, "0"],
			[10, "0"], [20, "0"], [42, "1"],
			[10, "10"], [20, "0"],
		);
		const result = importDxf(file, { tolerance: 0.02, name: "b.dxf" });
		const poly = result.paths[0];
		const maxDeviation = Math.max(...poly.points.map(([, y]) => Math.abs(y)));
		expect(maxDeviation).toBeCloseTo(5, 1);
	});

	it("LWPOLYLINE with bit 1 of group 70 set is closed", () => {
		const file = entitiesFile(
			[0, "LWPOLYLINE"], [70, "1"],
			[10, "0"], [20, "0"],
			[10, "10"], [20, "0"],
			[10, "10"], [20, "10"],
		);
		const result = importDxf(file, { tolerance: 0.02, name: "b2.dxf" });
		expect(result.paths[0].closed).toBe(true);
	});

	it("POLYLINE + VERTEX + SEQEND (the old form) reads the same as LWPOLYLINE", () => {
		const file = entitiesFile(
			[0, "POLYLINE"], [70, "0"],
			[0, "VERTEX"], [10, "0"], [20, "0"],
			[0, "VERTEX"], [10, "10"], [20, "0"],
			[0, "SEQEND"],
		);
		const result = importDxf(file, { tolerance: 0.02, name: "p.dxf" });
		expect(result.paths).toHaveLength(1);
		expect(result.paths[0].points).toEqual([[0, 0], [10, 0]]);
	});

	it("SPLINE with weights encoding a circular arc keeps every vertex equidistant from the centre", () => {
		// Standard rational-quadratic NURBS quarter circle: control points (1,0),(1,1),(0,1) with
		// weights 1, sqrt(2)/2, 1 trace a true 90 degree arc of the unit circle. Getting the weight
		// handling wrong (treating this as a non-rational spline) would bulge this outward past r=1.
		const file = entitiesFile(
			[0, "SPLINE"], [70, "0"], [71, "2"],
			[40, "0"], [40, "0"], [40, "0"], [40, "1"], [40, "1"], [40, "1"],
			[41, "1"], [41, "0.70710678118655"], [41, "1"],
			[10, "1"], [20, "0"],
			[10, "1"], [20, "1"],
			[10, "0"], [20, "1"],
		);
		const result = importDxf(file, { tolerance: 0.02, name: "s.dxf" });
		const poly = result.paths[0];
		expect(poly.closed).toBe(false);
		for (const [x, y] of poly.points) {
			expect(Math.hypot(x, y)).toBeCloseTo(1, 2);
		}
	});

	it("INSERT (block reference) is reported, never silently cut in the wrong place", () => {
		const file = entitiesFile([0, "INSERT"], [2, "BLOCK1"], [10, "0"], [20, "0"]);
		const result = importDxf(file, { tolerance: 0.02, name: "i.dxf" });
		expect(result.paths).toHaveLength(0);
		expect(result.warnings.some((w) => w.includes("explode blocks"))).toBe(true);
	});

	it("an unknown entity type is counted in a skipped-entity warning", () => {
		const file = entitiesFile([0, "HATCH"], [10, "0"], [20, "0"]);
		const result = importDxf(file, { tolerance: 0.02, name: "h.dxf" });
		expect(result.warnings.some((w) => w.includes("HATCH"))).toBe(true);
	});
});

describe("importDxf - $INSUNITS", () => {
	it("reads millimetres", () => {
		const result = importDxf(withInsunits("4", [0, "LINE"], [10, "0"], [20, "0"], [11, "1"], [21, "0"]), { tolerance: 0.02, name: "mm.dxf" });
		expect(result.units).toBe("mm");
		expect(result.mmPerUnit).toBe(1);
	});

	it("reads inches", () => {
		const result = importDxf(withInsunits("1", [0, "LINE"], [10, "0"], [20, "0"], [11, "1"], [21, "0"]), { tolerance: 0.02, name: "in.dxf" });
		expect(result.units).toBe("in");
		expect(result.mmPerUnit).toBe(25.4);
	});

	it("assumes millimetres and warns when $INSUNITS is unset entirely", () => {
		const result = importDxf(entitiesFile([0, "LINE"], [10, "0"], [20, "0"], [11, "1"], [21, "0"]), { tolerance: 0.02, name: "u.dxf" });
		expect(result.units).toBe("unknown");
		expect(result.mmPerUnit).toBe(1);
		expect(result.warnings.some((w) => w.includes("$INSUNITS"))).toBe(true);
	});

	it("centimetres compute the right scale even though DrawingUnits can't label them precisely (documented quirk)", () => {
		const result = importDxf(withInsunits("5", [0, "LINE"], [10, "0"], [20, "0"], [11, "1"], [21, "0"]), { tolerance: 0.02, name: "cm.dxf" });
		expect(result.mmPerUnit).toBe(10);
		expect(result.units).toBe("unknown"); // DrawingUnits is only 'mm' | 'in' | 'unknown' - this is a known label gap, not a scale bug
	});
});

describe("importDxf - tolerance is interpreted in millimetres (regression for the source-units bug)", () => {
	it("an inch drawing gets the same fine tolerance as an equivalent mm drawing, not 25.4x coarser", () => {
		// Before the fix, a 0.02 "mm" tolerance was used raw as 0.02 SOURCE units - on an inch file
		// that's 0.508mm, giving a visibly faceted ~16-gon for a full circle. After the fix it's
		// divided by mmPerUnit (25.4) first, giving a genuinely fine polygon (~80 segments).
		const result = importDxf(withInsunits("1", [0, "CIRCLE"], [10, "0"], [20, "0"], [40, "1"]), { tolerance: 0.02, name: "inch-circle.dxf" });
		expect(result.paths[0].points.length).toBeGreaterThan(40);
	});
});

describe("importDxf - malformed input", () => {
	it("throws a clear error when there's no ENTITIES section at all", () => {
		expect(() => importDxf("not a dxf file", { tolerance: 0.02, name: "bad.dxf" })).toThrow(/DXF/);
	});

	it("still parses correctly despite a leading blank line (regression for the tokenizer desync bug)", () => {
		const file = "\n" + entitiesFile([0, "LINE"], [10, "0"], [20, "0"], [11, "1"], [21, "0"]);
		const result = importDxf(file, { tolerance: 0.02, name: "leading-blank.dxf" });
		expect(result.paths).toHaveLength(1);
	});
});
