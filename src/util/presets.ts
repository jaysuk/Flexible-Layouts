/**
 * presets.ts — factory functions for composite widget presets.
 *
 * Each preset returns a GridItemModel whose widget is a group with
 * layoutMode: "free". Children are positioned using float percent coordinates
 * (x/y/w/h in 0–100) so they nestle with sub-cell precision — enabling a
 * perfectly concentric jog dial and a tight hex pad.
 *
 * Presets are fully editable after insertion — they are just normal grouped
 * codeButton widgets, not a separate type.
 */

import type { GridItemModel, Widget } from "../model/document";
import { newItemId } from "../model/document";
import { hexLayout, ringLayout } from "./shapes";

// --- types -------------------------------------------------------------------

type CodeButtonWidget = Extract<Widget, { type: "codeButton" }>;
type GroupWidget = Extract<Widget, { type: "group" }>;

// --- helpers -----------------------------------------------------------------

/**
 * Create a free-mode child GridItemModel positioned in percent coordinates.
 * x/y are the CENTRE of the button; w/h are the dimensions (all in 0–100 %).
 */
function freeBtn(
	label: string,
	code: string,
	color: string,
	/** Centre x in percent (0–100). */
	cx: number,
	/** Centre y in percent (0–100). */
	cy: number,
	/** Width in percent (0–100). */
	w: number,
	/** Height in percent (0–100). */
	h: number,
	shape?: CodeButtonWidget["shape"],
	icon?: string,
	freeRotation = 0,
	freeZ = 0,
): GridItemModel {
	// x/y in GridItemModel are the top-left corner (percent).
	return {
		i: newItemId(),
		x: cx - w / 2,
		y: cy - h / 2,
		w,
		h,
		freeRotation: freeRotation !== 0 ? freeRotation : undefined,
		freeZ: freeZ !== 0 ? freeZ : undefined,
		widget: {
			type: "codeButton",
			label,
			code,
			color,
			...(icon ? { icon } : {}),
			action: "gcode",
			...(shape ? { shape } : {}),
		} as CodeButtonWidget,
	};
}

// --- Jog Dial preset ---------------------------------------------------------
/**
 * A perfectly-nestled concentric jog dial using layoutMode: "free".
 *
 * Layout (all in % of the group box):
 *  - Centre circle (Home): radius ~10% at the exact centre (50%, 50%).
 *  - Inner ring (r~25%): 8 wedge buttons at 45° spacing (cardinal + diagonal), step[0].
 *  - Outer ring (r~40%): 8 wedge buttons at 45° spacing (cardinal + diagonal), step[1].
 *  - Z column on the right (x 82–98%): Z+/Z-/Home Z stacked buttons.
 *
 * All wedge angles and radii are computed in polar coords so no approximation
 * is needed — the inner/outer radii of adjacent rings match exactly.
 */
