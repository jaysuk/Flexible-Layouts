/**
 * DXF import.
 *
 * DXF is a flat stream of (group code, value) pairs, two lines each. Everything
 * is context: an entity starts at code 0 and owns every pair until the next
 * code 0, and what a code means depends on which entity you are inside. There is
 * no browser help here, so this reads the ENTITIES section directly.
 *
 * Supported: LINE, LWPOLYLINE, POLYLINE/VERTEX (both with bulges), CIRCLE, ARC,
 * ELLIPSE, SPLINE. That covers what Illustrator, Inkscape, Fusion and QCAD emit
 * for 2D profiles.
 *
 * Not supported, and reported rather than silently dropped: INSERT (block
 * references), HATCH, DIMENSION, TEXT/MTEXT, 3D entities. A block reference in
 * particular is a whole coordinate system away from where its geometry is
 * defined, and quietly cutting it in the wrong place would be worse than saying
 * it was skipped.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/import/dxf.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes:
 *  - Chord tolerance is now interpreted in millimetres, matching svg.ts's contract and the panel's
 *    single tolerance field. The original interpreted it in source units, so an inch DXF
 *    ($INSUNITS=1) got a 25.4x coarser tolerance than requested and produced visibly faceted arcs.
 *  - tokenize() now skips leading blank lines before pairing starts, and importDxf() rejects up
 *    front if the first pair isn't a 0/SECTION - a single leading blank line otherwise shifts every
 *    code/value pair by one (Number("") is 0, which is finite, so nothing catches this until some
 *    unrelated downstream check fails with a misleading message).
 */
import { simplify } from "./geometry";
import type { ImportedDrawing, Point, Polyline } from "./types";

interface Pair {
	code: number;
	value: string;
}

/** $INSUNITS values that matter for a machine tool. */
const INSUNITS_MM: Record<string, number> = {
	"1": 25.4, // inches
	"2": 304.8, // feet
	"4": 1, // millimetres
	"5": 10, // centimetres
	"6": 1000, // metres
	"11": 1e-7, // angstroms — present for completeness, not expected
	"12": 1e-6, // nanometres
	"13": 1e-3, // microns
	"14": 100, // decimetres
};

function tokenize(text: string): Array<Pair> {
	const lines = text.split(/\r\n|\r|\n/);
	// A DXF is strictly alternating code/value lines from the very first line. A leading blank line
	// (common from Windows exporters, or BOM-adjacent artifacts) would otherwise shift every pair by
	// one and desync the entire file silently - Number("") is 0, which is finite, so nothing here
	// catches it. Skip leading blanks before pairing starts.
	let start = 0;
	while (start < lines.length && lines[start].trim() === "") start++;
	const out: Array<Pair> = [];
	for (let i = start; i + 1 < lines.length; i += 2) {
		const code = Number(lines[i].trim());
		if (!Number.isFinite(code)) continue;
		out.push({ code, value: lines[i + 1] });
	}
	return out;
}

interface Entity {
	type: string;
	/** All pairs belonging to this entity, in file order — bulges and vertex
	 *  coordinates only make sense as a sequence. */
	pairs: Array<Pair>;
}

/** Split the file into sections, then ENTITIES into entities. */
function readEntities(pairs: Array<Pair>): { entities: Array<Entity>; header: Map<string, string> } {
	const header = new Map<string, string>();
	const entities: Array<Entity> = [];

	let section: string | null = null;
	let current: Entity | null = null;
	let headerVar: string | null = null;

	for (let i = 0; i < pairs.length; i++) {
		const { code, value } = pairs[i];

		if (code === 0 && value.trim() === "SECTION") {
			const next = pairs[i + 1];
			section = next && next.code === 2 ? next.value.trim() : null;
			current = null;
			continue;
		}
		if (code === 0 && value.trim() === "ENDSEC") {
			if (current) entities.push(current);
			current = null;
			section = null;
			continue;
		}

		if (section === "HEADER") {
			if (code === 9) headerVar = value.trim();
			else if (headerVar && (code === 70 || code === 40 || code === 1)) {
				header.set(headerVar, value.trim());
				headerVar = null;
			}
			continue;
		}

		if (section !== "ENTITIES") continue;

		if (code === 0) {
			if (current) entities.push(current);
			const type = value.trim();
			// SEQEND closes a POLYLINE's VERTEX run and carries nothing itself.
			current = type === "SEQEND" ? null : { type, pairs: [] };
			continue;
		}
		if (current) current.pairs.push({ code, value });
	}
	if (current) entities.push(current);

	return { entities, header };
}

