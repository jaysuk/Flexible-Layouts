/**
 * Advisory pre-job checks against a parsed G-code file, adapted from AxisControl's job/preflight.ts.
 * Pure - no Vue/DWC imports - so the widget is responsible for shaping the live object model and
 * tool table into the plain inputs below.
 *
 * Deliberately advisory, never a gate: "a preflight that blocks on a check it got subtly wrong is
 * worse than no preflight, because the next thing anyone does is learn to bypass it." Every check
 * reports ok/warn/error/info; nothing here refuses to let a job start.
 */
import type { ParseResult } from "./parse";
import type { ToolTableEntry } from "../toolTable";

export type CheckLevel = "ok" | "warn" | "error" | "info";

export interface PreflightCheck {
	id: string;
	level: CheckLevel;
	message: string;
}

export interface PreflightAxis {
	letter: string;
	homed: boolean;
	/** Travel limits, machine coordinates (mm). */
	min: number;
	max: number;
	/** Max axis speed, mm/min (RRF's M203/axis.speed) - used only for the X/Y feed-vs-limit check. */
	speed: number;
	/** Current machine-coordinate position. */
	machinePosition: number;
	/** Current work-coordinate (user) position. */
	userPosition: number;
}

export interface PreflightSpindle {
	min: number;
	max: number;
}

export interface PreflightMachineState {
	axes: Array<PreflightAxis>;
	spindles: Array<PreflightSpindle>;
}

export interface PreflightOptions {
	/** Rapid traverse rate (mm/min), used only to estimate run time - RRF reports no single rapid
	 *  rate, so this is supplied by the caller (a widget setting) rather than invented here. */
	rapidRate?: number;
}

function axisFor(machine: PreflightMachineState, letter: string): PreflightAxis | undefined {
	return machine.axes.find((a) => a.letter.toUpperCase() === letter);
}

function checkAxesHomed(machine: PreflightMachineState): PreflightCheck {
	const relevant = ["X", "Y", "Z"].map((l) => axisFor(machine, l)).filter((a): a is PreflightAxis => !!a);
	const unhomed = relevant.filter((a) => !a.homed);
	if (relevant.length === 0) {
		return { id: "axesHomed", level: "info", message: "No X/Y/Z axis data available to check." };
	}
	if (unhomed.length > 0) {
		return { id: "axesHomed", level: "error", message: `Not homed: ${unhomed.map((a) => a.letter).join(", ")}.` };
	}
	return { id: "axesHomed", level: "ok", message: "X, Y and Z are homed." };
}

function checkEnvelope(parse: ParseResult, machine: PreflightMachineState): PreflightCheck {
	const breaches: Array<string> = [];
	for (const letter of ["X", "Y", "Z"] as const) {
		const axis = axisFor(machine, letter);
		if (!axis) { continue; }
		const offset = axis.machinePosition - axis.userPosition;
		const key = letter.toLowerCase() as "x" | "y" | "z";
		const jobMin = parse.min[key] + offset;
		const jobMax = parse.max[key] + offset;
		if (jobMin < axis.min - 1e-6 || jobMax > axis.max + 1e-6) {
			breaches.push(`${letter} (${jobMin.toFixed(1)}..${jobMax.toFixed(1)} vs travel ${axis.min}..${axis.max})`);
		}
	}
	if (breaches.length > 0) {
		return { id: "envelope", level: "error", message: `Toolpath exceeds the travel envelope on ${breaches.join(", ")}.` };
	}
	return { id: "envelope", level: "ok", message: "Toolpath fits within the travel envelope." };
}

function checkWorkOrigin(machine: PreflightMachineState): PreflightCheck {
	// A near-zero offset is indistinguishable from "genuinely zeroed here" vs "never set" - this can
	// only ever be a nudge, never a hard block, which is exactly why it's a warning, not an error.
	const xy = (["X", "Y"] as const).map((l) => axisFor(machine, l)).filter((a): a is PreflightAxis => !!a);
	const z = axisFor(machine, "Z");
	const xyUnset = xy.length > 0 && xy.every((a) => Math.abs(a.machinePosition - a.userPosition) < 1e-6);
	const zUnset = !!z && Math.abs(z.machinePosition - z.userPosition) < 1e-6;
	if (xyUnset && zUnset) {
		return { id: "workOrigin", level: "warn", message: "X/Y and Z work offsets both read 0 - confirm the work origin was actually set, not just never zeroed." };
	}
	if (zUnset) {
		return { id: "workOrigin", level: "warn", message: "Z work offset reads 0 - confirm Z was actually zeroed/probed for this job, not just XY." };
	}
	if (xyUnset) {
		return { id: "workOrigin", level: "warn", message: "X/Y work offset reads 0 - confirm the work origin was actually set." };
	}
	return { id: "workOrigin", level: "ok", message: "X/Y and Z work offsets are non-zero." };
}

