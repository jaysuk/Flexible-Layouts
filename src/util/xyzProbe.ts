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
	/** Which Z-probe (`sensors.probes[n]`) the macros actually use, passed through to every G38.2's
	 *  `K` parameter. Previously the macros hardcoded `K0` while the widget's status chip read
	 *  whichever probe the user configured, so a non-zero setting showed one probe's state while
	 *  physically probing with another. */
	probeIndex: number;
	/**
	 * How far past the EXPECTED CONTACT POINT each G38.2 keeps searching before giving up and
	 * erroring (mm) - covers placement tolerance and an imprecise jogged starting position.
	 *
	 * Each edge probe positions the tool exactly 5mm clear of the plate face first, so it searches
	 * `5 + searchMargin`. Up to macro set version 3 the X/Y searches instead asked for the whole
	 * return-to-centre distance plus this margin - roughly 48mm on default settings, i.e. ~43mm PAST
	 * contact - so a probe that failed to trigger drove the endmill clean through the plate and out
	 * the far side of its centre, rather than stopping just past where the edge should have been.
	 */
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
 * Parameter letters that must never be used to pass a value to a macro via M98.
 *
 * `G` and `M` are fatal at the PARSER level, before the macro is ever entered: RRF's
 * `StringParser::FindParameters` (src/GCodes/GCodeBuffer/StringParser.cpp) documents its own rule as
 * "we assume that a G or M not inside quotes or { } and not preceded by ' is the start of a new
 * command", and implements it as a bare `break` out of the parameter scan. So an `M98 ... G60 H40
 * I500` line is silently CUT IN TWO: the M98 keeps only the parameters before the `G`, and the rest
 * of the line is re-parsed as a separate `G60` command (which really exists - "save position to
 * slot"). Every parameter from the offending letter onward simply never reaches the macro, and the
 * first `{param.<missing>}` the macro evaluates aborts it with an unknown-value error - before any
 * motion at all. FL shipped `G` as the plate X dimension up to macro set version 2, which is exactly
 * why nothing ever moved; `L` carries it from version 3 on.
 *
 * `P` and `R` are reserved by M98 itself (P is the filename, R marks a restartable macro) - the
 * wiki's "Macro parameters" section (Duet3D/wiki-content, Reference/Gcode_meta_commands.md) states
 * this outright. `N` is the line-number prefix and `T` reads as a tool-change command letter.
 */
export const M98_FORBIDDEN_PARAM_LETTERS: ReadonlySet<string> = new Set(["G", "M", "N", "P", "R", "T"]);

/**
 * Builds the M98 call for one macro: 11 parameters, corner geometry pre-computed so the macros
 * themselves don't need to branch on which corner was selected. `toFixed(4)` for decimals and
 * rounded integers for the feedrate and probe index match the formatting the reference plugin uses.
 *
 * Letters skip `G` entirely (see {@link M98_FORBIDDEN_PARAM_LETTERS}), so the plate X dimension is
 * carried on `L`. `K` is the probe index, chosen to match the `K` word G38.2 itself takes for the
 * same thing, so the macros read `G38.2 ... K{param.K}`.
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
		`L${n(p.xDimension)}`,
		`H${n(p.yDimension)}`,
		`I${Math.round(settings.feedrate)}`,
		`J${n(settings.searchMargin)}`,
		`K${Math.max(0, Math.round(settings.probeIndex))}`,
	].join(" ");
}

const PARAM_DOC = `; param.A  X direction sign (+1 or -1) - which way "into the stock" is for this corner
; param.B  Y direction sign (+1 or -1)
; param.C  Endmill Diameter (mm)
; param.D  Plate Thickness (mm)
; param.E  X-Axis Offset (mm, corner-adjusted)
; param.F  Y-Axis Offset (mm, corner-adjusted)
; param.L  Plate X Dimension (mm, corner-adjusted)
; param.H  Plate Y Dimension (mm, corner-adjusted)
; param.I  Feedrate (mm/min)
; param.J  Search overtravel margin (mm) - how far past the expected contact point each probe
;          keeps searching before giving up. Each edge probe starts 5mm clear of the plate, so
;          it searches 5+J and errors out if nothing triggered by then.
; param.K  Z-probe index, used as the K parameter of every G38.2 below`;

/**
 * Bumped whenever a change to the shipped macro templates matters enough that an already-deployed
 * copy should be flagged as outdated (e.g. the P0->K0 G38.2 fix, or adding the M291 confirmations
 * below) - see {@link xyzProbeMacrosOutdated}. The header comment explicitly invites hand-editing,
 * so a stale file is only ever flagged, never silently overwritten.
 *
 * Version 3 renamed the plate-X-dimension parameter from `G` to `K`. Anything still on version 2 or
 * below reads `param.G`, which the widget no longer sends and RRF could never have delivered anyway
 * (see {@link M98_FORBIDDEN_PARAM_LETTERS}) - such a macro cannot work at all and must be restored,
 * so the "outdated" banner is the only route back to a functioning widget for an existing install.
 */
export const MACRO_SET_VERSION = 3;

function macroHeader(title: string, extraDoc = PARAM_DOC): string {
	return `; ${title}
