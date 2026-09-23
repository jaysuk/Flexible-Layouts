/**
 * The connected mainboard's firmware version, but ONLY when `dwc-gcode-core`'s object-model schema
 * has real data for that EXACT version string — for `walkExecution`'s own `objectModelVersion` option
 * (offline stepper: flag a typo'd/nonexistent object-model path as a hard error instead of pausing to
 * ask for a value that could never be right). Deliberately NOT a "nearest version" fallback: a real
 * board's `firmwareVersion` can carry a build suffix or simply predate/postdate the small tracked
 * window (`OBJECT_MODEL_VERSIONS`), and passing an untracked string straight through would make
 * `walkExecution` throw internally on EVERY blocking condition (worse than today's plain "always
 * pause and ask") rather than fail closed to the existing, safe behaviour. `undefined` (not `null`,
 * matching `walkExecution`'s own optional-option convention) whenever the exact string isn't a
 * known, `hasData: true` entry — including when disconnected.
 *
 * Ported from `duet-gcode-postprocessor`'s own `dwc/machineSnapshot.ts` (`trackedObjectModelVersion`)
 * — same firmware-version lookup `GcodeCmEditor.vue`'s own `checkForErrors` already does inline
 * (`boards?.[0]?.firmwareVersion`), reused here rather than duplicated a third time.
 */

import { OBJECT_MODEL_VERSIONS } from "dwc-gcode-core";

export function trackedObjectModelVersion(model: unknown): string | undefined {
	const version = (model as { boards?: Array<{ firmwareVersion?: string }> })?.boards?.[0]?.firmwareVersion;
	if (typeof version !== "string" || version === "") return undefined;
	return OBJECT_MODEL_VERSIONS.find((v) => v.version === version && v.hasData)?.version;
}
