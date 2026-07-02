/**
 * Global, module-level edit-mode flag for the Flexible Layouts shell.
 *
 * Kept as a plain module singleton (not Pinia) because it is pure ephemeral UI state -
 * it never persists and never round-trips through the settings file. The custom shell's
 * app-bar toggle flips it; the page canvas and every GridItem read it to decide whether to
 * show editing chrome (drag handles, resize grips, delete buttons) or render cleanly.
 */
import { ref } from "vue";

import { can, requestAdmin } from "./access";

/** True while the user is actively editing page layouts */
export const editMode = ref(false);

/** Flip edit mode on/off */
export function toggleEditMode(): void {
	editMode.value = !editMode.value;
}

/**
 * Toggle edit mode, but require Admin first when entering and it isn't already granted. All edit
 * entry points (shell Edit button, page toolbar) call this so restricted levels can't sidestep it.
 */
export async function attemptToggleEdit(): Promise<void> {
	if (!editMode.value && !can("editLayout")) {
		if (!(await requestAdmin())) {
			return;
		}
	}
	toggleEditMode();
}

/** Force edit mode off - called when the custom layout is deactivated */
export function exitEditMode(): void {
	editMode.value = false;
}
