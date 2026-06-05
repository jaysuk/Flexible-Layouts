/**
 * Global, module-level edit-mode flag for the Flexible Layouts shell.
 *
 * Kept as a plain module singleton (not Pinia) because it is pure ephemeral UI state -
 * it never persists and never round-trips through the settings file. The custom shell's
 * app-bar toggle flips it; the page canvas and every GridItem read it to decide whether to
 * show editing chrome (drag handles, resize grips, delete buttons) or render cleanly.
 */
import { ref } from "vue";

import { isLocked, requestUnlock } from "./lock";

/** True while the user is actively editing page layouts */
export const editMode = ref(false);

/** Flip edit mode on/off */
export function toggleEditMode(): void {
	editMode.value = !editMode.value;
}

/**
 * Toggle edit mode, but require the password first when entering and the lock is enabled. All edit
 * entry points (shell Edit button, page toolbar) call this so the lock can't be sidestepped.
 */
export async function attemptToggleEdit(): Promise<void> {
	if (!editMode.value && isLocked()) {
		if (!(await requestUnlock())) {
			return;
		}
	}
	toggleEditMode();
}

/** Force edit mode off - called when the custom layout is deactivated */
export function exitEditMode(): void {
	editMode.value = false;
}
