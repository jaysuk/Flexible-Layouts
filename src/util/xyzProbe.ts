/**
 * XYZ corner touch-probe: geometry + macro G-code for probing a rectangular touch plate at any of
 * its 4 corners and setting the WCS origin, compensating for endmill radius and plate thickness.
 *
 * Adapted from the algorithm in FelixHauser/Duet-XYZ-Probe (GPL-3.0, same license as this project),
 * which itself models Ooznest's stock WorkBee XYZ touch-probe workflow - but the actual probing
 * primitive is deliberately NOT a faithful port. That plugin's macros use `M585` purely for its
 * "move until triggered" behaviour, but M585 is not a generic probing primitive: RRF source
 * (`GCodes6.cpp`'s `ProbeTool`, `GCodes4.cpp`'s `probingToolOffset4` state) and the official wiki
 * (https://github.com/Duet3D/wiki-content, Reference/Gcodes.md, "M585: Probe Tool") both confirm its
 * real, unconditional job is TOOL-OFFSET calibration - every successful call overwrites the
 * currently-selected tool's offset for that axis, independent of anything else the macro is doing.
 * The reference macros never mention this. RRF's actual purpose-built primitive for "move toward a
 * target, stop on contact" is `G38.2` (Straight Probe) - used here instead, with no tool-offset side
 * effect, requiring RRF 3.6.0+ for its `F` parameter.
 *
 * Because M585 (with an S parameter) searches all the way to the axis's physical limit, while G38.2
 * needs a real, bounded target, a `searchMargin` setting is introduced here that didn't exist in the
 * source project - see {@link XyzProbeSettings.searchMargin}.
 */
import type { MachineIO } from "dwc-config-backup-core";

export type CornerId = "FL" | "FR" | "BL" | "BR";

export interface XyzProbeSettings {
	/** Diameter of the bit currently in the spindle (mm) - compensates the probed edge position for the bit's radius. */
	endmillDiameter: number;
	/** Plate footprint along its own labelled X side (mm). */
	plateWidth: number;
	/** Plate footprint along its own labelled Y side (mm). */
	plateHeight: number;
	/** Plate thickness (mm) - the Z probe touches the plate's top face, not the true stock surface. */
	plateThickness: number;
	/** Distance from the jogged "start here" position to the plate's near edge along X (mm). */
	xOffset: number;
	/** Distance from the jogged "start here" position to the plate's near edge along Y (mm). */
	yOffset: number;
	/** Probing feedrate (mm/min). */
	feedrate: number;
	/** How far beyond the plate's assumed edge each G38.2 search is allowed to travel before it gives
	 *  up and errors (mm) - covers placement tolerance and an imprecise jogged starting position.
	 *  Also used, alone, as how far below the retracted start height the Z probe searches. */
	searchMargin: number;
}

export interface CornerParams {
	/** X direction sign (+1/-1): which way "into the stock" is for this corner. */
	xDirection: 1 | -1;
	/** Y direction sign (+1/-1). */
	yDirection: 1 | -1;
	/** X-axis offset, adjusted for this corner's rotation. */
	xOffset: number;
	/** Y-axis offset, adjusted for this corner's rotation. */
	yOffset: number;
	/** Plate X dimension, adjusted for this corner's rotation. */
	xDimension: number;
	/** Plate Y dimension, adjusted for this corner's rotation. */
	yDimension: number;
}

/**
 * The reference plugin's own corner-direction logic (Ooznest's touch-probe convention), ported
 * verbatim: the plate is physically rotated so its ledge always sits on the corner being probed,
 * which means for FR/BL the X and Y settings need to swap - the plate's own X side is now running
 * along the machine's Y axis, and vice versa.
 */
export function computeCornerParams(corner: CornerId, settings: XyzProbeSettings): CornerParams {
	const xDirection: 1 | -1 = (corner === "FR" || corner === "BR") ? -1 : 1;
	const yDirection: 1 | -1 = (corner === "BL" || corner === "BR") ? -1 : 1;
	const swap = !(corner === "FL" || corner === "BR");
	return {
		xDirection, yDirection,
		xOffset: swap ? settings.yOffset : settings.xOffset,
		yOffset: swap ? settings.xOffset : settings.yOffset,
		xDimension: swap ? settings.plateHeight : settings.plateWidth,
		yDimension: swap ? settings.plateWidth : settings.plateHeight,
	};
}

