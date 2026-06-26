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

// --- Hex Pad preset ----------------------------------------------------------
/**
 * A hex pad preset using layoutMode: "free".
 *
 * Lays out pointy-top hexagon codeButtons in tidy, offset rows (a honeycomb). Each hexagon renders
 * aspect-correct (CommandButtonWidget uses preserveAspectRatio="meet" for polygons), so cells are kept
 * comfortably larger than they overlap — columns sit side by side, alternate rows interlock. Pre-wired
 * for common macros; user edits labels/codes/paths after insertion.
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

	const COLS = 3;
	// All in percent of the group box. Centre spacing > cell size so columns don't overlap; alternate
	// rows are offset by half a column so the hexagons interlock like a honeycomb. Chosen so the offset
	// row's outermost hex still fits inside the 0–100 box.
	const COL_GAP = 26;   // horizontal centre-to-centre
	const ROW_GAP = 22;   // vertical centre-to-centre
	const ORIGIN_X = 16;  // centre of the first column
	const ORIGIN_Y = 20;  // centre of the first row
	const CELL_W = 22;
	const CELL_H = 26;

	const items: Array<GridItemModel> = macros.map((m, idx) => {
		const col = idx % COLS;
		const row = Math.floor(idx / COLS);
		const cx = ORIGIN_X + col * COL_GAP + (row % 2 === 1 ? COL_GAP / 2 : 0);
		const cy = ORIGIN_Y + row * ROW_GAP;
		return freeBtn(m.label, m.code, color, cx, cy, CELL_W, CELL_H, { kind: "polygon", sides: 6 }, m.icon);
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