function checkTools(parse: ParseResult, toolTable: Array<ToolTableEntry>): PreflightCheck {
	if (parse.tools.length === 0) {
		return { id: "tools", level: "info", message: "This file does not select a tool." };
	}
	const known = new Set(toolTable.map((t) => t.number));
	const unknown = parse.tools.filter((t) => !known.has(t));
	if (unknown.length > 0) {
		return { id: "tools", level: "warn", message: `Tool(s) not in the tool table: ${unknown.join(", ")}.` };
	}
	return { id: "tools", level: "ok", message: `All ${parse.tools.length} tool(s) used are in the tool table.` };
}

function checkSpindleSpeed(parse: ParseResult, machine: PreflightMachineState): PreflightCheck {
	if (parse.spindleSpeeds.length === 0) {
		return { id: "spindleSpeed", level: "info", message: "This file does not command a spindle speed." };
	}
	if (machine.spindles.length === 0) {
		return { id: "spindleSpeed", level: "info", message: "No spindle configured to check commanded speeds against." };
	}
	const outOfRange = parse.spindleSpeeds.filter((s) => !machine.spindles.some((sp) => s >= sp.min && s <= sp.max));
	if (outOfRange.length > 0) {
		return { id: "spindleSpeed", level: "warn", message: `Commanded speed(s) outside every configured spindle's range: ${outOfRange.join(", ")} RPM.` };
	}
	return { id: "spindleSpeed", level: "ok", message: "All commanded spindle speeds are within range." };
}

function checkFeedVsLimits(parse: ParseResult, machine: PreflightMachineState): PreflightCheck {
	// X/Y only - every router's Z is deliberately slower than its gantry, so checking Z here would
	// just be noise.
	const speeds = (["X", "Y"] as const).map((l) => axisFor(machine, l)?.speed).filter((s): s is number => s !== undefined && s > 0);
	if (speeds.length === 0 || parse.maxFeed === 0) {
		return { id: "feedLimit", level: "info", message: "No X/Y speed limit or commanded feed to compare." };
	}
	const limit = Math.min(...speeds);
	if (parse.maxFeed > limit) {
		return { id: "feedLimit", level: "warn", message: `Highest commanded feed (${parse.maxFeed.toFixed(0)} mm/min) exceeds the X/Y speed limit (${limit.toFixed(0)} mm/min).` };
	}
	return { id: "feedLimit", level: "ok", message: "Commanded feed rates are within the X/Y speed limit." };
}

function checkRapidsBelowZero(parse: ParseResult): PreflightCheck {
	if (parse.minRapidZ !== null && parse.minRapidZ < 0) {
		return { id: "rapidZ", level: "warn", message: `A rapid travels down to Z${parse.minRapidZ.toFixed(2)} while also moving in X/Y - check for a collision on the initial approach.` };
	}
	return { id: "rapidZ", level: "ok", message: "No rapid travels below Z0 while moving in X/Y." };
}

function checkRunTime(parse: ParseResult, opts: PreflightOptions): PreflightCheck {
	const rapidRate = opts.rapidRate;
	const rapidSeconds = rapidRate && rapidRate > 0 ? (parse.rapidLength / rapidRate) * 60 : 0;
	const totalSeconds = parse.cutSeconds + rapidSeconds;
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = Math.round(totalSeconds % 60);
	const suffix = rapidRate ? "" : " (rapids excluded - no rapid rate set)";
	return { id: "runTime", level: "info", message: `Estimated run time: ${minutes}m ${seconds}s${suffix}.` };
}

export function runPreflight(
	parse: ParseResult,
	machine: PreflightMachineState,
	toolTable: Array<ToolTableEntry>,
	opts: PreflightOptions = {},
): Array<PreflightCheck> {
	const checks: Array<PreflightCheck> = [
		checkAxesHomed(machine),
		checkEnvelope(parse, machine),
		checkWorkOrigin(machine),
		checkTools(parse, toolTable),
		checkSpindleSpeed(parse, machine),
		checkFeedVsLimits(parse, machine),
		checkRapidsBelowZero(parse),
		checkRunTime(parse, opts),
	];
	for (const w of parse.warnings) {
		checks.push({ id: `parserWarning:${w}`, level: "warn", message: w });
	}
	return checks;
}
