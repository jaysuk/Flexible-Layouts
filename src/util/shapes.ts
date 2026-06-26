/**
 * shapes.ts — pure SVG geometry helpers, no Vue/DWC imports.
 *
 * Provides shapePath() for rendering arbitrary shapes as SVG path strings,
 * plus ringLayout() / hexLayout() for arranging items in radial or hex grids.
 * Consumed by OctopusJogWidget and shaped CommandButtonWidget.
 */

export interface Box { w: number; h: number }

// ---------------------------------------------------------------------------
// Low-level polar helpers (shared with JogWidget via re-export)
// ---------------------------------------------------------------------------

/**
 * Convert polar coordinates (radius from cx/cy, angle in degrees clockwise from up)
 * to [x, y] in a viewBox whose centre is at (cx, cy).
 */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
	const a = (deg * Math.PI) / 180;
	return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function f(n: number): string { return n.toFixed(2); }

/**
 * Annular sector path (like a Pronterface jog wedge).
 * a0/a1 are angles in degrees (clockwise from top), rIn/rOut are radii.
 * cx/cy default to 0 (caller translates).
 */
export function sectorPath(
	cx: number, cy: number,
	a0: number, a1: number,
	rIn: number, rOut: number,
): string {
	const [x1, y1] = polar(cx, cy, rOut, a0);
	const [x2, y2] = polar(cx, cy, rOut, a1);
	const [x3, y3] = polar(cx, cy, rIn, a1);
	const [x4, y4] = polar(cx, cy, rIn, a0);
	const sweep = a1 - a0;
	const large = Math.abs(sweep) > 180 ? 1 : 0;
	const dir = sweep >= 0 ? 1 : 0;
	const dirR = dir === 1 ? 0 : 1;
	return `M${f(x1)} ${f(y1)} A${rOut} ${rOut} 0 ${large} ${dir} ${f(x2)} ${f(y2)} `
		+ `L${f(x3)} ${f(y3)} A${rIn} ${rIn} 0 ${large} ${dirR} ${f(x4)} ${f(y4)} Z`;
}

// ---------------------------------------------------------------------------
// Polygon vertex helpers
// ---------------------------------------------------------------------------

function polygonPoints(cx: number, cy: number, r: number, n: number, rotDeg = 0): Array<[number, number]> {
	return Array.from({ length: n }, (_, i) => {
		const angle = (360 / n) * i + rotDeg;
		return polar(cx, cy, r, angle);
	});
}

function closedPath(pts: Array<[number, number]>): string {
	if (pts.length === 0) { return ""; }
	const [start, ...rest] = pts;
	return `M${f(start[0])} ${f(start[1])} ` + rest.map(([x, y]) => `L${f(x)} ${f(y)}`).join(" ") + " Z";
}

// ---------------------------------------------------------------------------
// Shape params union
// ---------------------------------------------------------------------------

export interface RectParams      { kind: "rect";         rx?: number }
export interface PillParams      { kind: "pill" }
export interface SquircleParams  { kind: "squircle";     curvature?: number }
export interface CircleParams    { kind: "circle" }
export interface EllipseParams   { kind: "ellipse" }
export interface PolygonParams   { kind: "polygon";      sides: number; rotation?: number }
export interface StarParams      { kind: "star";         points: number; innerRatio?: number; rotation?: number }
export interface WedgeParams     { kind: "wedge";        startAngle: number; sweepAngle: number; innerRadius: number; outerRadius: number }
export interface ChevronParams   { kind: "chevron";      direction?: "right" | "left" | "up" | "down"; indent?: number }
export interface ArrowParams     { kind: "arrow";        direction?: "right" | "left" | "up" | "down"; headRatio?: number }
export interface DiamondParams   { kind: "diamond" }
export interface TrapezoidParams { kind: "trapezoid";    topRatio?: number }
export interface CustomPtsParams { kind: "polygonPoints"; points: Array<{ x: number; y: number }> }
export interface PathParams      { kind: "path";         d: string }

export type ShapeParams =
	| RectParams | PillParams | SquircleParams | CircleParams | EllipseParams
	| PolygonParams | StarParams | WedgeParams | ChevronParams | ArrowParams
	| DiamondParams | TrapezoidParams | CustomPtsParams | PathParams;

export type ShapeKind = ShapeParams["kind"];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Return an SVG path `d` string (or `points` string for <polygon>) that fills
 * the given box.  All shapes are centred in the box.
 *
 * The returned string is always suitable for a `<path d="…">` EXCEPT for the
 * `path` kind which returns the custom d verbatim.
 */