export function createJogDialPreset(color = "primary"): GridItemModel {
	const xyFeed = 3000;
	const zFeed = 600;
	const xySteps = [10, 1];
	const zSteps = [1, 0.1];

	// Jog dial geometry (percent of group box, which is square-ish).
	// We use a unit circle with cx=cy=50 (the centre of the group),
	// and express radii as percent of the group width (≈ the min dimension).
	//
	// Ring radii (as % of half the group box, i.e. % of group width / 2):
	//   inner ring: 0.18 … 0.38 of the box half (so of the 100% box: 9%…19%)
	//   outer ring: 0.38 … 0.62
	//   home circle: 0 … 0.18
	//
	// We work in "% of box side" throughout (0–100).
	const CX = 50;
	const CY = 50;

	// Radii as % of box side (the group cell is roughly square):
	const HOME_R = 9;        // home circle radius (% of box)
	const INNER_IN = 10;     // inner ring inner radius
	const INNER_OUT = 27;    // inner ring outer radius
	const OUTER_IN = 28;     // outer ring inner radius
	const OUTER_OUT = 45;    // outer ring outer radius

	// Button size for wedge rendering: the cell that contains the full dial.
	// The wedge shape itself is defined by startAngle/sweepAngle/innerRadius/outerRadius
	// where radius fractions are relative to min(w,h)/2 of the BUTTON'S OWN cell.
	// We give each wedge a cell that encompasses the full ring, then set the shape
	// fractions so only the intended sector shows (the rest is transparent).
	const WEDGE_CELL = OUTER_OUT * 2 + 4; // e.g. ~94%
	const CELL_W = WEDGE_CELL;
	const CELL_H = WEDGE_CELL;

	// For the wedge shape, radius fractions are relative to min(w,h)/2 of the cell.
	// Cell half = WEDGE_CELL/2 (in percent of box). Shape radius fractions:
	const cellHalf = WEDGE_CELL / 2;

	const items: Array<GridItemModel> = [];

	// ── 8 directions for XY jogging ──────────────────────────────────────────
	const directions = [
		{ name: "Y-", angle: 0,    xCode: "",   yCode: `-${xySteps[0]}`, diagX: "",              diagY: ""              },
		{ name: "XY+", angle: 45,  xCode: `${xySteps[0]}`,  yCode: `-${xySteps[0]}`, diagX: "x", diagY: "y" },
		{ name: "X+", angle: 90,   xCode: `${xySteps[0]}`,  yCode: "",   diagX: "",              diagY: ""              },
		{ name: "XY+Y-", angle: 135, xCode: `${xySteps[0]}`, yCode: `${xySteps[0]}`, diagX: "x", diagY: "y" },
		{ name: "Y+", angle: 180,  xCode: "",   yCode: `${xySteps[0]}`, diagX: "",              diagY: ""              },
		{ name: "XY-Y+", angle: 225, xCode: `-${xySteps[0]}`, yCode: `${xySteps[0]}`, diagX: "x", diagY: "y" },
		{ name: "X-", angle: 270,  xCode: `-${xySteps[0]}`, yCode: "",   diagX: "",              diagY: ""              },
		{ name: "XY-", angle: 315, xCode: `-${xySteps[0]}`, yCode: `-${xySteps[0]}`, diagX: "x", diagY: "y" },
	];

	// Labels and codes for each direction at each step distance
	const dirLabels = [
		["Y−", "Y+"],            // 0°  (up = Y-)
		["↗", "↗"],              // 45°
		["X+", "X+"],            // 90°
		["↘", "↘"],              // 135°
		["Y+", "Y−"],            // 180° (down = Y+)
		["↙", "↙"],              // 225°
		["X−", "X−"],            // 270°
		["↖", "↖"],              // 315°
	];

	// Helper: build gcode for one direction + step
	function jogCode(angleIdx: number, step: number): string {
		const a = angleIdx;
		// cardinal directions
		if (a === 0) return `M120\nG91\nG1 Y-${step} F${xyFeed}\nM121`;
		if (a === 2) return `M120\nG91\nG1 X${step} F${xyFeed}\nM121`;
		if (a === 4) return `M120\nG91\nG1 Y${step} F${xyFeed}\nM121`;
		if (a === 6) return `M120\nG91\nG1 X-${step} F${xyFeed}\nM121`;
		// diagonals
		if (a === 1) return `M120\nG91\nG1 X${step} Y-${step} F${xyFeed}\nM121`;
		if (a === 3) return `M120\nG91\nG1 X${step} Y${step} F${xyFeed}\nM121`;
		if (a === 5) return `M120\nG91\nG1 X-${step} Y${step} F${xyFeed}\nM121`;
		if (a === 7) return `M120\nG91\nG1 X-${step} Y-${step} F${xyFeed}\nM121`;
		return "";
	}

	function jogLabel(angleIdx: number, step: number): string {
		const dirs = ["Y−", "↗", "X+", "↘", "Y+", "↙", "X−", "↖"];
		return `${dirs[angleIdx]}\n${step}`;
	}

	// ── Build inner ring (step 0, radius INNER_IN..INNER_OUT) ───────────────
	for (let d = 0; d < 8; d++) {
		const midAngle = d * 45;
		const startAngle = midAngle - 22.5;
		const sweepAngle = 45;
		items.push(freeBtn(
			jogLabel(d, xySteps[0]),
			jogCode(d, xySteps[0]),
			color,
			CX, CY, CELL_W, CELL_H,
			{
				kind: "wedge",
				startAngle,
				sweepAngle,
				innerRadius: INNER_IN / cellHalf,
				outerRadius: INNER_OUT / cellHalf,
			},
			undefined,
			0,   // freeRotation
			1,   // freeZ (above home circle)
		));
	}

	// ── Build outer ring (step 1, radius OUTER_IN..OUTER_OUT) ───────────────
	for (let d = 0; d < 8; d++) {
		const midAngle = d * 45;
		const startAngle = midAngle - 22.5;
		const sweepAngle = 45;
		items.push(freeBtn(
			jogLabel(d, xySteps[1]),
			jogCode(d, xySteps[1]),
			color,
			CX, CY, CELL_W, CELL_H,
			{
				kind: "wedge",
				startAngle,
				sweepAngle,
				innerRadius: OUTER_IN / cellHalf,
				outerRadius: OUTER_OUT / cellHalf,
			},
			undefined,
			0,   // freeRotation
			2,   // freeZ (above inner ring)
		));
	}

	// ── Centre home circle ───────────────────────────────────────────────────
	items.push(freeBtn(
		"",
		"G28",
		color,
		CX, CY,
		HOME_R * 2, HOME_R * 2,
		{ kind: "circle" },
		"mdi-home",
		0,
		0,  // freeZ (rendered below rings by z-index, but it's smaller so it shows in the hole)
	));

	// ── Z column on the right ───────────────────────────────────────────────
	// Positioned in a strip from x=88% to x=100%, centred vertically.
	const Z_LEFT = 88;
	const Z_W = 12;
	const Z_BTN_H = 12;
	const Z_START_Y = 14;

	zSteps.forEach((s, k) => {
		items.push(freeBtn(
			`Z+${s}`,
			`M120\nG91\nG1 Z${s} F${zFeed}\nM121`,
			color,
			Z_LEFT + Z_W / 2,
			Z_START_Y + k * (Z_BTN_H + 2) + Z_BTN_H / 2,
			Z_W, Z_BTN_H,
		));
	});

	// Home Z button
	items.push(freeBtn(
		"",
		"G28 Z",
		color,
		Z_LEFT + Z_W / 2,
		Z_START_Y + xySteps.length * (Z_BTN_H + 2) + Z_BTN_H / 2,
		Z_W, Z_BTN_H,
		undefined,
		"mdi-home",
	));

	zSteps.slice().reverse().forEach((s, k) => {
		items.push(freeBtn(
			`Z-${s}`,
			`M120\nG91\nG1 Z-${s} F${zFeed}\nM121`,
			color,
			Z_LEFT + Z_W / 2,
			Z_START_Y + (xySteps.length + 1 + k) * (Z_BTN_H + 2) + Z_BTN_H / 2,
			Z_W, Z_BTN_H,
		));
	});

	const widget: GroupWidget = {
		type: "group",
		title: "Jog Dial",
		items,
		layoutMode: "free",
	};

	return {
		i: newItemId(),
		x: 0, y: 0, w: 8, h: 9,
		widget,
	};
}