function num(pairs: Array<Pair>, code: number, fallback = 0): number {
	const p = pairs.find((x) => x.code === code);
	const v = p ? Number(p.value) : NaN;
	return Number.isFinite(v) ? v : fallback;
}

function str(pairs: Array<Pair>, code: number): string | undefined {
	return pairs.find((x) => x.code === code)?.value.trim();
}

/**
 * Arc through two points with a given bulge.
 *
 * Bulge is DXF's way of putting an arc inside a polyline: it is the tangent of
 * a quarter of the included angle, signed for direction. Positive is
 * anticlockwise. This is the single most-missed part of a DXF importer, and
 * skipping it turns every filleted corner into a chamfer.
 */
function bulgeArc(a: Point, b: Point, bulge: number, tolerance: number): Array<Point> {
	if (!bulge) return [];
	const theta = 4 * Math.atan(bulge);
	const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
	if (chord < 1e-9) return [];
	const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
	// Centre lies on the perpendicular bisector, offset by the sagitta geometry.
	const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const h = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2)) * (Math.abs(theta) > Math.PI ? -1 : 1);
	const nx = -(b[1] - a[1]) / chord;
	const ny = (b[0] - a[0]) / chord;
	const sign = bulge > 0 ? 1 : -1;
	const centre: Point = [mid[0] + nx * h * sign, mid[1] + ny * h * sign];

	const start = Math.atan2(a[1] - centre[1], a[0] - centre[0]);
	const segments = arcSegments(radius, Math.abs(theta), tolerance);
	const out: Array<Point> = [];
	for (let i = 1; i < segments; i++) {
		const t = start + (theta * i) / segments;
		out.push([centre[0] + radius * Math.cos(t), centre[1] + radius * Math.sin(t)]);
	}
	return out;
}

/** Segment count for an arc so the chord never strays past `tolerance`. */
function arcSegments(radius: number, sweep: number, tolerance: number): number {
	if (!(radius > 0) || !(tolerance > 0)) return 16;
	const ratio = Math.max(-1, Math.min(1, 1 - tolerance / radius));
	const perSegment = 2 * Math.acos(ratio);
	return Math.max(4, Math.ceil(sweep / Math.max(perSegment, 1e-4)));
}

function sampleArc(
	cx: number, cy: number, rx: number, ry: number,
	startAngle: number, endAngle: number, rotation: number, tolerance: number,
): Array<Point> {
	let sweep = endAngle - startAngle;
	while (sweep <= 0) sweep += Math.PI * 2;
	const segments = arcSegments(Math.max(rx, ry), sweep, tolerance);
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const out: Array<Point> = [];
	for (let i = 0; i <= segments; i++) {
		const t = startAngle + (sweep * i) / segments;
		const x = rx * Math.cos(t);
		const y = ry * Math.sin(t);
		out.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
	}
	return out;
}

/**
 * B-spline evaluation, de Boor. Handles the rational case when weights are
 * present, because that is how a DXF represents a true circle as a SPLINE and
 * ignoring the weights would bulge it.
 */
