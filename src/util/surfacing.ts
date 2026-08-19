/**
 * Facing/surfacing G-code generation (pure, unit-tested).
 *
 * Generates a raster toolpath that skims a flat area down to a target depth - the standard operation
 * for flattening a spoilboard or a piece of rough stock before real cutting starts. The area is
 * relative to the current work coordinate origin (X0 Y0): jog to a corner and zero XY there first.
 *
 * Plain G0/G1 moves only - nothing controller-specific, so this reads the same on RRF as anywhere else.
 */
export interface SurfacingParams {
	/** Area to surface, in the X direction (mm). */
	width: number;
	/** Area to surface, in the Y direction (mm). */
	height: number;
	/** Cutting tool diameter (mm) - used to inset the raster half a tool-width past each edge, so the
	 *  cutter's edge (not its centre) reaches the true boundary, and to derive the stepover. */
	toolDiameter: number;
	/** Row spacing as a percentage of tool diameter (typically 30-50%). */
	stepoverPercent: number;
	/** Maximum depth removed per pass (mm). */
	depthPerPass: number;
	/** Total depth to remove (mm) - split into passes of at most depthPerPass each. */
	totalDepth: number;
	/** Safe Z height for rapid moves between passes (mm). */
	clearance: number;
	/** Cutting feed rate (mm/min). Plunge moves use half this. */
	feed: number;
	/** Raster direction: rows run along X (sweeping in Y) or along Y (sweeping in X). */
	direction: "x" | "y";
	/** Spindle speed (RPM) to start before cutting and stop after. 0/undefined = leave spindle control
	 *  to the operator (e.g. a separate spindle widget already running before this starts). */
	spindleRpm?: number;
	/** Seconds to dwell after M3 before the first plunge, giving the spindle time to reach speed
	 *  (default 4). M3 returns as soon as the command is accepted, not when the spindle is actually up
	 *  to speed, so without this the cutter enters the work still accelerating - which loads the tool
	 *  far harder than the programmed feed assumes. 0 skips the dwell. */
	spindleDwellSeconds?: number;
}

export interface SurfacingResult {
	gcode: string;
	/** Depth passes the job will make. */
	passes: number;
	/** Raster rows per pass. */
	rows: number;
}

function fmt(n: number): string {
	// A non-finite value must never reach the emitted file. An empty numeric field in the widget
	// arrives here as NaN, and `NaN.toFixed(3)` is the string "NaN" - which would be written out as a
	// literal `G1 XNaN`. Throwing puts the failure in front of the operator at generate time instead
	// of handing a machine a program whose coordinates are nonsense.
	if (!Number.isFinite(n)) {
		throw new Error(`Surfacing: a required value is missing or not a number (got ${n}). Check the widget's fields.`);
	}
	// Trim to 3 decimal places without trailing zeros/dot - keeps the file readable and small.
	return n.toFixed(3).replace(/\.?0+$/, "") || "0";
}

/** Seconds allowed for spindle spin-up when the program starts the spindle itself. */
export const DEFAULT_SPINDLE_DWELL_SECONDS = 4;

export function passCount(p: Pick<SurfacingParams, "totalDepth" | "depthPerPass">): number {
	return Math.max(1, Math.ceil(p.totalDepth / Math.max(0.001, p.depthPerPass)));
}

export function rowCount(p: Pick<SurfacingParams, "width" | "height" | "toolDiameter" | "stepoverPercent" | "direction">): number {
	const stepover = Math.max(0.01, p.toolDiameter * (p.stepoverPercent / 100));
	const crossLen = (p.direction === "x" ? p.height : p.width) + p.toolDiameter;
	return Math.max(1, Math.ceil(crossLen / stepover) + 1);
}

/**
 * Numeric inputs that must be real numbers before any program can be generated.
 *
 * Validating up front rather than relying on {@link fmt} alone, because a non-finite value does not
 * necessarily reach a coordinate at all - it can corrupt the loop bounds first and fail SILENTLY.
 * A NaN `totalDepth` or `depthPerPass` makes `passCount` return NaN, `pass <= NaN` is false, so the
 * depth loop never runs a single iteration and the emitter happily returns a well-formed program
 * containing a header, a clearance move and a return to origin - and no cutting whatsoever. A file
 * that quietly does nothing is harder to notice than one that errors, so this refuses at the door.
 */
const REQUIRED_NUMERIC_FIELDS = [
	"width", "height", "toolDiameter", "stepoverPercent", "depthPerPass", "totalDepth", "clearance", "feed",
] as const satisfies ReadonlyArray<keyof SurfacingParams>;

export function assertSurfacingParamsUsable(p: SurfacingParams): void {
	for (const field of REQUIRED_NUMERIC_FIELDS) {
		if (!Number.isFinite(p[field])) {
			throw new Error(`Surfacing: "${field}" is missing or not a number (got ${p[field]}). Check the widget's fields.`);
		}
	}
}

export function generateSurfacingGCode(p: SurfacingParams): SurfacingResult {
	assertSurfacingParamsUsable(p);
	const stepover = Math.max(0.01, p.toolDiameter * (p.stepoverPercent / 100));
	const passes = passCount(p);
	const rows = rowCount(p);
	const isX = p.direction === "x";
	const inset = p.toolDiameter / 2;
	const mainLen = isX ? p.width : p.height;
	const crossMin = -inset;
	const crossMax = (isX ? p.height : p.width) + inset;

	const lines: Array<string> = [
		`; Flexible Layouts surfacing: ${fmt(p.width)}x${fmt(p.height)}mm area, ${fmt(p.toolDiameter)}mm tool, ${passes} pass(es)`,
		"G21 ; mm",
		"G90 ; absolute",
	];
	if (p.spindleRpm) {
		lines.push(`M3 S${Math.round(p.spindleRpm)}`);
		// Let the spindle reach speed before anything touches the work - see spindleDwellSeconds.
		const dwell = p.spindleDwellSeconds ?? DEFAULT_SPINDLE_DWELL_SECONDS;
		if (Number.isFinite(dwell) && dwell > 0) {
			lines.push(`G4 S${fmt(dwell)}`);
		}
	}
	lines.push(`G0 Z${fmt(p.clearance)}`);

	for (let pass = 1; pass <= passes; pass++) {
		const z = -Math.min(p.totalDepth, pass * p.depthPerPass);
		lines.push(`; pass ${pass}/${passes} Z${fmt(z)}`);
		let crossPos = crossMin;
		let forward = true;
		for (let row = 0; row < rows; row++) {
			const mainStart = forward ? -inset : mainLen + inset;
			const mainEnd = forward ? mainLen + inset : -inset;
			if (row === 0) {
				lines.push(isX ? `G0 X${fmt(mainStart)} Y${fmt(crossPos)}` : `G0 X${fmt(crossPos)} Y${fmt(mainStart)}`);
				lines.push(`G1 Z${fmt(z)} F${Math.round(p.feed / 2)}`);
			}
			lines.push(isX ? `G1 X${fmt(mainEnd)} F${Math.round(p.feed)}` : `G1 Y${fmt(mainEnd)} F${Math.round(p.feed)}`);
			if (row < rows - 1) {
				crossPos = Math.min(crossMax, crossPos + stepover);
				lines.push(isX ? `G1 Y${fmt(crossPos)}` : `G1 X${fmt(crossPos)}`);
			}
			forward = !forward;
		}
		lines.push(`G0 Z${fmt(p.clearance)}`);
	}

	if (p.spindleRpm) {
		lines.push("M5");
	}
	lines.push("G0 X0 Y0");

	return { gcode: lines.join("\n") + "\n", passes, rows };
}
