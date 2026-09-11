/**
 * CNC/Laser vs FFF machine-mode check, shared by anything that only makes sense on a router or
 * laser - the Dashboard/status-bar layout seeders (builtinPages.ts) branch their panel set on this,
 * and Vector Import (index.ts's nav condition + VectorImportPage.vue's own cut gate) hides/blocks
 * itself entirely outside it, since generating router/laser G-code for an FFF printer is simply
 * wrong, not just "needs a capability" like the ordinary runJobs gate.
 *
 * Pure and dependency-free (same convention as util/conditions.ts) so every caller wraps it in its
 * own computed/function for reactivity rather than this module reaching into a store itself.
 */
import { MachineMode } from "@duet3d/objectmodel";

export function isCncOrLaserMode(mode: string | undefined): boolean {
	return mode === MachineMode.cnc || mode === MachineMode.laser;
}
