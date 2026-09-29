/**
 * Whether the Explorer panel's G-code files open in `dwc-gcode-editor` (CodeMirror 6, real syntax
 * highlighting + diagnostics + no 200 MB in-memory-string ceiling) instead of DWC's own bundled
 * Monaco editor — see `duet-gcode-postprocessor/docs/gcode-editor-plan.md` for why this exists at
 * all. Off by default: the new editor only handles G-code syntax today (no menu-file/STM32
 * `board.txt`/plain-text support the way Monaco's `@duet3d/monacotokens` does), so this is an
 * explicit opt-in, not a replacement — `shouldUseNewGcodeEditor` only ever says yes for a file
 * `dwc-gcode-core`'s own `classifyFile` reports as G-code syntax; everything else always uses
 * Monaco regardless of the setting. Kept here (not inline in `ExplorerPanel.vue`) so the actual
 * decision logic gets real unit test coverage rather than being untestable inside a `<script setup>`
 * with no exposed surface.
 */
import { classifyFile } from "dwc-gcode-core";

const KEY = "flexibleLayouts.useGcodeEditor";
const REPLACE_EXPLORER_KEY = "flexibleLayouts.replaceExplorerPage";

function ls(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function isNewGcodeEditorEnabled(): boolean {
	return ls()?.getItem(KEY) === "1";
}

export function setNewGcodeEditorEnabled(on: boolean): void {
	ls()?.setItem(KEY, on ? "1" : "0");
}

/** Whether `filename` should open in `dwc-gcode-editor` rather than Monaco: the setting is on, AND
 *  the file is one `dwc-gcode-core` classifies as G-code syntax (covers RRF's well-known files by
 *  name/role too - `config.g`, macros, print files - not just a `.g`/`.gcode` extension check). */
export function shouldUseNewGcodeEditor(filename: string): boolean {
	return isNewGcodeEditorEnabled() && classifyFile(filename).syntax === "gcode";
}

/** The user's choice to replace DWC's own Explorer page with Flexible Layouts' (which opens G-code in
 *  the new editor). Only meaningful together with the new editor - see `shouldReplaceExplorerPage`. */
export function isExplorerReplaceEnabled(): boolean {
	return ls()?.getItem(REPLACE_EXPLORER_KEY) === "1";
}

export function setExplorerReplaceEnabled(on: boolean): void {
	ls()?.setItem(REPLACE_EXPLORER_KEY, on ? "1" : "0");
}

/** Whether the stock Explorer route should render Flexible Layouts' page instead: the replacement is
 *  chosen AND the new editor is on (without it the replacement would just be a worse Explorer). Read
 *  once at plugin load - route overrides are installed with the layout and can't change afterwards, so
 *  toggling it in Settings takes effect after a reload. */
export function shouldReplaceExplorerPage(): boolean {
	return isNewGcodeEditorEnabled() && isExplorerReplaceEnabled();
}