function sampleSpline(
	control: Array<Point>, knots: Array<number>, weights: Array<number> | null, degree: number, samples: number,
): Array<Point> {
	if (control.length < degree + 1 || knots.length < control.length + degree + 1) {
		// Not enough information to evaluate; the control polygon is a poor but
		// honest fallback and is at least in the right place.
		return control.slice();
	}
	const lo = knots[degree];
	const hi = knots[control.length];
	const out: Array<Point> = [];

	for (let s = 0; s <= samples; s++) {
		const u = lo + ((hi - lo) * s) / samples;
		// Knot span containing u.
		let k = degree;
		while (k < control.length - 1 && knots[k + 1] <= u) k++;

		// Homogeneous control points for the affected span.
		const d: Array<[number, number, number]> = [];
		for (let j = 0; j <= degree; j++) {
			const idx = k - degree + j;
			const w = weights ? weights[idx] ?? 1 : 1;
			d.push([control[idx][0] * w, control[idx][1] * w, w]);
		}
		for (let r = 1; r <= degree; r++) {
			for (let j = degree; j >= r; j--) {
				const i = k - degree + j;
				const denom = knots[i + degree - r + 1] - knots[i];
				const alpha = denom === 0 ? 0 : (u - knots[i]) / denom;
				d[j] = [
					d[j - 1][0] * (1 - alpha) + d[j][0] * alpha,
					d[j - 1][1] * (1 - alpha) + d[j][1] * alpha,
					d[j - 1][2] * (1 - alpha) + d[j][2] * alpha,
				];
			}
		}
		const [x, y, w] = d[degree];
		out.push(w === 0 ? [x, y] : [x / w, y / w]);
	}
	return out;
}

export interface DxfOptions {
	/** Chord tolerance, mm - converted internally to source units via $INSUNITS once the header has
	 *  been read, matching svg.ts's contract (the panel feeds both importers the same mm value). */
	tolerance: number;
	name: string;
}

