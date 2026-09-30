/**
 * Copy / cut / paste of grid items (MISSING-FEATURES-PLAN §B4). Pure, apart from one in-memory slot.
 *
 * A copy is a tagged JSON envelope. It is kept in memory (so paste works between pages even when the system
 * clipboard is unavailable) AND written to the system clipboard as text by the caller's DOM `copy` event, so a
 * paste also works across browsers, profiles and machines - and a stray paste into a text box is readable JSON.
 * The DOM `copy`/`paste` events are used rather than `navigator.clipboard`, which needs a secure context and
 * does not exist on the plain-HTTP DWC that is the common case.
 */
import { shallowRef } from "vue";

import { computeItemDependencies } from "./dependencies";
import { reidItem, stripItemRuntimeFields, type GridItemModel, type LayoutDependency } from "./document";

export const CLIPBOARD_TAG = "clipboard";
/** Bumped only when the envelope's shape changes incompatibly. */
export const CLIPBOARD_VERSION = 1;
/** A paste of more than this many top-level items is almost certainly not something FL wrote. */
const MAX_ITEMS = 200;

export interface ClipboardPayload {
	flexibleLayouts: typeof CLIPBOARD_TAG;
	version: number;
	items: Array<GridItemModel>;
	/** Plugins the copied items embed, so a paste elsewhere can warn about ones that are missing. */
	requires: Array<LayoutDependency>;
}

export type ParseResult =
	| { ok: true; payload: ClipboardPayload }
	| { ok: false; reason: "empty" | "notClipboard" | "invalid" | "newer" };

/** Build a payload from live items: deep-cloned, with runtime-only fields removed. */
export function buildClipboardPayload(items: Array<GridItemModel>): ClipboardPayload {
	const cloned = JSON.parse(JSON.stringify(items)) as Array<GridItemModel>;
	for (const item of cloned) {
		stripItemRuntimeFields(item);
	}
	return { flexibleLayouts: CLIPBOARD_TAG, version: CLIPBOARD_VERSION, items: cloned, requires: computeItemDependencies(cloned) };
}

export function serializeClipboard(payload: ClipboardPayload): string {
	return JSON.stringify(payload);
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Coerce one incoming item's geometry to something the grid can place; null when it is not an item at all. */
function sanitizeItem(raw: unknown): GridItemModel | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const it = raw as Partial<GridItemModel>;
	if (!it.widget || typeof it.widget !== "object" || typeof (it.widget as { type?: unknown }).type !== "string") {
		return null;
	}
	return {
		...(it as GridItemModel),
		i: typeof it.i === "string" ? it.i : "",
		x: finite(it.x) ? Math.max(0, Math.round(it.x)) : 0,
		y: finite(it.y) ? Math.max(0, Math.round(it.y)) : 0,
		w: finite(it.w) ? Math.max(1, Math.round(it.w)) : 1,
		h: finite(it.h) ? Math.max(1, Math.round(it.h)) : 1,
	};
}

/**
 * Read clipboard text back into a payload. Accepts FL's own envelope and, as a convenience, a single exported
 * `.dwcpanel.json` file's text. Anything else is rejected without throwing.
 */
export function parseClipboardText(text: string | null | undefined): ParseResult {
	const trimmed = (text ?? "").trim();
	if (!trimmed) {
		return { ok: false, reason: "empty" };
	}
	if (trimmed[0] !== "{") {
		return { ok: false, reason: "notClipboard" };
	}
	let raw: unknown;
	try {
		raw = JSON.parse(trimmed);
	} catch {
		return { ok: false, reason: "notClipboard" };
	}
	if (!raw || typeof raw !== "object") {
		return { ok: false, reason: "notClipboard" };
	}
	const obj = raw as Record<string, unknown>;

	let rawItems: Array<unknown>;
	let version = CLIPBOARD_VERSION;
	if (obj.flexibleLayouts === CLIPBOARD_TAG) {
		if (!finite(obj.version) || obj.version < 1) {
			return { ok: false, reason: "invalid" };
		}
		version = obj.version;
		if (version > CLIPBOARD_VERSION) {
			return { ok: false, reason: "newer" };
		}
		if (!Array.isArray(obj.items)) {
			return { ok: false, reason: "invalid" };
		}
		rawItems = obj.items;
	} else if (obj.kind === "dwcpanel" && obj.item) {
		rawItems = [obj.item];
	} else {
		return { ok: false, reason: "notClipboard" };
	}

	if (rawItems.length === 0 || rawItems.length > MAX_ITEMS) {
		return { ok: false, reason: "invalid" };
	}
	const items = rawItems.map(sanitizeItem);
	if (items.some((it) => it === null)) {
		return { ok: false, reason: "invalid" };
	}
	const clean = items as Array<GridItemModel>;
	return { ok: true, payload: { flexibleLayouts: CLIPBOARD_TAG, version, items: clean, requires: computeItemDependencies(clean) } };
}

