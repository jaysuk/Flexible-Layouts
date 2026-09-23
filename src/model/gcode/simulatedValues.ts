/**
 * The persistence half of an offline stepper's simulated object-model values — the pure resolver
 * logic (`createSimulatedResolvePath`, `parseSimulatedValueInput`, the `SimulatedValueOverrides`
 * type) lives in `dwc-gcode-core/stepper/simulatedValues` (shared with `duet-gcode-postprocessor`,
 * which this module's own shape mirrors) and is re-exported here unchanged; this module adds only
 * what's inherently host-specific: `localStorage`-backed persistence, which `dwc-gcode-core` can't
 * depend on (zero runtime dependencies, no browser APIs).
 */

import type { EvalValue } from "dwc-gcode-core";
import {
	createSimulatedResolvePath, parseSimulatedValueInput, type SimulatedValueOverrides,
} from "dwc-gcode-core/stepper/simulatedValues";

export { createSimulatedResolvePath, parseSimulatedValueInput, type SimulatedValueOverrides };

// ── persistence ──────────────────────────────────────────────────────────────────────────────────
//
// Lightweight per-file UI state (which hypothetical values a user picked while stepping through THIS
// file) - plain localStorage, namespaced under this plugin's own camelCase ID (matching
// editorPreference.ts's own `flexibleLayouts.*` convention) so it doesn't collide with
// duet-gcode-postprocessor's own identically-shaped `gCodePostProcessor.*` keys if both plugins are
// ever stepping through the same file path in the same browser origin. Keyed by file path, since a
// simulated value is meaningful only in the context of the specific file/macro it was answered for.

const LS_KEY_PREFIX = "flexibleLayouts.stepperSimulatedValues.";

function storageKeyFor(filePath: string): string {
	return LS_KEY_PREFIX + filePath;
}

/** Loads any simulated values previously saved for `filePath`. Never throws - a disabled/corrupt
 *  store just means "nothing saved yet". */
export function loadSimulatedOverrides(filePath: string): SimulatedValueOverrides {
	try {
		const raw = localStorage.getItem(storageKeyFor(filePath));
		if (raw === null) return new Map();
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? new Map(parsed as Array<[string, EvalValue]>) : new Map();
	} catch {
		return new Map();
	}
}

/** Saves `overrides` for `filePath`, or clears the entry once it's empty again rather than leaving a
 *  stale empty array behind. Never throws - storage can be disabled; the overrides then simply live
 *  only for this session. */
export function saveSimulatedOverrides(filePath: string, overrides: SimulatedValueOverrides): void {
	try {
		if (overrides.size === 0) {
			localStorage.removeItem(storageKeyFor(filePath));
			return;
		}
		localStorage.setItem(storageKeyFor(filePath), JSON.stringify([...overrides.entries()]));
	} catch {
		// Storage disabled - nothing to do, the in-memory overrides remain usable for this session.
	}
}
