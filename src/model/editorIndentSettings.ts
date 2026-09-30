/**
 * How the G-code editor treats whitespace, shared by every open `GcodeCmEditor.vue`:
 *
 *  - `editorTabWidth` - how many spaces one tab is (default 4). The Tab key inserts that many spaces,
 *    existing tabs are drawn that wide, and saving converts every tab in the file to spaces at that
 *    width (`dwc-gcode-editor`'s `indentation.ts`).
 *  - `editorShowWhitespace` - the toolbar toggle that draws dots for spaces and arrows for tabs.
 *
 * Both are reactive refs the editors `watch`, so a change from the Settings page (or the toolbar button
 * of another open tab) applies to every open editor at once. Persisted in this browser's localStorage,
 * like `editorPreference.ts`'s choice of editor - every access is try/catch'd and an unreadable or
 * corrupt value falls back to the default rather than throwing.
 */
import { ref } from "vue";
import { DEFAULT_TAB_WIDTH, normaliseTabWidth } from "dwc-gcode-editor";

const TAB_WIDTH_KEY = "flexibleLayouts.editorTabWidth";
const SHOW_WHITESPACE_KEY = "flexibleLayouts.editorShowWhitespace";

function read(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Storage blocked (private window, quota): the value still holds for this page load.
	}
}

export const editorTabWidth = ref<number>(normaliseTabWidth(read(TAB_WIDTH_KEY) ?? DEFAULT_TAB_WIDTH));
export const editorShowWhitespace = ref<boolean>(read(SHOW_WHITESPACE_KEY) === "1");

/** Sets and saves the tab width. Anything that is not a whole number of spaces from 1 to 16 is
 *  normalised (see `normaliseTabWidth`); returns the width actually in force. */
export function setEditorTabWidth(value: unknown): number {
	const width = normaliseTabWidth(value);
	editorTabWidth.value = width;
	write(TAB_WIDTH_KEY, String(width));
	return width;
}

export function setEditorShowWhitespace(on: boolean): void {
	editorShowWhitespace.value = on;
	write(SHOW_WHITESPACE_KEY, on ? "1" : "0");
}