/** Default folder the four macros deploy to - deliberately NOT `0:/macros/Probe/`, which
 *  ProbeWidget's own operator-owned "corner" op already uses by default. */
export const XYZ_PROBE_MACRO_FOLDER = "0:/macros/XyzProbe";

export const XYZ_PROBE_CORNER_FILE = "xyz_corner.g";
export const XYZ_PROBE_X_FILE = "xyz_x.g";
export const XYZ_PROBE_Y_FILE = "xyz_y.g";
export const XYZ_PROBE_Z_FILE = "xyz_z.g";

/**
 * Builds the M98 call for one macro: 9 parameters (A-J), corner geometry pre-computed so the macros
 * themselves don't need to branch on which corner was selected. `toFixed(4)` for decimals and a
 * rounded integer feedrate match the formatting the reference plugin itself uses.
 */
export function buildXyzProbeCommand(macroFolder: string, macroFile: string, corner: CornerId, settings: XyzProbeSettings): string {
	const p = computeCornerParams(corner, settings);
	const n = (v: number): string => v.toFixed(4);
	return [
		`M98 P"${macroFolder}/${macroFile}"`,
		`A${p.xDirection}`,
		`B${p.yDirection}`,
		`C${n(settings.endmillDiameter)}`,
		`D${n(settings.plateThickness)}`,
		`E${n(p.xOffset)}`,
		`F${n(p.yOffset)}`,
		`G${n(p.xDimension)}`,
		`H${n(p.yDimension)}`,
		`I${Math.round(settings.feedrate)}`,
		`J${n(settings.searchMargin)}`,
	].join(" ");
}

const PARAM_DOC = `; param.A  X direction sign (+1 or -1) - which way "into the stock" is for this corner
; param.B  Y direction sign (+1 or -1)
; param.C  Endmill Diameter (mm)
; param.D  Plate Thickness (mm)
; param.E  X-Axis Offset (mm, corner-adjusted)
; param.F  Y-Axis Offset (mm, corner-adjusted)
; param.G  Plate X Dimension (mm, corner-adjusted)
; param.H  Plate Y Dimension (mm, corner-adjusted)
; param.I  Feedrate (mm/min)
; param.J  Search overtravel margin (mm) - how far past the assumed edge each probe searches
;          before giving up`;

function macroHeader(title: string, extraDoc = PARAM_DOC): string {
	return `; ${title}
; Part of Flexible Layouts' XYZ Probe widget - adapted from the probing concept in
; FelixHauser/Duet-XYZ-Probe, using G38.2 (Straight Probe) instead of M585 so it doesn't touch
; tool offsets. Requires RRF 3.6.0 or later (G38.2's F parameter).
;
; This file is yours to customize. Just leave the param.* variables below alone: they're filled
; in automatically from the widget every time you press a button. If you replace one with a
; fixed number, that field will stop having any effect on this macro.
;
${extraDoc}

`;
}

/** Full corner probe: Z at plate center, then X edge, then Y edge, then return to the new zero. */
export const XYZ_PROBE_CORNER_MACRO = macroHeader("xyz_corner.g - XYZ corner probe for touch plate") + `G91

; Move from the jogged start position to the plate's center and probe Z
G1 Z5 F{param.I}
G1 X{(param.G / 2 - param.E) * param.A} Y{(param.H / 2 - param.F) * param.B} F{param.I}
G38.2 Z{-(5 + param.J)} F{param.I} P0
G10 L20 Z{param.D}
G1 Z5 F{param.I}

; Move past the X edge, drop to plate-side height, probe inward
G1 X{(param.G / 2 + 5 + param.C / 2) * param.A * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 X{(param.G / 2 + 5 + param.C / 2 + param.J) * param.A} F{param.I} P0
G10 L20 X{(param.E + param.C / 2) * -1 * param.A}
G1 X{-5 * param.A} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}

; Move past the Y edge, drop to plate-side height, probe inward
G1 X{(5 + param.G / 2) * param.A} Y{(param.H / 2 + 5 + param.C / 2) * param.B * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 Y{(param.H / 2 + 5 + param.C / 2 + param.J) * param.B} F{param.I} P0
G10 L20 Y{(param.F + param.C / 2) * -1 * param.B}
G1 Y{-5 * param.B} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}

; Return to the newly-set zero
G1 X{(param.G / 2 - param.E) * param.A * -1} F{param.I}
G90
G1 X0 Y0 F{param.I}
`;

