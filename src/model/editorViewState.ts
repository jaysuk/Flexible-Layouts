/**
 * Where every `GcodeCmEditor` remembers each file's cursor and scroll position, so a file reopened - a tab that
 * was closed, or an Explorer that was left and came back - opens where it was left. One store shared by all
 * instances (a new instance has to find what the last one saved), in memory only: it lasts as long as the
 * browser page, like the Explorer session that holds the open tabs (`explorerSession.ts`).
 */
import { createMemoryViewStateStore, type ViewStateStore } from "dwc-gcode-editor";

let store: ViewStateStore | null = null;

export function sharedViewStates(): ViewStateStore {
	return store ??= createMemoryViewStateStore();
}

/** Forget every remembered position (tests). */
export function clearViewStates(): void {
	store = null;
}
