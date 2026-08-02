import { describe, expect, it } from "vitest";

import {
	cellPosition, gridStats, parseHeightmap, serializeHeightmap, setCell,
} from "../model/bedMesh/heightmap";

// A hand-built fixture matching RRF's writer byte-for-byte (Grid.cpp: SaveToFile / WriteHeadingAndParameters),
// deliberately sized and valued so the statistics are exact by hand (no rounding ambiguity):
//   probed values: 0.100, -0.050, 0.000, -0.000, 0.200  (row1's third cell is UNPROBED)
//   sum=0.250, mean=0.050, min=-0.050, max=0.200, population deviation=sqrt(0.008)=0.089...
const FIXTURE =
	"RepRapFirmware height map file v2 generated at 2026-01-01 00:00, min error -0.050, max error 0.200, mean 0.050, deviation 0.089\n" +
	"axis0,axis1,min0,max0,min1,max1,radius,spacing0,spacing1,num0,num1\n" +
	"X,Y,5.00,25.00,5.00,15.00,-1.00,10.00,10.00,3,2\n" +
	"  0.100, -0.050,  0.000\n" +
	" -0.000,  0.200,      0\n";

describe("parseHeightmap", () => {
	it("parses geometry, letters and generatedAt", () => {
		const hm = parseHeightmap(FIXTURE)!;
		expect(hm).not.toBeNull();
		expect(hm.meta).toEqual({
			letters: ["X", "Y"], min: [5, 5], max: [25, 15], radius: -1,
			spacing: [10, 10], num: [3, 2],
		});
		expect(hm.generatedAt).toBe("2026-01-01 00:00");
	});

	it("parses the value grid in row-major [row][col] order", () => {
		const hm = parseHeightmap(FIXTURE)!;
		expect(hm.rows).toEqual([
			[0.1, -0.05, 0],
			[-0, 0.2, null],
		]);
	});

	// The exact regression this module exists to prevent: a bare "0" (no decimal point) is RRF's
	// marker for "never probed", written that way specifically so it's distinguishable on reload.
	it("treats a bare 0 as unprobed (null), not a real zero reading", () => {
		const hm = parseHeightmap(FIXTURE)!;
		expect(hm.rows[1][2]).toBeNull();
	});

	// A probed reading of exactly zero DOES carry a decimal point and must NOT be treated as unprobed.
	it("treats a decimal-point zero as a real probed reading", () => {
		const hm = parseHeightmap(FIXTURE)!;
		expect(hm.rows[0][2]).toBe(0);
		expect(hm.rows[0][2]).not.toBeNull();
	});

	// (-0).toFixed(3) silently drops the sign in JS - parseFloat does not have this problem, but it's
	// worth pinning that the parsed value really is signed, since serialisation depends on it.
	it("preserves the sign of a negative-zero reading", () => {
		const hm = parseHeightmap(FIXTURE)!;
		expect(Object.is(hm.rows[1][0], -0)).toBe(true);
	});

	it("returns null, never throws, for malformed input", () => {
		expect(parseHeightmap("")).toBeNull();
		expect(parseHeightmap("not a heightmap at all")).toBeNull();
		expect(parseHeightmap("RepRapFirmware height map file v2 generated at x\nnonsense label line\n1,2,3\n")).toBeNull();
	});

	it("returns null when a promised row is missing (truncated file)", () => {
		const truncated = FIXTURE.split("\n").slice(0, 4).join("\n"); // drop the second value row
		expect(parseHeightmap(truncated)).toBeNull();
	});

	// DWC's own HeightMap viewer still tolerates the two older label-line variants, and a machine that
	// hasn't re-probed since a firmware update may still have one on the card.
	it("parses the legacy (pre-3.3) label-line variant", () => {
		const legacy =
			"RepRapFirmware height map file v1 generated at 2020-01-01 00:00, min error 0.000, max error 0.000, mean 0.000, deviation 0.000\n" +
			"xmin,xmax,ymin,ymax,radius,spacing,xnum,ynum\n" +
			"5.00,25.00,5.00,15.00,-1.00,10.00,3,2\n" +
			"  0.100,  0.200,  0.300\n" +
			"  0.400,  0.500,  0.600\n";
		const hm = parseHeightmap(legacy)!;
		expect(hm).not.toBeNull();
		expect(hm.meta).toEqual({
			letters: ["X", "Y"], min: [5, 5], max: [25, 15], radius: -1,
			spacing: [10, 10], num: [3, 2],
		});
	});

	it("parses the 3.3-beta1 label-line variant (separate x/y spacing)", () => {
		const beta1 =
			"RepRapFirmware height map file v2 generated at 2021-01-01 00:00, min error 0.000, max error 0.000, mean 0.000, deviation 0.000\n" +
			"xmin,xmax,ymin,ymax,radius,xspacing,yspacing,xnum,ynum\n" +
			"5.00,25.00,5.00,15.00,-1.00,10.00,5.00,3,3\n" +
			"  0.100,  0.100,  0.100\n" +
			"  0.100,  0.100,  0.100\n" +
			"  0.100,  0.100,  0.100\n";
		const hm = parseHeightmap(beta1)!;
		expect(hm.meta.spacing).toEqual([10, 5]);
		expect(hm.meta.num).toEqual([3, 3]);
	});
});