export function importDxf(text: string, opts: DxfOptions): ImportedDrawing {
	const warnings: Array<string> = [];
	const allPairs = tokenize(text);
	if (!allPairs.length || allPairs[0].code !== 0) {
		throw new Error("no ENTITIES section, or it is empty — is this a DXF?");
	}
	const { entities, header } = readEntities(allPairs);
	if (!entities.length) throw new Error("no ENTITIES section, or it is empty — is this a DXF?");

	const insunits = header.get("$INSUNITS");
	const mmPerUnit = insunits ? INSUNITS_MM[insunits] : undefined;
	if (mmPerUnit === undefined) {
		warnings.push(
			insunits
				? `Unrecognised $INSUNITS value ${insunits}; assuming millimetres. Check the size below.`
				: "The file does not say what its units are ($INSUNITS unset); assuming millimetres. Check the size below.",
		);
	}

	// Convert the mm-denominated tolerance into source units now that $INSUNITS is known - must
	// happen after header parsing, so it can't be hoisted to the call site.
	const tol = opts.tolerance / (mmPerUnit ?? 1);
	const paths: Array<Polyline> = [];
	const skipped = new Map<string, number>();

	const emit = (points: Array<Point>, closed: boolean, layer?: string) => {
		const cleaned = simplify(points, tol);
		if (cleaned.length >= 2) paths.push({ points: cleaned, closed, layer });
	};

	for (let e = 0; e < entities.length; e++) {
		const entity = entities[e];
		const p = entity.pairs;
		const layer = str(p, 8);

		switch (entity.type) {
			case "LINE":
				emit([[num(p, 10), num(p, 20)], [num(p, 11), num(p, 21)]], false, layer);
				break;

			case "CIRCLE":
				emit(sampleArc(num(p, 10), num(p, 20), num(p, 40), num(p, 40), 0, Math.PI * 2, 0, tol).slice(0, -1), true, layer);
				break;

			case "ARC": {
				const start = (num(p, 50) * Math.PI) / 180;
				const end = (num(p, 51) * Math.PI) / 180;
				emit(sampleArc(num(p, 10), num(p, 20), num(p, 40), num(p, 40), start, end, 0, tol), false, layer);
				break;
			}

			case "ELLIPSE": {
				// 11/21 is the major axis endpoint *relative to the centre*, and 40 is
				// the minor/major ratio — not a second radius.
				const cx = num(p, 10);
				const cy = num(p, 20);
				const mx = num(p, 11);
				const my = num(p, 21);
				const rx = Math.hypot(mx, my);
				const ry = rx * num(p, 40, 1);
				const rotation = Math.atan2(my, mx);
				const start = num(p, 41, 0);
				const end = num(p, 42, Math.PI * 2);
				const full = Math.abs(end - start - Math.PI * 2) < 1e-9;
				const pts = sampleArc(cx, cy, rx, ry, start, end, rotation, tol);
				emit(full ? pts.slice(0, -1) : pts, full, layer);
				break;
			}

			case "LWPOLYLINE": {
				// Vertices interleave: each 10 starts a vertex, 20 completes it, and an
				// optional 42 gives that vertex's bulge toward the NEXT one. File order
				// is the only thing that ties them together.
				const points: Array<Point> = [];
				const bulges: Array<number> = [];
				for (const pair of p) {
					if (pair.code === 10) {
						points.push([Number(pair.value), 0]);
						bulges.push(0);
					} else if (pair.code === 20 && points.length) {
						points[points.length - 1][1] = Number(pair.value);
					} else if (pair.code === 42 && points.length) {
						bulges[points.length - 1] = Number(pair.value);
					}
				}
				const closed = (num(p, 70) & 1) === 1;
				emit(expandBulges(points, bulges, closed, tol), closed, layer);
				break;
			}

			case "POLYLINE": {
				// The old form: vertices are separate VERTEX entities that follow until
				// SEQEND, which readEntities has already turned into siblings.
				const closed = (num(p, 70) & 1) === 1;
				const points: Array<Point> = [];
				const bulges: Array<number> = [];
				while (e + 1 < entities.length && entities[e + 1].type === "VERTEX") {
					const v = entities[++e].pairs;
					points.push([num(v, 10), num(v, 20)]);
					bulges.push(num(v, 42));
				}
				if (points.length >= 2) emit(expandBulges(points, bulges, closed, tol), closed, layer);
				break;
			}

			case "SPLINE": {
				const degree = num(p, 71, 3);
				const knots = p.filter((x) => x.code === 40).map((x) => Number(x.value));
				const weights = p.filter((x) => x.code === 41).map((x) => Number(x.value));
				const control: Array<Point> = [];
				for (const pair of p) {
					if (pair.code === 10) control.push([Number(pair.value), 0]);
					else if (pair.code === 20 && control.length) control[control.length - 1][1] = Number(pair.value);
				}
				if (control.length < 2) break;
				const closed = (num(p, 70) & 1) === 1;
				// Sample density from the control polygon's extent, which bounds the
				// curve — a spline never leaves its control hull.
				const extent = polygonExtent(control);
				const samples = Math.max(32, Math.min(4000, Math.ceil(extent / Math.max(tol, 1e-6))));
				const pts = sampleSpline(control, knots, weights.length === control.length ? weights : null, degree, samples);
				emit(closed ? pts.slice(0, -1) : pts, closed, layer);
				break;
			}

			case "VERTEX":
			case "POINT":
				break;

			default:
				skipped.set(entity.type, (skipped.get(entity.type) ?? 0) + 1);
		}
	}

	for (const [type, count] of skipped) {
		warnings.push(
			type === "INSERT"
				? `${count} block reference(s) (INSERT) skipped — explode blocks before exporting.`
				: `${count} ${type} entit${count === 1 ? "y" : "ies"} skipped (not supported).`,
		);
	}
	if (!paths.length) warnings.push("No usable geometry found.");

	return {
		source: "dxf",
		name: opts.name,
		paths,
		units: mmPerUnit === 25.4 ? "in" : mmPerUnit === 1 ? "mm" : "unknown",
		mmPerUnit: mmPerUnit ?? 1,
		warnings,
	};
}

function polygonExtent(points: Array<Point>): number {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [x, y] of points) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return Math.hypot(maxX - minX, maxY - minY);
}

/** Replace each bulged span with its arc. */
function expandBulges(points: Array<Point>, bulges: Array<number>, closed: boolean, tolerance: number): Array<Point> {
	const out: Array<Point> = [];
	const last = closed ? points.length : points.length - 1;
	for (let i = 0; i < last; i++) {
		const a = points[i];
		const b = points[(i + 1) % points.length];
		out.push(a);
		if (bulges[i]) out.push(...bulgeArc(a, b, bulges[i], tolerance));
	}
	if (!closed) out.push(points[points.length - 1]);
	return out;
}
