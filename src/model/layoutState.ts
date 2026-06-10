/**
 * Active-layout helpers (DWC 3.7.0-alpha.6+ supports multiple registered custom layouts).
 *
 * DWC tracks which layout is active with `settings.useCustomLayout` (a custom layout is active at
 * all) + `settings.activeLayoutId` (which one). Flexible Layouts must key its own behaviour - showing
 * its custom pages, the escape lock, the activation prompt - on *its* layout being the active one,
 * not merely on some custom layout being active (the user may be running a different plugin's shell).
 *
 * `activeLayoutId === null` is DWC's back-compat case (settings saved before multiple layouts existed)
 * and resolves to the first registered layout; we treat that as "us", which is correct whenever
 * Flexible Layouts is the only/first custom layout.
 */
import { useSettingsStore } from "@/stores/settings";

import { LAYOUT_ID } from "./constants";

/** True when Flexible Layouts' own shell is the active layout (not built-in, not another plugin's). */
export function isFlLayoutActive(): boolean {
	const settings = useSettingsStore();
	return settings.useCustomLayout && (settings.activeLayoutId === LAYOUT_ID || settings.activeLayoutId == null);
}

/** Make Flexible Layouts the active layout. */
export function activateFlLayout(): void {
	const settings = useSettingsStore();
	settings.activeLayoutId = LAYOUT_ID;
	settings.useCustomLayout = true;
	settings.layoutUserSet = true;
}

/** Return to the built-in shell. */
export function deactivateFlLayout(): void {
	const settings = useSettingsStore();
	settings.useCustomLayout = false;
	settings.layoutUserSet = true;
}
