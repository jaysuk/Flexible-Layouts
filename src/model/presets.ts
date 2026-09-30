/**
 * Built-in sample layouts the user can drop in to see what's possible.
 *
 * The samples now live in the starter-layout registry (`starterLayouts.ts`), which the picker, the first-run
 * welcome and the tests all share. Kept as a thin wrapper so existing callers of `loadCncPreset` keep working.
 */
import { createStarterPage } from "./starterLayouts";

/** Create and populate a sample CNC control page. Returns its route path. */
export function loadCncPreset(): string {
	return createStarterPage("cnc");
}