export function shapePath(params: ShapeParams, box: Box): string {
	const { w, h } = box;
	const cx = w / 2;
	const cy = h / 2;

	switch (params.kind) {
		case "rect": {
			const rx = params.rx ?? 0;
			if (rx <= 0) {
				return `M0 0 L${f(w)} 0 L${f(w)} ${f(h)} L0 ${f(h)} Z`;
			}
			const r = Math.min(rx, w / 2, h / 2);
			return `M${f(r)} 0 L${f(w - r)} 0 Q${f(w)} 0 ${f(w)} ${f(r)} `
				+ `L${f(w)} ${f(h - r)} Q${f(w)} ${f(h)} ${f(w - r)} ${f(h)} `
				+ `L${f(r)} ${f(h)} Q0 ${f(h)} 0 ${f(h - r)} `
				+ `L0 ${f(r)} Q0 0 ${f(r)} 0 Z`;
		}

		case "pill": {
			const r = Math.min(w, h) / 2;
			if (w >= h) {
				return `M${f(r)} 0 L${f(w - r)} 0 A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)} `
					+ `L${f(r)} ${f(h)} A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0 Z`;
			} else {
				return `M0 ${f(r)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)} `
					+ `L${f(w)} ${f(h - r)} A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)} Z`;
			}
		}

		case "squircle": {
			// Approximate squircle via bezier: curvature 0..1 (0=square,1=circle)
			const k = params.curvature ?? 0.55;
			const ctrl = k * Math.min(w, h) / 2;
			return `M${f(cx)} 0 `
				+ `C${f(cx + ctrl)} 0 ${f(w)} ${f(cy - ctrl)} ${f(w)} ${f(cy)} `
				+ `C${f(w)} ${f(cy + ctrl)} ${f(cx + ctrl)} ${f(h)} ${f(cx)} ${f(h)} `
				+ `C${f(cx - ctrl)} ${f(h)} 0 ${f(cy + ctrl)} 0 ${f(cy)} `
				+ `C0 ${f(cy - ctrl)} ${f(cx - ctrl)} 0 ${f(cx)} 0 Z`;
		}

		case "circle": {
			const r = Math.min(w, h) / 2;
			// Use two arcs (SVG can't do a full circle with one arc command)
			return `M${f(cx - r)} ${f(cy)} `
				+ `A${f(r)} ${f(r)} 0 0 1 ${f(cx + r)} ${f(cy)} `
				+ `A${f(r)} ${f(r)} 0 0 1 ${f(cx - r)} ${f(cy)} Z`;
		}

		case "ellipse": {
			const rx = w / 2;
			const ry = h / 2;
			return `M${f(cx - rx)} ${f(cy)} `
				+ `A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx)} ${f(cy)} `
				+ `A${f(rx)} ${f(ry)} 0 0 1 ${f(cx - rx)} ${f(cy)} Z`;
		}

		case "polygon": {
			const r = Math.min(w, h) / 2;
			const pts = polygonPoints(cx, cy, r, params.sides, params.rotation ?? 0);
			return closedPath(pts);
		}

		case "star": {
			const n = params.points;
			const rOut = Math.min(w, h) / 2;
			const rIn = rOut * (params.innerRatio ?? 0.4);
			const rot = params.rotation ?? 0;
			const pts: Array<[number, number]> = [];
			for (let i = 0; i < n * 2; i++) {
				const r = i % 2 === 0 ? rOut : rIn;
				const angle = (180 / n) * i + rot;
				pts.push(polar(cx, cy, r, angle));
			}
			return closedPath(pts);
		}

		case "wedge": {
			// Wedge occupies the whole box; caller sets startAngle/sweepAngle in degrees,
			// and innerRadius/outerRadius as fractions of min(w,h)/2.
			const scale = Math.min(w, h) / 2;
			const rIn = params.innerRadius * scale;
			const rOut = params.outerRadius * scale;
			return sectorPath(cx, cy, params.startAngle, params.startAngle + params.sweepAngle, rIn, rOut);
		}

		case "chevron": {
			const dir = params.direction ?? "right";
			const indent = params.indent ?? 0.3;
			// Build in right-pointing orientation, then rotate
			const pts = chevronPts(w, h, indent);
			return closedPath(dir === "right" ? pts : rotatePts(pts, cx, cy, dirAngle(dir)));
		}

		case "arrow": {
			const dir = params.direction ?? "right";
			const headRatio = params.headRatio ?? 0.4;
			const pts = arrowPts(w, h, headRatio);
			return closedPath(dir === "right" ? pts : rotatePts(pts, cx, cy, dirAngle(dir)));
		}

		case "diamond": {
			return `M${f(cx)} 0 L${f(w)} ${f(cy)} L${f(cx)} ${f(h)} L0 ${f(cy)} Z`;
		}

		case "trapezoid": {
			const ratio = params.topRatio ?? 0.6;
			const inset = (w * (1 - ratio)) / 2;
			return `M${f(inset)} 0 L${f(w - inset)} 0 L${f(w)} ${f(h)} L0 ${f(h)} Z`;
		}

		case "polygonPoints": {
			// Custom list of {x,y} in 0..1 normalised space
			const pts: Array<[number, number]> = params.points.map(p => [p.x * w, p.y * h]);
			return closedPath(pts);
		}

		case "path":
			return params.d;
	}
}