/**
 * Where a paste lands: every item gets a fresh id (deep - nested container children too), the group keeps its
 * RELATIVE layout, and the whole block goes into the first free slot (top to bottom, left to right) of the
 * destination grid - so it is placed by the destination's own geometry, whichever breakpoint it was copied from.
 * Returns the placed items; the caller appends them to the layout.
 */
export function placePasted(existing: Array<GridItemModel>, incoming: Array<GridItemModel>, cols: number): Array<GridItemModel> {
	if (incoming.length === 0) {
		return [];
	}
	const fresh = incoming.map(reidItem);
	const minX = Math.min(...fresh.map((it) => it.x));
	const minY = Math.min(...fresh.map((it) => it.y));
	const rel = fresh.map((it) => ({ it, rx: it.x - minX, ry: it.y - minY }));
	const blockW = Math.min(cols, Math.max(...rel.map((r) => r.rx + r.it.w)));

	const overlaps = (ox: number, oy: number): boolean => rel.some(({ it, rx, ry }) => {
		const x = ox + Math.min(rx, cols - 1);
		const w = Math.min(it.w, cols - x);
		const y = oy + ry;
		return existing.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + it.h > p.y);
	});

	let px = 0;
	let py = 0;
	search: for (py = 0; ; py++) {
		for (px = 0; px + blockW <= cols; px++) {
			if (!overlaps(px, py)) {
				break search;
			}
		}
	}
	return rel.map(({ it, rx, ry }) => {
		const x = px + Math.min(rx, cols - 1);
		return { ...it, x, y: py + ry, w: Math.min(it.w, cols - x), h: it.h };
	});
}

// The in-memory slot. Module-level so it survives page changes (one FlexPage instance per page).
const memory = shallowRef<ClipboardPayload | null>(null);

export function setClipboardMemory(payload: ClipboardPayload | null): void {
	memory.value = payload;
}
export function getClipboardMemory(): ClipboardPayload | null {
	return memory.value;
}
/** Reactive: true when a paste has something to paste. */
export function useClipboardMemory() {
	return memory;
}

/**
 * Put text on the system clipboard from a click (not a copy event), best-effort. `navigator.clipboard` where the
 * page is a secure context; otherwise a throwaway textarea + `execCommand("copy")`, which also works over plain
 * HTTP. Returns whether the system clipboard was written - the in-memory slot works either way.
 */
export async function writeSystemClipboard(text: string): Promise<boolean> {
	try {
		if (typeof navigator !== "undefined" && navigator.clipboard?.writeText && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// fall through to the execCommand path
	}
	try {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.setAttribute("readonly", "");
		ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand("copy");
		ta.remove();
		return ok;
	} catch {
		return false;
	}
}

/**
 * Should a global copy / cut / paste / duplicate shortcut leave the event alone? True while typing in a field or an
 * editor, while a dialog is open, or while the user has real text selected - the browser's own behaviour wins.
 */
export function shouldIgnoreClipboardEvent(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .monaco-editor')) {
		return true;
	}
	if (typeof document !== "undefined" && document.querySelector(".v-overlay--active")) {
		return true;
	}
	return false;
}

// Several FlexPage instances can be mounted at once (the status region and the current page are both editable).
// Whichever the user last pressed on owns the keyboard shortcuts; before any press, the main page does.
let activeEditor: symbol | null = null;
export function claimActiveEditor(id: symbol): void {
	activeEditor = id;
}
export function isActiveEditor(id: symbol, isPrimary: boolean): boolean {
	return activeEditor === null ? isPrimary : activeEditor === id;
}
export function resetActiveEditorForTests(): void {
	activeEditor = null;
}
