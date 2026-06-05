/**
 * Layout profiles: switching between several complete named interfaces.
 *
 * The persisted data + pure CRUD live in store.ts; this module wraps the active-profile switch with
 * the same route/theme re-wiring used by import, so changing profile swaps the whole UI cleanly.
 */
import { recomputeDependencies } from "./dependencies";
import { registerExistingCustomPages, unregisterAllCustomPages } from "./pageManager";
import { deleteProfile as deleteProfileData, setActiveProfileId } from "./store";
import { applyTheme } from "./theme";

/** Tear down the current profile's routes, point at `id`, then re-wire routes + theme. */
export function switchProfile(id: string): void {
	unregisterAllCustomPages();
	setActiveProfileId(id);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
}

/** Delete a profile; if it was active, switch the live UI to the new active profile. */
export function deleteProfileAndSwitch(id: string): void {
	unregisterAllCustomPages();
	const newActive = deleteProfileData(id);
	setActiveProfileId(newActive);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
}
