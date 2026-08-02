/**
 * Pure parser/serialiser for RepRapFirmware's bed height-map CSV format. No Vue/DWC imports - unit
 * tested directly against RRF's own writer semantics (`Grid.cpp` in Duet3D/RepRapFirmware), not
 * against any particular consumer.
 *
 * File shape (three header lines, then one line per axis1 row):
 *   RepRapFirmware height map file v2 generated at <when>, min error <a>, max error <b>, mean <c>, deviation <d>
 *   axis0,axis1,min0,max0,min1,max1,radius,spacing0,spacing1,num0,num1
 *   X,Y,5.00,25.00,5.00,15.00,-1.00,10.00,10.00,3,2
 *     0.100, -0.050,  0.000
 *
 * Three real gotchas this module exists to get right (each cost someone a bug before):
 *  - Cell fields are right-padded to 7 chars and joined by a bare comma - the visible ", " is the
 *    NEXT field's own padding, not part of the separator.
 *  - An unprobed cell is written as a bare "0" with NO decimal point ("so we can tell when we reload
 *    it" - RRF's own comment); a probed reading of exactly zero always carries ".000". Presence of a
 *    decimal point is the only reliable discriminator, and unprobed cells must be excluded from the
 *    statistics or a delta bed's un-probeable corners silently corrupt the mean/deviation.
 *  - `(-0).toFixed(3)` returns "0.000" in JS, silently erasing the sign of a point that measured
 *    just below zero. Must special-case with `Object.is(v, -0)`.
 */

export interface HeightmapMeta {
	/** Axis letters, e.g. ['X', 'Y']. Almost always XY but not hardcoded - some machines probe other axis pairs. */
	letters: [string, string];
	min: [number, number];
	max: [number, number];
	radius: number;
	/** Spacing as stored in the file (rounded to 2dp by RRF's writer). NOT used for cell positions -
	 *  see cellPosition()'s doc comment - kept only so a round-trip preserves the exact source bytes. */
	spacing: [number, number];
	/** [num0, num1] = [columns, rows]. */
	num: [number, number];
}

export interface Heightmap {
	meta: HeightmapMeta;
	/** The "generated at ..." timestamp text verbatim, or "" if the comment line didn't have one. */
	generatedAt: string;
	/** `num[1]` rows of `num[0]` values. `null` = unprobed. */
	rows: Array<Array<number | null>>;
}

export interface GridStats {
	min: number;
	max: number;
	mean: number;
	/** Population standard deviation (divisor n, not n-1) - matches RRF's own Deviation class. */
	deviation: number;
	probedCount: number;
	totalCount: number;
}

const COMMENT_PREFIX = "RepRapFirmware height map file";

// Oldest first, so CheckHeading-style matching (first match wins) mirrors RRF's own ordering. Index
// is also the "version" used to decide how many parameter fields the params line carries.
const LABEL_LINES = [
	"xmin,xmax,ymin,ymax,radius,spacing,xnum,ynum",
	"xmin,xmax,ymin,ymax,radius,xspacing,yspacing,xnum,ynum",
	"axis0,axis1,min0,max0,min1,max1,radius,spacing0,spacing1,num0,num1",
] as const;
const CURRENT_LABEL_VERSION = LABEL_LINES.length - 1;

function splitLines(text: string): Array<string> {
	return text.split(/\r\n|\r|\n/);
}

function parseParamsLine(line: string, version: number): HeightmapMeta | null {
	const fields = line.split(",");
	if (version === 0) {
		// xmin,xmax,ymin,ymax,radius,spacing,xnum,ynum - shared spacing for both axes, letters implicit XY.
		if (fields.length < 8) { return null; }
		const [xmin, xmax, ymin, ymax, radius, spacing, xnum, ynum] = fields.map(Number);
		if ([xmin, xmax, ymin, ymax, radius, spacing, xnum, ynum].some(Number.isNaN)) { return null; }
		return { letters: ["X", "Y"], min: [xmin, ymin], max: [xmax, ymax], radius, spacing: [spacing, spacing], num: [xnum, ynum] };
	}
	if (version === 1) {
		// xmin,xmax,ymin,ymax,radius,xspacing,yspacing,xnum,ynum
		if (fields.length < 9) { return null; }
		const [xmin, xmax, ymin, ymax, radius, xspacing, yspacing, xnum, ynum] = fields.map(Number);
		if ([xmin, xmax, ymin, ymax, radius, xspacing, yspacing, xnum, ynum].some(Number.isNaN)) { return null; }
		return { letters: ["X", "Y"], min: [xmin, ymin], max: [xmax, ymax], radius, spacing: [xspacing, yspacing], num: [xnum, ynum] };
	}
	// axis0,axis1,min0,max0,min1,max1,radius,spacing0,spacing1,num0,num1
	if (fields.length < 11) { return null; }
	const [l0, l1, ...rest] = fields;
	const [min0, max0, min1, max1, radius, spacing0, spacing1, num0, num1] = rest.map(Number);
	if (!l0 || !l1 || [min0, max0, min1, max1, radius, spacing0, spacing1, num0, num1].some(Number.isNaN)) { return null; }
	return { letters: [l0, l1], min: [min0, min1], max: [max0, max1], radius, spacing: [spacing0, spacing1], num: [num0, num1] };
}

function parseCell(raw: string): number | null {
	const text = raw.trim();
	// A probed reading always carries ".000"-style precision; RRF writes an unprobed cell as a bare
	// "0" specifically so this is distinguishable on reload (see Grid.cpp's own comment).
	if (!text.includes(".")) {
		return null;
	}
	const value = Number(text);
	return Number.isNaN(value) ? null : value;
}

