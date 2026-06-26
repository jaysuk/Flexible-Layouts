/**
 * presets.ts — factory functions for composite widget presets.
 *
 * Each preset returns a GridItemModel whose widget is a group containing
 * pre-wired codeButton widgets arranged in the appropriate shape. The items
 * inside the group use the standard integer grid, so they work without any
 * free-positioning extension to GroupWidget.
 *
 * Presets are fully editable after insertion — they are just normal grouped
 * codeButton widgets, not a separate type.
 */

import type { GridItemModel, Widget } from "../model/document";
import { newItemId } from "../model/document";

// --- helpers -----------------------------------------------------------------

function btn(
	label: string,
	code: string,
	color: string,
	x: number, y: number,
	w: number, h: number,
	shape?: Extract<Widget, { type: "codeButton" }>["shape"],
	icon?: string,
): GridItemModel {
	return {
		i: newItemId(),
		x, y, w, h,
		widget: {
			type: "codeButton",
			label,
			code,
			color,
			icon,
			action: "gcode",
			...(shape ? { shape } : {}),
		},
	};
}

// --- Jog Dial preset ---------------------------------------------------------
/**
 * A Jog Dial preset: concentric annular-sector wedge codeButtons arranged as 4 cardinal
 * arms with 3 distance rings each, a centre Home circle button, and a Z column.
 * Uses a 14-column, 14-row group grid so the wedge shapes nestle neatly.
 *
 * Since the standard group uses an integer grid with 30px row-height, each ring
 * step occupies one cell row. The layout uses wedge-shaped codeButtons.
 */
export function createJogDialPreset(color = "primary"): GridItemModel {
	const COLS = 12;
	const xyFeed = 3000;
	const steps = [10, 1, 0.1];

	// Build cardinal wedge buttons for each direction + step
	// Layout: 7x7 grid (rows 0-6, cols 0-6 centred in 12-col group, cols 3-8)
	// The SVG wedges don't actually look right in an integer grid without free positioning,
	// so we use a simple cross layout: up/down/left/right directional buttons with step labels.

	const items: Array<GridItemModel> = [];

	// Up buttons (Y+) — stacked top-centre
	steps.forEach((s, k) => {
		items.push(btn(
			`Y+${s}`,
			`M120\nG91\nG1 Y${s} F${xyFeed}\nM121`,
			color,
			4, k, 2, 1,
			{ kind: "wedge", startAngle: -30, sweepAngle: 60, innerRadius: k / (steps.length + 1), outerRadius: (k + 1) / (steps.length + 1) },
		));
	});

	// Down buttons (Y-)
	steps.forEach((s, k) => {
		const row = steps.length + 1 + (steps.length - 1 - k);
		items.push(btn(
			`Y-${s}`,
			`M120\nG91\nG1 Y-${s} F${xyFeed}\nM121`,
			color,
			4, row, 2, 1,
			{ kind: "wedge", startAngle: 150, sweepAngle: 60, innerRadius: (steps.length - k - 1) / (steps.length + 1), outerRadius: (steps.length - k) / (steps.length + 1) },
		));
	});

	// Left buttons (X-)
	steps.forEach((s, k) => {
		items.push(btn(
			`X-${s}`,
			`M120\nG91\nG1 X-${s} F${xyFeed}\nM121`,
			color,
			k, steps.length, 1, 2,
			{ kind: "wedge", startAngle: 240, sweepAngle: 60, innerRadius: k / (steps.length + 1), outerRadius: (k + 1) / (steps.length + 1) },
		));
	});

	// Right buttons (X+)
	steps.forEach((s, k) => {
		const col = steps.length + 1 + (steps.length - 1 - k);
		items.push(btn(
			`X+${s}`,
			`M120\nG91\nG1 X${s} F${xyFeed}\nM121`,
			color,
			col, steps.length, 1, 2,
			{ kind: "wedge", startAngle: 60, sweepAngle: 60, innerRadius: (steps.length - k - 1) / (steps.length + 1), outerRadius: (steps.length - k) / (steps.length + 1) },
		));
	});

	// Centre home button (circle)
	items.push(btn(
		"",
		"G28",
		color,
		steps.length, steps.length, 2, 2,
		{ kind: "circle" },
		"mdi-home",
	));

	// Z column on the right
	const zSteps = [1, 0.1];
	const zFeed = 600;
	zSteps.forEach((s, k) => {
		items.push(btn(`Z+${s}`, `M120\nG91\nG1 Z${s} F${zFeed}\nM121`, color, steps.length * 2 + 2, k, 2, 1));
	});
	items.push(btn("", "G28 Z", color, steps.length * 2 + 2, zSteps.length, 2, 1, undefined, "mdi-home"));
	zSteps.slice().reverse().forEach((s, k) => {
		items.push(btn(`Z-${s}`, `M120\nG91\nG1 Z-${s} F${zFeed}\nM121`, color, steps.length * 2 + 2, zSteps.length + 1 + k, 2, 1));
	});

	return {
		i: newItemId(),
		x: 0, y: 0, w: 8, h: 9,
		widget: {
			type: "group",
			title: "Jog Dial",
			items,
			cols: COLS,
			rowHeight: 30,
		},
	};
}

// --- Hex Pad preset ----------------------------------------------------------
/**
 * A hex pad preset: a cluster of hexagon-shaped codeButtons in a 3x2 hex grid pattern.
 * Pre-wired for M98 macro calls (user edits the paths/labels after insertion).
 */
export function createHexPadPreset(color = "secondary"): GridItemModel {
	const COLS = 12;
	const macros = [
		{ label: "Home", code: "G28", icon: "mdi-home" },
		{ label: "Park", code: "G28\nG1 Z50 F600", icon: "mdi-parking" },
		{ label: "Fan On", code: "M106 S255" },
		{ label: "Fan Off", code: "M107" },
		{ label: "Heat Off", code: "M140 S-273.15\nM104 S-273.15" },
		{ label: "Motors Off", code: "M18" },
	];

	// 3-column hex layout: offset every other row by half a cell
	// In a standard integer grid we approximate hex by staggering rows
	const items: Array<GridItemModel> = macros.map((m, idx) => {
		const col = idx % 3;
		const row = Math.floor(idx / 3);
		// Stagger odd rows by 1 column (approximating hex offset in integer grid)
		const xOffset = row % 2 === 1 ? 1 : 0;
		return btn(
			m.label,
			m.code,
			color,
			col * 4 + xOffset, row * 3, 4, 3,
			{ kind: "polygon", sides: 6, shapeRotation: 90 },
			m.icon,
		);
	});

	return {
		i: newItemId(),
		x: 0, y: 0, w: 12, h: 7,
		widget: {
			type: "group",
			title: "Hex Pad",
			items,
			cols: COLS,
			rowHeight: 30,
		},
	};
}
