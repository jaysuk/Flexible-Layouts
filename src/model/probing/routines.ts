/**
 * Pure, G-code-emitting probe routines shared by the tool-length, skew, bore/boss and edge probe
 * modes in ProbeRoutinesWidget.vue. All motion uses G38.2 + G10 L20, consistent with xyzProbe.ts,
 * and the fast->backoff->slow two-stage touch AxisControl uses (a single-speed touch stops on the
 * first contact bounce; the slower re-touch after backing off is the more repeatable reading).
 *
 * Each routine here only performs the PHYSICAL touch (and returns the machine to a known spot) - it
 * does not itself decide what to do with the result. The widget reads the machine's position back
 * from the object model after each touch completes and calls the compute* helpers below, then issues
 * a separate, explicit follow-up command (shown to the operator in a confirm dialog first). This
 * mirrors xyzProbe.ts's split between "what moves the machine" (pure, tested exhaustively) and "what
 * decides based on a live reading" (the widget, covered by the mount/registry smoke test instead).
 */

export interface TouchParams {
	probeIndex: number;
	axis: "X" | "Y" | "Z";
	/** Which way the axis moves during the search: +1 or -1. */
	direction: 1 | -1;
	/** Magnitude of the fast search move (mm), positive. */
	searchDistance: number;
	/** Magnitude to back off after the fast touch, before the slower confirm touch (mm), positive. */
	backoff: number;
	feedFast: number;
	feedSlow: number;
}

function fmt(n: number): string {
	// Trim floating noise (e.g. 9.999999999999998) without imposing a fixed decimal count that
	// would round a genuinely precise input.
	return String(Math.round(n * 1e6) / 1e6);
}

/**
 * Fast probe -> back off -> slow re-probe along one axis, relative motion only (G91) so it composes
 * safely from wherever the machine currently is. Leaves the machine at the slow touch's contact
 * point - the caller reads machinePosition back from there.
 */
export function buildTouch(p: TouchParams): string {
	const d = p.direction;
	return [
		"G91",
		`G38.2 K${p.probeIndex} ${p.axis}${fmt(d * p.searchDistance)} F${p.feedFast}`,
		`G1 ${p.axis}${fmt(-d * p.backoff)} F${p.feedSlow}`,
		`G38.2 K${p.probeIndex} ${p.axis}${fmt(d * p.backoff * 2)} F${p.feedSlow}`,
		"G90",
	].join("\n");
}

/** G10 L20 - set the CURRENT physical position as `value` in the given axis of the given WCS (or the
 *  active one if wcsIndex is null). The standard way to "zero here" after a touch. */
export function buildSetWorkOffset(axis: "X" | "Y" | "Z", value: number, wcsIndex: number | null = null): string {
	const p = wcsIndex === null ? "" : ` P${wcsIndex + 1}`;
	return `G10 L20${p} ${axis}${fmt(value)}`;
}

/** G10 L1 - set tool `toolNumber`'s Z offset directly to `value` (not "relative to current
 *  position" - tool offsets have no L20-equivalent convenience, unlike WCS offsets). */
export function buildToolOffset(toolNumber: number, value: number): string {
	return `G10 L1 P${toolNumber} Z${fmt(value)}`;
}

/**
 * G68 - apply coordinate rotation about (centreX, centreY) in the current WCS.
 *
 * `R` is positive-anticlockwise, and RRF applies it as `machine = R(+angle) · programmed`
 * (GCodes3.cpp's `RotateCoordinates`: `newX = dx·cos − dy·sin + cx`, the standard CCW matrix). So
 * passing the workpiece's own +θ rotation - which is what {@link computeSkewAngle} returns - rotates
 * nominally-square programmed geometry onto the physically skewed part, rather than away from it.
 */
export function buildRotation(angleDeg: number, centreX: number, centreY: number): string {
	return `G68 X${fmt(centreX)} Y${fmt(centreY)} R${fmt(angleDeg)}`;
}

export interface EdgeTouch {
	/** Position along the probed edge (e.g. Y, for an edge that runs in Y). */
	along: number;
	/** The measured perpendicular coordinate at that touch (e.g. X). */
	across: number;
}

/**
 * Two touches on the SAME physical edge give its rotation angle independent of probe-tip radius -
 * touching the same edge twice cancels the tip-radius error exactly (it's a constant offset present
 * in both readings). Returns the workpiece's rotation in degrees, positive = anticlockwise viewed
 * from above, which is the sign convention `G68 R` uses; 0 means the part is square to the axes.
 *
 * `probedAxis` is the axis the PROBE MOVED ALONG to touch the edge, and it is load-bearing, not
 * informational. The edge itself runs perpendicular to it, so the two cases carry opposite signs:
 *
 * - probing Y (edge runs along X): a part rotated +θ turns the edge direction (1,0) into
 *   (cos θ, sin θ), so `atan2(dAcross, dAlong) = atan2(sin θ, cos θ) = +θ`.
 * - probing X (edge runs along Y): the same +θ turns the edge direction (0,1) into
 *   (−sin θ, cos θ), so `atan2(dAcross, dAlong) = atan2(−sin θ, cos θ) = −θ`.
 *
 * Taking the raw atan2 for both (as this did before) meant the two probe axes reported opposite
 * signs for the same physical skew, so one of them fed `G68` a rotation in the wrong direction -
 * doubling the misalignment instead of removing it. Negating the X case puts both on the +θ
 * convention that {@link buildRotation} needs.
 */
export function computeSkewAngle(touch1: EdgeTouch, touch2: EdgeTouch, probedAxis: "X" | "Y"): number {
	const dAlong = touch2.along - touch1.along;
	const dAcross = touch2.across - touch1.across;
	if (dAlong === 0) {
		return 0;
	}
	const raw = Math.atan2(dAcross, dAlong) * (180 / Math.PI);
	return probedAxis === "X" ? -raw : raw;
}

export interface BoreTouches {
	xPlus: number;
	xMinus: number;
	yPlus: number;
	yMinus: number;
}

/** Centre of a bore/boss from four opposing touches (+X/-X/+Y/-Y), each the touched axis's absolute
 *  coordinate at contact. */
export function computeBoreCentre(t: BoreTouches): { x: number; y: number } {
	return { x: (t.xPlus + t.xMinus) / 2, y: (t.yPlus + t.yMinus) / 2 };
}

/**
 * Tool-length offset relative to a reference ("master") tool, both probed against the same
 * fixed-position tool setter. Positive means this tool is LONGER than the master.
 *
 * Derivation (verified against RepRapFirmware source, not just physical intuition): RRF applies
 * tool offsets as `machineCoord = userCoord - offset` (GCodes.cpp, e.g. the arc-centre transform
 * `... - Tool::GetOffset(ms.currentTool, axis)`). A longer tool's tip reaches the setter's fixed
 * physical trigger height while the spindle (whose position is what machinePosition reports) is
 * still further up, so `toolProbedZ` reads LARGER for a longer tool. Requiring the physical tip
 * height at a given user Z to be independent of which tool is fitted, and anchoring the master tool
 * to a zero offset (since it's what the work Z origin was actually zeroed with), gives
 * `offset = masterProbedZ - toolProbedZ`.
 */
export function computeToolLengthOffset(masterProbedZ: number, toolProbedZ: number): number {
	return masterProbedZ - toolProbedZ;
}
