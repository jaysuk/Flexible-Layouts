/**
 * Vector drawings, once they stop being SVG or DXF and become geometry.
 *
 * Both importers flatten everything — beziers, arcs, splines, ellipses — to
 * polylines before anything else touches them. Carrying curve types further in
 * would mean every downstream step (offsetting, tabs, depth passes, the viewer)
 * needed to understand all of them, and the only place the curve type still
 * matters is the tolerance it was flattened at.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/import/types.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: none - this file has no DOM/environment dependency and needed none.
 */

export type Point = [number, number];

export interface Polyline {
	points: Array<Point>;
	/** True when the last point joins the first. Holds the tool-path semantics:
	 *  only a closed loop can be offset to an inside or an outside. */
	closed: boolean;
	/** Source layer (DXF) or element id/class (SVG), for filtering. */
	layer?: string;
}

export interface Bounds {
	min: Point;
	max: Point;
}

export type DrawingUnits = "mm" | "in" | "unknown";

export interface ImportedDrawing {
	source: "svg" | "dxf";
	name: string;
	paths: Array<Polyline>;
	/**
	 * Units the file claimed, if it claimed any. `unknown` is the honest answer
	 * far more often than importers admit — a DXF with $INSUNITS unset, or an SVG
	 * sized only in pixels, genuinely does not say how big it is, and pretending
	 * otherwise is how a part comes out 25.4× wrong.
	 */
	units: DrawingUnits;
	/** Millimetres per source unit, as understood from the file. */
	mmPerUnit: number;
	warnings: Array<string>;
}

export function boundsOf(paths: Array<Polyline>): Bounds | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const path of paths) {
		for (const [x, y] of path.points) {
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	return isFinite(minX) ? { min: [minX, minY], max: [maxX, maxY] } : null;
}

/** Signed area, positive when the ring winds anticlockwise. */
export function signedArea(points: Array<Point>): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const [x1, y1] = points[i];
		const [x2, y2] = points[(i + 1) % points.length];
		sum += x1 * y2 - x2 * y1;
	}
	return sum / 2;
}

export function pathLength(path: Polyline): number {
	let total = 0;
	const last = path.closed ? path.points.length : path.points.length - 1;
	for (let i = 0; i < last; i++) {
		const a = path.points[i];
		const b = path.points[(i + 1) % path.points.length];
		total += Math.hypot(b[0] - a[0], b[1] - a[1]);
	}
	return total;
}
