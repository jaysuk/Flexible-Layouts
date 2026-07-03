/**
 * Shared drag / resize / rotate / z-order logic for a "free-position" canvas, where each item's
 * x/y/w/h are percentages of the canvas rather than grid cells. Built for GroupEditor's free-mode
 * custom panels (full 2D placement + rotation). The top-bar header uses a narrower, horizontal-only
 * variant of this same idea (position + width only, no y/height/rotation/z) implemented directly in
 * HeaderWidgets.vue rather than through this composable.
 *
 * Takes a getter/setter pair rather than a plain Ref because the caller's items usually live nested
 * inside another ref (e.g. `draft.value.items`), which itself isn't a ref.
 */
import { computed, ref, type ComputedRef, type Ref } from "vue";

import type { GridItemModel } from "../model/document";

export interface FreeCanvasApi {
	selectedId: Ref<string | null>;
	/** Items sorted by freeZ ascending, so higher-z items render (and thus visually stack) last. */
	sortedItems: ComputedRef<Array<GridItemModel>>;
	freeItemStyle(item: GridItemModel): Record<string, string>;
	onItemPointerDown(e: PointerEvent, item: GridItemModel): void;
	onResizePointerDown(e: PointerEvent, item: GridItemModel): void;
	onRotatePointerDown(e: PointerEvent, item: GridItemModel): void;
	bringToFront(): void;
	sendToBack(): void;
	/** Placement + default size for a newly-added item: near the centre, cascaded so repeated adds
	 *  don't stack exactly on top of each other. */
	freePlace(): { x: number; y: number; w: number; h: number };
}

/**
 * Absolute-position style for a free-canvas item. Exported standalone (not just via
 * {@link useFreeCanvas}'s return value) so it can be unit-tested without a canvas element, and reused
 * by any purely read-only renderer that wants identical layout without the interactive
 * (pointer-event-wiring) half of this module.
 */
export function freeItemStyle(item: GridItemModel): Record<string, string> {
	const rot = item.freeRotation ?? 0;
	const z = item.freeZ ?? 0;
	const style: Record<string, string> = {
		position: "absolute",
		left: `${item.x}%`,
		top: `${item.y}%`,
		width: `${item.w}%`,
		height: `${item.h}%`,
		zIndex: String(z + 10), // +10 so even z=0 is above the canvas background
		cursor: "move",
		boxSizing: "border-box",
	};
	if (rot !== 0) {
		style.transform = `rotate(${rot}deg)`;
		style.transformOrigin = "center center";
	}
	return style;
}

/** Items sorted by freeZ ascending, so higher-z items render (and thus visually stack) last. */
export function sortByFreeZ(items: Array<GridItemModel>): Array<GridItemModel> {
	return [...items].sort((a, b) => (a.freeZ ?? 0) - (b.freeZ ?? 0));
}