// --- Hex Pad preset ----------------------------------------------------------
/**
 * A hex pad preset using layoutMode: "free" for perfect hex tiling.
 *
 * Uses hexLayout() from shapes.ts to place hexagon-shaped codeButtons in a
 * 3-column pointy-top hex grid. Pre-wired for common macros; user edits
 * labels/codes/paths after insertion.
 */
export function createHexPadPreset(color = "secondary"): GridItemModel {
	const macros = [
		{ label: "Home", code: "G28", icon: "mdi-home" },
		{ label: "Park", code: "G28\nG1 Z50 F600", icon: "mdi-parking" },
		{ label: "Fan On", code: "M106 S255" },
		{ label: "Fan Off", code: "M107" },
		{ label: "Heat Off", code: "M140 S-273.15\nM104 S-273.15" },
		{ label: "Motors Off", code: "M18" },
	];

	const COUNT = macros.length;
	const COLS = 3;

	// Hex layout: spacing in percent of group box. We want 3 hexes to span ~90%
	// of the width, so spacing = 90% / 3 ≈ 30%.
	// hexLayout returns centre coordinates for each hex, starting at (originX, originY).
	const SPACING = 32;   // center-to-center (pointy top), percent of group box
	const ORIGIN_X = 16;  // center of first hex (column 0)
	const ORIGIN_Y = 18;  // center of first hex (row 0)

	// Hex button cell size: slightly larger than spacing so hexes touch/overlap correctly.
	const HEX_W = SPACING + 2;
	const HEX_H = SPACING * (2 / Math.sqrt(3)) + 2;  // height of a pointy-top hex

	const positions = hexLayout({
		cols: COLS,
		count: COUNT,
		spacing: SPACING,
		orientation: "pointy",
		originX: ORIGIN_X,
		originY: ORIGIN_Y,
	});

	const items: Array<GridItemModel> = macros.map((m, idx) => {
		const pos = positions[idx] ?? { x: 0, y: 0 };
		return freeBtn(
			m.label,
			m.code,
			color,
			pos.x, pos.y,
			HEX_W, HEX_H,
			{ kind: "polygon", sides: 6, shapeRotation: 90 },
			m.icon,
		);
	});

	const widget: GroupWidget = {
		type: "group",
		title: "Hex Pad",
		items,
		layoutMode: "free",
	};

	return {
		i: newItemId(),
		x: 0, y: 0, w: 12, h: 7,
		widget,
	};
}
