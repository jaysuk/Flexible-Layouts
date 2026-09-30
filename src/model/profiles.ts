/**
 * Layout profiles: switching between several complete named interfaces.
 *
 * The persisted data + pure CRUD live in store.ts; this module wraps the active-profile switch with
 * the same route/theme re-wiring used by import, so changing profile swaps the whole UI cleanly.
 */
import { recomputeDependencies } from "./dependencies";
import { registerExistingCustomPages, unregisterAllCustomPages } from "./pageManager";
import { deleteProfile as deleteProfileData, getActiveProfileId, getSharedActiveProfileId, listProfiles, setActiveProfileId, setDeviceProfileOverride } from "./store";
import { applyTheme } from "./theme";

/** Tear down the current profile's routes, point at `id`, then re-wire routes + theme. */
export function switchProfile(id: string): void {
	unregisterAllCustomPages();
	setActiveProfileId(id);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
}

/**
 * Show `id` on THIS device only (an automatic switch): custom-page routes and theme are re-wired exactly as for a manual
 * switch, but nothing shared is written - the layout document's active pointer is left alone. Returns false when there
 * is no such profile or it is already showing.
 */
export function showProfileOnThisDevice(id: string): boolean {
	if (!listProfiles().some((p) => p.id === id) || getActiveProfileId() === id) {
		return false;
	}
	unregisterAllCustomPages();
	setDeviceProfileOverride(id);
	registerExistingCustomPages();
	applyTheme();
	recomputeDependencies();
	return true;
}

/** Stop showing an automatically chosen profile on this device: follow the shared default again. */
export function followSharedProfile(): void {
	switchProfile(getSharedActiveProfileId());
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