/** Parse a height-map CSV. Never throws - malformed input returns null. */
export function parseHeightmap(csv: string): Heightmap | null {
	if (typeof csv !== "string" || !csv.trim()) {
		return null;
	}
	const lines = splitLines(csv);
	if (lines.length < 3) {
		return null;
	}
	const [commentLine, labelLine, paramsLine, ...rest] = lines;
	if (!commentLine.startsWith(COMMENT_PREFIX)) {
		return null;
	}
	const version = LABEL_LINES.findIndex((l) => labelLine.startsWith(l));
	if (version === -1) {
		return null;
	}
	const meta = parseParamsLine(paramsLine, version);
	if (!meta || meta.num[0] <= 0 || meta.num[1] <= 0) {
		return null;
	}

	const generatedAtMatch = /generated at ([^,]+)/.exec(commentLine);
	const generatedAt = generatedAtMatch ? generatedAtMatch[1].trim() : "";

	const rows: Array<Array<number | null>> = [];
	for (let r = 0; r < meta.num[1]; r++) {
		const line = rest[r];
		if (line === undefined) {
			return null; // fewer rows than the header promised - truncated/corrupt file
		}
		const cells = line.split(",");
		if (cells.length < meta.num[0]) {
			return null;
		}
		rows.push(cells.slice(0, meta.num[0]).map(parseCell));
	}

	return { meta, generatedAt, rows };
}

/** Population mean/min/max/deviation over PROBED cells only - see the module doc for why unprobed
 *  cells (null) must be excluded rather than treated as zero. */
export function gridStats(hm: Heightmap): GridStats {
	const totalCount = hm.meta.num[0] * hm.meta.num[1];
	const values: Array<number> = [];
	for (const row of hm.rows) {
		for (const v of row) {
			if (v !== null) {
				values.push(v);
			}
		}
	}
	if (values.length === 0) {
		return { min: 0, max: 0, mean: 0, deviation: 0, probedCount: 0, totalCount };
	}
	let min = Infinity;
	let max = -Infinity;
	let sum = 0;
	for (const v of values) {
		if (v < min) { min = v; }
		if (v > max) { max = v; }
		sum += v;
	}
	const mean = sum / values.length;
	let sumSquaredDeviation = 0;
	for (const v of values) {
		const d = v - mean;
		sumSquaredDeviation += d * d;
	}
	const deviation = Math.sqrt(sumSquaredDeviation / values.length);
	return { min, max, mean, deviation, probedCount: values.length, totalCount };
}

/**
 * A cell's real-world position. Deliberately DERIVED from (min, max, num) rather than reading the
 * file's stored `spacing`, which RRF rounds to 2dp - stepping that rounded value `num - 1` times can
 * land noticeably short of `max` (a 290mm span over 16 points stores as "19.33", not the true
 * 19.3333...; walked 15 times that's ~0.05mm off). The grid's bounds are exact; its spacing field is not.
 */
export function cellPosition(meta: HeightmapMeta, row: number, col: number): { axis0: number; axis1: number } {
	const step0 = meta.num[0] > 1 ? (meta.max[0] - meta.min[0]) / (meta.num[0] - 1) : 0;
	const step1 = meta.num[1] > 1 ? (meta.max[1] - meta.min[1]) / (meta.num[1] - 1) : 0;
	return { axis0: meta.min[0] + col * step0, axis1: meta.min[1] + row * step1 };
}

/** Cell edit, applied immutably: returns a new Heightmap: only the touched row is cloned. */
export function setCell(hm: Heightmap, row: number, col: number, value: number | null): Heightmap {
	const rows = hm.rows.slice();
	const targetRow = rows[row]?.slice();
	if (!targetRow) {
		return hm; // out-of-range edit is a caller bug, not something to throw for mid-session
	}
	targetRow[col] = value;
	rows[row] = targetRow;
	return { ...hm, rows };
}

function formatCell(v: number | null): string {
	if (v === null) {
		// Bare zero, no decimal point - RRF's own marker for "never probed" (see module doc).
		return "0".padStart(7, " ");
	}
	const text = Object.is(v, -0) ? "-0.000" : v.toFixed(3);
	return text.padStart(7, " ");
}

/** Serialise back to RRF's current (v2) format. Always writes the CURRENT label line, regardless of
 *  which historical version was parsed - old files are read tolerantly but never round-tripped as-is. */
export function serializeHeightmap(hm: Heightmap): string {
	const stats = gridStats(hm);
	const generatedSuffix = hm.generatedAt ? ` generated at ${hm.generatedAt}` : "";
	const comment = `${COMMENT_PREFIX} v2${generatedSuffix}, min error ${stats.min.toFixed(3)}, max error ${stats.max.toFixed(3)}, mean ${stats.mean.toFixed(3)}, deviation ${stats.deviation.toFixed(3)}`;
	const label = LABEL_LINES[CURRENT_LABEL_VERSION];
	const [l0, l1] = hm.meta.letters;
	const params = [
		l0, l1,
		hm.meta.min[0].toFixed(2), hm.meta.max[0].toFixed(2),
		hm.meta.min[1].toFixed(2), hm.meta.max[1].toFixed(2),
		hm.meta.radius.toFixed(2),
		hm.meta.spacing[0].toFixed(2), hm.meta.spacing[1].toFixed(2),
		String(hm.meta.num[0]), String(hm.meta.num[1]),
	].join(",");
	const valueLines = hm.rows.map((row) => row.map(formatCell).join(","));
	return [comment, label, params, ...valueLines].join("\n") + "\n";
}