export function useFreeCanvas(
	getItems: () => Array<GridItemModel>,
	setItems: (items: Array<GridItemModel>) => void,
	canvasRef: Ref<HTMLElement | null>,
): FreeCanvasApi {
	const selectedId = ref<string | null>(null);

	const sortedItems = computed<Array<GridItemModel>>(() => sortByFreeZ(getItems()));

	function canvasPx(): { w: number; h: number } {
		const el = canvasRef.value;
		if (!el) return { w: 1, h: 1 };
		return { w: el.clientWidth || 1, h: el.clientHeight || 1 };
	}

	function updateItem(id: string, patch: Partial<GridItemModel>): void {
		setItems(getItems().map((it) => (it.i === id ? { ...it, ...patch } : it)));
	}

	// ── Drag (move) ────────────────────────────────────────────────────────────
	interface DragState { itemId: string; startX: number; startY: number; origX: number; origY: number }
	let dragState: DragState | null = null;

	function onItemPointerDown(e: PointerEvent, item: GridItemModel): void {
		selectedId.value = item.i;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragState = { itemId: item.i, startX: e.clientX, startY: e.clientY, origX: item.x, origY: item.y };
		window.addEventListener("pointermove", onDragMove);
		window.addEventListener("pointerup", onDragUp, { once: true });
	}
	function onDragMove(e: PointerEvent): void {
		if (!dragState) return;
		const { w, h } = canvasPx();
		const dx = ((e.clientX - dragState.startX) / w) * 100;
		const dy = ((e.clientY - dragState.startY) / h) * 100;
		const it = getItems().find((i) => i.i === dragState!.itemId);
		if (!it) return;
		updateItem(dragState.itemId, {
			x: Math.max(0, Math.min(100 - it.w, dragState.origX + dx)),
			y: Math.max(0, Math.min(100 - it.h, dragState.origY + dy)),
		});
	}
	function onDragUp(): void {
		dragState = null;
		window.removeEventListener("pointermove", onDragMove);
	}

	// ── Resize (bottom-right corner grip) ───────────────────────────────────────
	interface ResizeState { itemId: string; startX: number; startY: number; origW: number; origH: number }
	let resizeState: ResizeState | null = null;

	function onResizePointerDown(e: PointerEvent, item: GridItemModel): void {
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		resizeState = { itemId: item.i, startX: e.clientX, startY: e.clientY, origW: item.w, origH: item.h };
		window.addEventListener("pointermove", onResizeMove);
		window.addEventListener("pointerup", onResizeUp, { once: true });
	}
	function onResizeMove(e: PointerEvent): void {
		if (!resizeState) return;
		const { w, h } = canvasPx();
		const dw = ((e.clientX - resizeState.startX) / w) * 100;
		const dh = ((e.clientY - resizeState.startY) / h) * 100;
		updateItem(resizeState.itemId, {
			w: Math.max(2, resizeState.origW + dw),
			h: Math.max(2, resizeState.origH + dh),
		});
	}
	function onResizeUp(): void {
		resizeState = null;
		window.removeEventListener("pointermove", onResizeMove);
	}

	// ── Rotate (top-centre grip; drag around the item's centre, Shift snaps to 15°) ────────────────
	let rotateState: { itemId: string; cx: number; cy: number } | null = null;

	function onRotatePointerDown(e: PointerEvent, item: GridItemModel): void {
		e.stopPropagation();
		const el = canvasRef.value;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		rotateState = {
			itemId: item.i,
			cx: rect.left + ((item.x + item.w / 2) / 100) * rect.width,
			cy: rect.top + ((item.y + item.h / 2) / 100) * rect.height,
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		window.addEventListener("pointermove", onRotateMove);
		window.addEventListener("pointerup", onRotateUp, { once: true });
	}
	function onRotateMove(e: PointerEvent): void {
		if (!rotateState) return;
		const ang = (Math.atan2(e.clientY - rotateState.cy, e.clientX - rotateState.cx) * 180) / Math.PI;
		let deg = Math.round(ang + 90); // grip sits at the top (north) → "up" reads as 0°
		if (e.shiftKey) { deg = Math.round(deg / 15) * 15; }
		updateItem(rotateState.itemId, { freeRotation: ((deg % 360) + 360) % 360 });
	}
	function onRotateUp(): void {
		rotateState = null;
		window.removeEventListener("pointermove", onRotateMove);
	}

	// ── Z-order ──────────────────────────────────────────────────────────────────
	function bringToFront(): void {
		if (!selectedId.value) return;
		const maxZ = getItems().reduce((m, it) => Math.max(m, it.freeZ ?? 0), 0);
		updateItem(selectedId.value, { freeZ: maxZ + 1 });
	}
	function sendToBack(): void {
		if (!selectedId.value) return;
		const minZ = getItems().reduce((m, it) => Math.min(m, it.freeZ ?? 0), 0);
		updateItem(selectedId.value, { freeZ: minZ - 1 });
	}

	function freePlace(): { x: number; y: number; w: number; h: number } {
		const n = getItems().length;
		const off = (n % 6) * 4;
		return { x: 30 + off, y: 30 + off, w: 20, h: 15 };
	}

	return {
		selectedId, sortedItems, freeItemStyle,
		onItemPointerDown, onResizePointerDown, onRotatePointerDown,
		bringToFront, sendToBack, freePlace,
	};
}
