/**
 * Touch-probe command templating (pure, unit-tested).
 *
 * Each probe operation in the ProbeWidget is a user-configurable command/macro template so the actual
 * probing routine stays in the operator's own vetted macros (probe geometry is machine-specific and a
 * wrong move can crash a spindle). The template may contain placeholders that are filled in at run
 * time from the widget's inputs:
 *   {dia}    — the endmill / probe diameter (mm)
 *   {corner} — the selected corner code (FL / FR / BL / BR), for corner/centre probing
 */
export interface ProbeVars {
	dia: number;
	corner: string;
}

/** Substitute {dia} / {corner} placeholders in a probe command template. */
export function buildProbeCommand(template: string, vars: ProbeVars): string {
	return template
		.split("{dia}").join(String(vars.dia))
		.split("{corner}").join(vars.corner);
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
