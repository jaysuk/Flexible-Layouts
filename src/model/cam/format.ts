/**
 * G-code emission helpers for the CAM pipeline (offset -> tabs -> profile).
 *
 * FL already has two places that format G-code numbers directly (util/surfacing.ts,
 * model/probing/routines.ts) — this is NOT a shared replacement for either. Those emit a handful of
 * bounded, hand-written moves each; this drives thousands of computed coordinates through a shared
 * buffer across two cooperating modules (tabs.ts writes into a Gcode instance that profile.ts owns),
 * which is what actually justifies a builder class here. Do not "helpfully" unify the three - that
 * would be a behaviour-preserving rewrite of working, safety-critical G-code emission for zero user
 * benefit, risked on code that drives a spindle.
 *
 * Everything this produces is plain RS-274 - no RepRapFirmware expressions, no macro calls - which
 * keeps generated programs inspectable and previewable in FL's own ToolpathWidget.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/cam/format.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: F1 - `n()` now THROWS on a non-finite input instead of silently emitting "0". The
 * original swallowed a NaN/Infinity (e.g. from an empty numeric field upstream) into a literal
 * `X0 Y0` - a feed move to the work origin at cut depth, dragging the cutter across the part. The
 * caller (profile.ts) catches this and refuses to produce a program rather than emit a partial one.
 * Omitted `arc`/`fullCircle`/`dwell` - unused by anything in this port's v1 (profile-cutting) scope;
 * they exist upstream for pocketing/drilling operations that were not ported.
 */

export interface GeneratedProgram {
	/** Suggested filename, without a directory. */
	name: string;
	gcode: string;
	/** One-line human description shown before running. */
	summary: string;
	/** Anything the operator should read before pressing go. */
	warnings: string[];
}

/**
 * Rejects anything that isn't a real, finite number.
 *
 * The `typeof` half is not redundant with `isFinite`, and this is the trap it exists for: the global
 * `isFinite` COERCES, so `isFinite("")` is `true` (empty string -> 0). Vuetify does not implement
 * Vue's `v-model.number` modifier, so a cleared numeric field on the panel holds `""`, not a number -
 * verified by mounting one. Every such value therefore arrives here looking finite while being a
 * string, and `Math.round("")` is a perfectly silent `0`.
 */
function requireFinite(v: number, what: string): number {
	if (typeof v !== "number" || !Number.isFinite(v)) {
		throw new Error(`${what} must be a finite number, got ${JSON.stringify(v)}`);
	}
	return v;
}

/**
 * Trim a number to a sane number of decimals without trailing zeros.
 *
 * Throws rather than silently emitting "0" - a NaN/Infinity/non-number here means a bug upstream
 * produced a bad coordinate, and emitting a fabricated one at cut depth is worse than refusing to
 * generate a program at all. See the file header (F1) and `requireFinite` above.
 */
export function n(v: number, places = 3): string {
	const s = requireFinite(v, "G-code value").toFixed(places);
	return s.replace(/\.?0+$/, "") || "0";
}

export class Gcode {
	private lines: string[] = [];

	comment(text: string): this {
		this.lines.push(`( ${text.replace(/[()]/g, "")} )`);
		return this;
	}

	blank(): this {
		this.lines.push("");
		return this;
	}

	raw(line: string): this {
		this.lines.push(line);
		return this;
	}

	/** Preamble common to every generated program. */
	header(title: string, notes: string[] = []): this {
		this.comment(title);
		for (const note of notes) this.comment(note);
		this.raw("G21 G90 G17 G94");
		return this;
	}

	rapid(p: { x?: number; y?: number; z?: number }): this {
		return this.move("G0", p);
	}

	feed(p: { x?: number; y?: number; z?: number; f?: number }): this {
		return this.move("G1", p);
	}

	private move(code: string, p: { x?: number; y?: number; z?: number; f?: number }): this {
		let s = code;
		if (p.x !== undefined) s += ` X${n(p.x)}`;
		if (p.y !== undefined) s += ` Y${n(p.y)}`;
		if (p.z !== undefined) s += ` Z${n(p.z)}`;
		if (p.f !== undefined) s += ` F${n(p.f, 1)}`;
		this.lines.push(s);
		return this;
	}

	/**
	 * Put a tool in the spindle.
	 *
	 * A bare `T<n>` is the whole tool change: RepRapFirmware runs tfree, tpre and
	 * tpost around it. No M6 - RRF does not use one, and emitting it would either be ignored or, on a
	 * controller that does, run the change twice.
	 *
	 * Omitted rather than defaulted when no tool was chosen: `T0` is a real tool on some setups and
	 * "drop whatever is in the spindle" on others, and a program that guesses wrong there empties the
	 * spindle before a cut.
	 *
	 * Silently omitting (rather than throwing) is right here and only here: "no tool chosen" is a
	 * legitimate, supported state, so there is nothing to refuse. But it MUST use a non-coercing
	 * check - the earlier `!isFinite(tool)` passed a cleared numeric field's `""` straight through to
	 * `Math.round("")`, emitting exactly the `T0` this comment warns about, in an otherwise valid
	 * program, with no warning. See `requireFinite` above.
	 */
	toolChange(tool: number | null): this {
		if (typeof tool !== "number" || !Number.isFinite(tool) || tool < 0) return this;
		return this.raw(`T${Math.round(tool)}`);
	}

	spindleOn(rpm: number, dwellSeconds = 3): this {
		// Validated before rounding: Math.round() would turn a non-number into a silent `M3 S0`.
		this.raw(`M3 S${Math.round(requireFinite(rpm, "spindle RPM"))}`);
		if (dwellSeconds > 0) this.raw(`G4 S${n(dwellSeconds, 1)}`);
		return this;
	}

	spindleOff(): this {
		return this.raw("M5");
	}

	/**
	 * End of program.
	 *
	 * Deliberately NOT M30. Most CNC posts end a file with it, but in RepRapFirmware M30 is *delete
	 * file* and takes a filename - a bare M30 throws "expected a non-empty string" and every
	 * generated file would finish on an error. M2 is what RRF treats as end-of-job.
	 *
	 * A macro invoked with M98 must emit neither: it ends by running out of lines, and an M2 inside
	 * it would stop the job that called it.
	 */
	end(kind: "program" | "macro" = "program"): this {
		if (kind === "program") this.raw("M2");
		return this;
	}

	toString(): string {
		return this.lines.join("\n") + "\n";
	}
}

/** Depth levels from the top surface down to `total`, at most `perPass` each. */
export function depthLevels(zTop: number, total: number, perPass: number): number[] {
	const depth = Math.abs(total);
	const step = Math.max(0.01, Math.abs(perPass));
	const out: number[] = [];
	for (let d = step; d < depth - 1e-6; d += step) out.push(zTop - d);
	out.push(zTop - depth);
	return out;
}