; FL-XYZ-PROBE-MACRO-VERSION: ${MACRO_SET_VERSION}
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
G1 X{(param.L / 2 - param.E) * param.A} Y{(param.H / 2 - param.F) * param.B} F{param.I}
G38.2 Z{-(5 + param.J)} F{param.I} K{param.K}
G10 L20 Z{param.D}
G1 Z5 F{param.I}

; Pause here (retracted, so Cancel leaves the endmill clear rather than at the touch point). RRF
; doesn't roll back the G10 L20 above on a cancelled macro, so the message says so plainly.
M291 R"Z Probed" P{"Z zeroed. Cancelling now KEEPS this Z offset. Continue to the X edge?"} S3

; Move past the X edge, drop to plate-side height, probe inward
G1 X{(param.L / 2 + 5 + param.C / 2) * param.A * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 X{(5 + param.J) * param.A} F{param.I} K{param.K}
G10 L20 X{(param.E + param.C / 2) * -1 * param.A}
G1 X{-5 * param.A} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}

; Pause here (retracted). Cancelling keeps both the Z and X offsets already set above.
M291 R"X Probed" P{"X zeroed. Cancelling now KEEPS Z+X offsets. Continue to the Y edge?"} S3

; Move past the Y edge, drop to plate-side height, probe inward
G1 X{(5 + param.L / 2) * param.A} Y{(param.H / 2 + 5 + param.C / 2) * param.B * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 Y{(5 + param.J) * param.B} F{param.I} K{param.K}
G10 L20 Y{(param.F + param.C / 2) * -1 * param.B}
G1 Y{-5 * param.B} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}

; Pause here (retracted). Cancelling keeps all three offsets already set above.
M291 R"Y Probed" P{"Y zeroed. Cancelling now KEEPS all three offsets."} S3

; Return to the newly-set zero
G1 X{(param.L / 2 - param.E) * param.A * -1} F{param.I}
G90
G1 X0 Y0 F{param.I}
`;

/** X axis only - useful for re-zeroing X without repeating the full corner sequence. */
export const XYZ_PROBE_X_MACRO = macroHeader("xyz_x.g - X-only probe for touch plate") + `G91

G1 Z5 F{param.I}
G1 X{(param.L / 2 - param.E) * param.A} Y{(param.H / 2 - param.F) * param.B} F{param.I}
G1 X{(param.L / 2 + 5 + param.C / 2) * param.A * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 X{(5 + param.J) * param.A} F{param.I} K{param.K}
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
G1 X{(param.L / 2 - param.E) * param.A} Y{(param.H / 2 - param.F) * param.B} F{param.I}
G1 Y{(param.H / 2 + 5 + param.C / 2) * param.B * -1} F{param.I}
G1 Z{-5 - param.D / 2} F{param.I}
G38.2 Y{(5 + param.J) * param.B} F{param.I} K{param.K}
G10 L20 Y{(param.F + param.C / 2) * -1 * param.B}
G1 Y{-5 * param.B} F{param.I}
G1 Z{5 + param.D / 2} F{param.I}
G1 X{(param.L / 2 - param.E) * param.A * -1} F{param.I}

G90
G1 Y0 F{param.I}
`;

/** Z only - probes straight down wherever the machine currently is, no XY positioning. Re-checks Z
 *  without repeating a full corner probe. */
export const XYZ_PROBE_Z_MACRO = macroHeader(
	"xyz_z.g - Z-only probe for touch plate",
	`; param.D  Plate Thickness (mm)
; param.I  Feedrate (mm/min)
; param.J  Search overtravel margin (mm) - searches 5+J down from where it starts
; param.K  Z-probe index, used as the K parameter of the G38.2 below
;
; Probes straight down wherever the machine currently is - use this to re-check Z without
; repeating a full corner probe.`,
) + `G91

G38.2 Z{-(5 + param.J)} F{param.I} K{param.K}
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

const VERSION_MARKER_RE = /;\s*FL-XYZ-PROBE-MACRO-VERSION:\s*(\d+)/;

/** Pure, testable: extracts the FL-XYZ-PROBE-MACRO-VERSION stamp from a macro's text; 0 if absent
 *  (a pre-versioning macro, or a user who stripped the header comment while customizing). */
export function extractMacroVersion(text: string): number {
	const m = text.match(VERSION_MARKER_RE);
	return m ? parseInt(m[1], 10) : 0;
}

/**
 * Whether the on-card corner macro is present but stamped with a version lower than (or missing)
 * {@link MACRO_SET_VERSION} - distinct from {@link xyzProbeMacrosMissing}, only meaningful once the
 * file is known to exist. Never auto-fixed: the header comment explicitly invites hand-editing, so
 * an outdated file may be a customized derivative and must only ever be flagged, with "Restore
 * macros" left as an explicit, user-initiated action. A download failure here is ambiguous between
 * "genuinely outdated" and "transient/offline", so it resolves to false - never flag a healthy
 * macro as needing an overwrite just because a request blipped.
 */
export async function xyzProbeMacrosOutdated(io: Pick<MachineIO, "downloadText">, macroFolder: string): Promise<boolean> {
	try {
		const text = await io.downloadText(`${macroFolder}/${XYZ_PROBE_CORNER_FILE}`);
		return extractMacroVersion(text) < MACRO_SET_VERSION;
	} catch {
		return false;
	}
}