describe("gridStats", () => {
	it("computes population mean/min/max/deviation over PROBED cells only", () => {
		const hm = parseHeightmap(FIXTURE)!;
		const stats = gridStats(hm);
		expect(stats.min).toBeCloseTo(-0.05, 6);
		expect(stats.max).toBeCloseTo(0.2, 6);
		expect(stats.mean).toBeCloseTo(0.05, 6);
		expect(stats.deviation).toBeCloseTo(Math.sqrt(0.008), 6);
		expect(stats.probedCount).toBe(5);
		expect(stats.totalCount).toBe(6);
	});
});

describe("cellPosition", () => {
	it("derives spacing from bounds rather than trusting the file's rounded spacing field", () => {
		const hm = parseHeightmap(FIXTURE)!;
		// True spacing here happens to be an exact 10.00, so this alone wouldn't catch a derivation
		// bug - the real regression (rounded 19.33 landing short of the true edge) is exercised below.
		expect(cellPosition(hm.meta, 0, 0)).toEqual({ axis0: 5, axis1: 5 });
		expect(cellPosition(hm.meta, 1, 2)).toEqual({ axis0: 25, axis1: 15 });
	});

	it("lands exactly on max at the last index even when the file's stored spacing is rounded", () => {
		// 290mm over 16 points: true spacing 19.3333..., but RRF's file stores it rounded to "19.33".
		// Stepping the ROUNDED value 15 times would land at 5 + 15*19.33 = 294.95, ~0.05mm short.
		const meta = { letters: ["X", "Y"] as [string, string], min: [5, 5] as [number, number], max: [295, 295] as [number, number], radius: -1, spacing: [19.33, 19.33] as [number, number], num: [16, 16] as [number, number] };
		expect(cellPosition(meta, 0, 15).axis0).toBe(295);
		expect(cellPosition(meta, 15, 0).axis1).toBe(295);
	});
});

describe("setCell", () => {
	it("edits the target cell without mutating the source heightmap", () => {
		const hm = parseHeightmap(FIXTURE)!;
		const edited = setCell(hm, 1, 2, 0.075);
		expect(edited.rows[1][2]).toBe(0.075);
		expect(hm.rows[1][2]).toBeNull(); // original untouched
	});

	it("can clear a cell back to unprobed", () => {
		const hm = parseHeightmap(FIXTURE)!;
		const edited = setCell(hm, 0, 0, null);
		expect(edited.rows[0][0]).toBeNull();
		expect(hm.rows[0][0]).toBe(0.1);
	});
});

describe("serializeHeightmap", () => {
	// The single most important test in this module: a real RRF file, parsed and re-serialised,
	// reproduces the source BYTE FOR BYTE. This pins the field width, the bare-comma join, the
	// -0.000 sign, and the recomputed statistics all at once.
	it("round-trips the fixture byte-for-byte", () => {
		const hm = parseHeightmap(FIXTURE)!;
		expect(serializeHeightmap(hm)).toBe(FIXTURE);
	});

	it("writes an edited cell and recomputes the header statistics", () => {
		const hm = parseHeightmap(FIXTURE)!;
		const edited = setCell(hm, 1, 2, 0.4); // was unprobed; now the new max
		const out = serializeHeightmap(edited);
		expect(out).toContain("max error 0.400");
		expect(out).toContain(" -0.000,  0.200,  0.400\n");
	});

	it("always writes the CURRENT label line, even for a parsed legacy file", () => {
		const legacy =
			"RepRapFirmware height map file v1 generated at 2020-01-01 00:00, min error 0.000, max error 0.000, mean 0.000, deviation 0.000\n" +
			"xmin,xmax,ymin,ymax,radius,spacing,xnum,ynum\n" +
			"5.00,25.00,5.00,15.00,-1.00,10.00,3,2\n" +
			"  0.100,  0.100,  0.100\n" +
			"  0.100,  0.100,  0.100\n";
		const out = serializeHeightmap(parseHeightmap(legacy)!);
		expect(out).toContain("axis0,axis1,min0,max0,min1,max1,radius,spacing0,spacing1,num0,num1\n");
	});
});
