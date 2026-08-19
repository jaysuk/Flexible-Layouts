/**
 * Touch-probe command templating (pure, unit-tested).
 *
 * Each probe operation in the ProbeWidget is a user-configurable command/macro template so the actual
 * probing routine stays in the operator's own vetted macros (probe geometry is machine-specific and a
 * wrong move can crash a spindle). The template may contain placeholders that are filled in at run
 * time from the widget's inputs:
 *   {dia}    — the endmill / probe diameter (mm)
 *   {corner} — the selected corner code (FL / FR / BL / BR), for corner/centre probing
 *   {x}/{y}  — a target coordinate (mm), for bed-mesh single-point re-probing (BedMeshWidget)
 *
 * {x}/{y} are deliberately the only motion-related placeholders. Clearance height, probe deploy, and
 * tool state are machine-specific and stay the operator's macro's responsibility - not motion this UI
 * composes itself.
 */
export interface ProbeVars {
	dia?: number;
	corner?: string;
	x?: number;
	y?: number;
}

/** Trim a coordinate to 3dp and drop trailing zeros, so a derived value like 19.333333... doesn't
 *  appear in the command as a twelve-significant-figure float. */
function coord(v: number): string {
	return String(Number(v.toFixed(3)));
}

/** Substitute {dia}/{corner}/{x}/{y} placeholders in a probe command template. Only placeholders
 *  present in `vars` are substituted, so ProbeWidget's dia/corner-only calls are unaffected. */
export function buildProbeCommand(template: string, vars: ProbeVars): string {
	let result = template;
	if (vars.dia !== undefined) { result = result.split("{dia}").join(String(vars.dia)); }
	if (vars.corner !== undefined) { result = result.split("{corner}").join(vars.corner); }
	if (vars.x !== undefined) { result = result.split("{x}").join(coord(vars.x)); }
	if (vars.y !== undefined) { result = result.split("{y}").join(coord(vars.y)); }
	return result;
}

export type ProbeOp = "z" | "x" | "y" | "corner" | "centre";

/** Default, editable command templates — macro calls the operator points at their own probe routines. */
export const DEFAULT_PROBE_COMMANDS: Record<ProbeOp, string> = {
	z: 'M98 P"0:/macros/Probe/probe_z.g"',
	x: 'M98 P"0:/macros/Probe/probe_x.g"',
	y: 'M98 P"0:/macros/Probe/probe_y.g"',
	corner: 'M98 P"0:/macros/Probe/probe_corner.g"',
	centre: 'M98 P"0:/macros/Probe/probe_centre.g"',
};

/** Default template for a single bed-mesh cell (BedMeshWidget) - a separate macro from the ops above,
 *  since it needs the target X/Y and is expected to end with a report-only G30 (S-1) so the reply can
 *  be read back, not a mesh/tool-affecting probe. */
export const DEFAULT_BED_MESH_PROBE_COMMAND = 'M98 P"0:/macros/Probe/probe_point.g" X{x} Y{y}';

/** Loose shape of `sensors.probes[n]` - only the fields this needs, matching the rest of this codebase's
 *  convention of not importing DWC's typed object-model classes directly into widget code. */
export interface ProbeTriggerInfo {
	value?: Array<number>;
	threshold?: number;
	loadCell?: { force?: number } | null;
}

/**
 * Whether a Z-probe currently reads as triggered.
 *
 * Load cell probes report force and threshold in grams while `value[0]` stays raw analog counts -
 * comparing the wrong pair (as if both were the same unit) gives a meaningless result. This compares
 * whichever pair actually shares a unit, and follows the threshold's sign: a negative threshold means
 * the probe triggers when the value FALLS to it, not rises to it (RRF 3.7). Matches DWC's own
 * StatusPanel.vue (`isProbeTriggered`), added in DWC 3.7.0-beta.3 - previously XyzProbeWidget hardcoded
 * `value[0] > 500` for every probe type, which only ever happened to be right for a non-load-cell one.
 */
export function isProbeTriggered(probe: ProbeTriggerInfo | null | undefined): boolean {
	if (!probe) { return false; }
	const value = (probe.loadCell && typeof probe.loadCell.force === "number")
		? probe.loadCell.force
		: (probe.value && probe.value.length > 0) ? probe.value[0] : null;
	if (value === null) { return false; }
	const threshold = probe.threshold ?? 0;
	return threshold >= 0 ? value >= threshold : value <= threshold;
}