// ---------------------------------------------------------------------------
// Helpers for chevron / arrow
// ---------------------------------------------------------------------------

function chevronPts(w: number, h: number, indent: number): Array<[number, number]> {
	const ix = w * indent;
	const my = h / 2;
	return [
		[0, 0],
		[w - ix, 0],
		[w, my],
		[w - ix, h],
		[0, h],
		[ix, my],
	];
}

function arrowPts(w: number, h: number, headRatio: number): Array<[number, number]> {
	const shaftH = h * 0.38;
	const shaftY0 = (h - shaftH) / 2;
	const headX = w * (1 - headRatio);
	return [
		[0, shaftY0],
		[headX, shaftY0],
		[headX, 0],
		[w, h / 2],
		[headX, h],
		[headX, h - shaftY0],
		[0, h - shaftY0],
	];
}

function dirAngle(dir: string): number {
	switch (dir) {
		case "left": return 180;
		case "up": return -90;
		case "down": return 90;
		default: return 0;
	}
}

function rotatePts(pts: Array<[number, number]>, cx: number, cy: number, deg: number): Array<[number, number]> {
	const a = (deg * Math.PI) / 180;
	const cos = Math.cos(a);
	const sin = Math.sin(a);
	return pts.map(([x, y]) => {
		const dx = x - cx;
		const dy = y - cy;
		return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
	});
}

// ---------------------------------------------------------------------------
// Ring (radial) layout
// ---------------------------------------------------------------------------

export interface RingLayoutOptions {
	/** Centre of the ring in the coordinate space (e.g. SVG viewBox units). */
	cx: number;
	cy: number;
	/** Radius of the ring. */
	radius: number;
	/** Number of items to place. */
	count: number;
	/** Starting angle in degrees (clockwise from top). Default 0. */
	startAngle?: number;
	/** Extra gap in degrees between items (spreads them slightly further). Default 0. */
	gap?: number;
	/** If true, each item's rotation is set so it faces outward from the centre. */
	faceOutward?: boolean;
}

export interface RingItem {
	x: number;
	y: number;
	/** Rotation in degrees (only non-zero when faceOutward is true). */
	rotation: number;
}

export function ringLayout(opts: RingLayoutOptions): Array<RingItem> {
	const { cx, cy, radius, count, startAngle = 0, gap = 0, faceOutward = false } = opts;
	const step = count > 0 ? 360 / count : 0;
	return Array.from({ length: count }, (_, i) => {
		const angle = startAngle + i * (step + gap);
		const [x, y] = polar(cx, cy, radius, angle);
		return { x, y, rotation: faceOutward ? angle : 0 };
	});
}

// ---------------------------------------------------------------------------
// Hex / tessellation layout
// ---------------------------------------------------------------------------

export interface HexLayoutOptions {
	/** Number of columns. */
	cols: number;
	/** Total item count (truncate if fewer than cols*rows). */
	count: number;
	/** Centre-to-centre spacing (edge-length * sqrt(3) for pointy-top). */
	spacing: number;
	/** "pointy" = vertex up (default); "flat" = edge up. */
	orientation?: "pointy" | "flat";
	/** Starting X position. */
	originX?: number;
	/** Starting Y position. */
	originY?: number;
}

export interface HexItem {
	x: number;
	y: number;
}

export function hexLayout(opts: HexLayoutOptions): Array<HexItem> {
	const { cols, count, spacing, orientation = "pointy", originX = 0, originY = 0 } = opts;
	const result: Array<HexItem> = [];
	for (let i = 0; i < count; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		let x: number;
		let y: number;
		if (orientation === "pointy") {
			// Pointy-top hex grid
			const colOffset = row % 2 === 0 ? 0 : spacing / 2;
			x = originX + col * spacing + colOffset;
			y = originY + row * spacing * Math.sqrt(3) / 2;
		} else {
			// Flat-top hex grid
			const rowOffset = col % 2 === 0 ? 0 : spacing / 2;
			x = originX + col * spacing * Math.sqrt(3) / 2;
			y = originY + row * spacing + rowOffset;
		}
		result.push({ x, y });
	}
	return result;
}
