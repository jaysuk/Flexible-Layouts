/**
 * Pure geometry helpers for the editor's multi-select align / distribute / match-size actions.
 *
 * Each takes the current layout, the set of selected item ids and the grid column count, and returns
 * a NEW layout array with the selected items moved/resized (non-selected items pass through
 * untouched). Kept free of Vue/store so the maths is unit-testable in isolation; FlexPage calls these
 * then persists + records one undo step. The grid uses free placement (no compaction/collision), so
 * the positions these produce stay exactly as computed even if panels end up overlapping.
 */
import type { GridItemModel } from "./document";

export type AlignMode = "left" | "centerH" | "right" | "top" | "middleV" | "bottom";

/** Keep an item's geometry valid for the grid: width ≤ cols, x within [0, cols-w], y/h ≥ 0/1. */
export function clampGeom(it: GridItemModel, cols: number): GridItemModel {
	const w = Math.max(1, Math.min(Math.round(it.w), cols));
	const x = Math.max(0, Math.min(Math.round(it.x), cols - w));
	return { ...it, w, x, y: Math.max(0, Math.round(it.y)), h: Math.max(1, Math.round(it.h)) };
}

/** Align the selected items' edges/centres to the selection's bounding box. Needs ≥2 selected. */
export function alignItems(layout: Array<GridItemModel>, ids: Set<string>, mode: AlignMode, cols: number): Array<GridItemModel> {
	const sel = layout.filter((it) => ids.has(it.i));
	if (sel.length < 2) {
		return layout;
	}
	const minX = Math.min(...sel.map((it) => it.x));
	const maxR = Math.max(...sel.map((it) => it.x + it.w));
	const minY = Math.min(...sel.map((it) => it.y));
	const maxB = Math.max(...sel.map((it) => it.y + it.h));
	const patch = (it: GridItemModel): Partial<GridItemModel> => {
		switch (mode) {
			case "left": return { x: minX };
			case "right": return { x: maxR - it.w };
			case "centerH": return { x: (minX + maxR) / 2 - it.w / 2 };
			case "top": return { y: minY };
			case "bottom": return { y: maxB - it.h };
			case "middleV": return { y: (minY + maxB) / 2 - it.h / 2 };
		}
	};
	return layout.map((it) => (ids.has(it.i) ? clampGeom({ ...it, ...patch(it) }, cols) : it));
}

/** Resize every selected item's width or height to match the first selected item. Needs ≥2 selected. */
export function matchSize(layout: Array<GridItemModel>, ids: Set<string>, dim: "w" | "h", cols: number): Array<GridItemModel> {
	const sel = layout.filter((it) => ids.has(it.i));
	if (sel.length < 2) {
		return layout;
	}
	const value = sel[0][dim];
	return layout.map((it) => (ids.has(it.i) ? clampGeom({ ...it, [dim]: value }, cols) : it));
}

/** Evenly space the inner selected items' centres between the two outermost; ends stay put. Needs ≥3. */
export function distributeItems(layout: Array<GridItemModel>, ids: Set<string>, axis: "x" | "y", cols: number): Array<GridItemModel> {
	const sizeKey = axis === "x" ? "w" : "h";
	const sel = layout
		.filter((it) => ids.has(it.i))
		.sort((a, b) => (a[axis] + a[sizeKey] / 2) - (b[axis] + b[sizeKey] / 2));
	if (sel.length < 3) {
		return layout;
	}
	const firstC = sel[0][axis] + sel[0][sizeKey] / 2;
	const lastC = sel[sel.length - 1][axis] + sel[sel.length - 1][sizeKey] / 2;
	const step = (lastC - firstC) / (sel.length - 1);
	const moved = new Map<string, number>();
	sel.forEach((it, i) => {
		if (i > 0 && i < sel.length - 1) {
			moved.set(it.i, firstC + step * i - it[sizeKey] / 2);
		}
	});
	return layout.map((it) => (moved.has(it.i) ? clampGeom({ ...it, [axis]: moved.get(it.i)! }, cols) : it));
}