/** X axis only - useful for re-zeroing X without repeating the full corner sequence. */
export const XYZ_PROBE_X_MACRO = macroHeader("xyz_x.g - X-only probe for touch plate") + `G91

G1 Z5 F{param.I}
G1 X{(param.G / 2 - param.E) * param.A} Y{(param.H / 2 - param.F) * param.B} F{param.I}
G1 X{(param.G / 2 + 5 + param.C / 2) * param.A * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 X{(param.G / 2 + 5 + param.C / 2 + param.J) * param.A} F{param.I} P0
G10 L20 X{(param.E + param.C / 2) * -1 * param.A}
G1 X{-5 * param.A} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}
G1 Y{(param.H / 2 - param.F) * param.B * -1} F{param.I}

G90
G1 X0 F{param.I}
`;

/** Y axis only. */
export const XYZ_PROBE_Y_MACRO = macroHeader("xyz_y.g - Y-only probe for touch plate") + `G91

G1 Z5 F{param.I}
G1 X{(param.G / 2 - param.E) * param.A} Y{(param.H / 2 - param.F) * param.B} F{param.I}
G1 Y{(param.H / 2 + 5 + param.C / 2) * param.B * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 Y{(param.H / 2 + 5 + param.C / 2 + param.J) * param.B} F{param.I} P0
G10 L20 Y{(param.F + param.C / 2) * -1 * param.B}
G1 Y{-5 * param.B} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}
G1 X{(param.G / 2 - param.E) * param.A * -1} F{param.I}

G90
G1 Y0 F{param.I}
`;

/** Z only - probes straight down wherever the machine currently is, no XY positioning. Re-checks Z
 *  without repeating a full corner probe. */
export const XYZ_PROBE_Z_MACRO = macroHeader(
	"xyz_z.g - Z-only probe for touch plate",
	`; param.D  Plate Thickness (mm)
; param.I  Feedrate (mm/min)
; param.J  Search overtravel margin (mm)
;
; Probes straight down wherever the machine currently is - use this to re-check Z without
; repeating a full corner probe.`,
) + `G91

G38.2 Z{-(5 + param.J)} F{param.I} P0
G10 L20 Z{param.D}
G1 Z5 F{param.I}

G90
`;

export const XYZ_PROBE_MACROS: Record<string, string> = {
	[XYZ_PROBE_CORNER_FILE]: XYZ_PROBE_CORNER_MACRO,
	[XYZ_PROBE_X_FILE]: XYZ_PROBE_X_MACRO,
	[XYZ_PROBE_Y_FILE]: XYZ_PROBE_Y_MACRO,
	[XYZ_PROBE_Z_FILE]: XYZ_PROBE_Z_MACRO,
};

/** Upload all 4 default macro files to `macroFolder` (unconditionally - used for both first-time
 *  deploy and the "Restore macros" action). Returns false without partial success reporting if any
 *  upload fails - the caller decides what to tell the user, this just does the writes. */
export async function deployXyzProbeMacros(io: Pick<MachineIO, "upload">, macroFolder: string): Promise<boolean> {
	try {
		for (const [name, content] of Object.entries(XYZ_PROBE_MACROS)) {
			await io.upload(`${macroFolder}/${name}`, new Blob([content], { type: "text/plain" }));
		}
		return true;
	} catch {
		return false;
	}
}

/** Whether the macros need deploying: true if the corner macro is missing (checked via a download
 *  attempt, since MachineIO has no dedicated "exists" call) or the check itself fails (offline). */
export async function xyzProbeMacrosMissing(io: Pick<MachineIO, "downloadText">, macroFolder: string): Promise<boolean> {
	try {
		await io.downloadText(`${macroFolder}/${XYZ_PROBE_CORNER_FILE}`);
		return false;
	} catch {
		return true;
	}
}
