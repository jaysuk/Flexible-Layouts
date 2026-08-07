import { describe, expect, it } from "vitest";

import { depthLevels, Gcode, n } from "../model/cam/format";

describe("n", () => {
	it("trims to the given number of decimals without trailing zeros", () => {
		expect(n(1.5)).toBe("1.5");
		expect(n(0.0004)).toBe("0"); // rounds to 0.000 at the default 3 places, then strips to "0"
		expect(n(1200, 1)).toBe("1200");
	});

	it("throws on a non-finite value instead of silently emitting 0 (F1)", () => {
		// A NaN/Infinity here means a bad coordinate reached the emitter - upstream silently turned
		// this into the string "0", which for a computed X/Y is a feed move to the work origin at cut
		// depth. Throwing lets profile.ts refuse to produce a program instead of emitting that move.
		expect(() => n(NaN)).toThrow();
		expect(() => n(Infinity)).toThrow();
		expect(() => n(-Infinity)).toThrow();
	});

	it("throws on a non-number, which the global isFinite() would have waved through", () => {
		// Vuetify ignores v-model.number, so a cleared numeric field on the panel holds "" - and
		// isFinite("") is true, because it coerces to 0. A guard written as !isFinite(v) therefore
		// accepts an empty field as a legitimate zero.
		expect(isFinite("" as unknown as number)).toBe(true); // the trap itself
		expect(() => n("" as unknown as number)).toThrow(/finite number/);
		expect(() => n(null as unknown as number)).toThrow(/finite number/);
		expect(() => n(undefined as unknown as number)).toThrow(/finite number/);
	});
});

describe("Gcode", () => {
	it("header emits a comment then the standard preamble", () => {
		const out = new Gcode().header("Profile").toString();
		const lines = out.split("\n");
		expect(lines[0]).toBe("( Profile )");
		expect(lines[1]).toBe("G21 G90 G17 G94");
	});

	it("comment strips parentheses from its own text so it can't terminate early", () => {
		const out = new Gcode().comment("a (b) c").toString();
		expect(out).toContain("( a b c )");
	});

	it("toolChange emits nothing for null, negative, or non-finite tool numbers", () => {
		for (const tool of [null, -1, NaN]) {
			expect(new Gcode().toolChange(tool).toString().trim()).toBe("");
		}
	});

	it("toolChange emits a bare T word - RRF runs tfree/tpre/tpost itself, no M6", () => {
		const out = new Gcode().toolChange(3).toString().trim();
		expect(out).toBe("T3");
		expect(out).not.toContain("M6");
	});

	it("toolChange emits NOTHING for an empty-string tool - never a spurious T0", () => {
		// The regression this pins: a cleared "Tool number" field holds "" (Vuetify ignores
		// v-model.number). `!isFinite("")` is false and `"" < 0` is false, so the old guard fell
		// through to Math.round("") === 0 and emitted T0 into an otherwise valid program with no
		// warning at all - "drop whatever is in the spindle" on some machines, a real tool on others.
		expect(new Gcode().toolChange("" as unknown as number).toString().trim()).toBe("");
		expect(new Gcode().toolChange("  " as unknown as number).toString().trim()).toBe("");
		expect(new Gcode().toolChange(undefined as unknown as number).toString().trim()).toBe("");
	});

	it("spindleOn rejects a non-number rather than emitting M3 S0", () => {
		// Math.round("") is 0, so an empty RPM field would otherwise start the spindle at zero.
		expect(() => new Gcode().spindleOn("" as unknown as number)).toThrow(/finite number/);
	});

	it("spindleOn emits M3 and a dwell, but omits a zero dwell", () => {
		const withDwell = new Gcode().spindleOn(18000, 3).toString();
		expect(withDwell).toContain("M3 S18000");
		expect(withDwell).toContain("G4 S3");

		const noDwell = new Gcode().spindleOn(18000, 0).toString();
		expect(noDwell).not.toContain("G4");
	});

	it("end emits M2 and never M30 - M30 is delete-file in RepRapFirmware, not end-of-program", () => {
		const out = new Gcode().header("Profile").toolChange(3).spindleOn(18000).end().toString();
		expect(out).toContain("M2");
		expect(out).not.toContain("M30");
	});

	it("rapid omits undefined axes rather than zeroing them", () => {
		const out = new Gcode().rapid({ z: 5 }).toString().trim();
		expect(out).toBe("G0 Z5");
	});
});

describe("depthLevels", () => {
	it("steps down evenly to the total depth", () => {
		expect(depthLevels(0, 6, 1.5)).toEqual([-1.5, -3, -4.5, -6]);
	});

	it("clamps the last pass to the total depth rather than overshooting", () => {
		expect(depthLevels(0, 6, 4)).toEqual([-4, -6]);
	});

	it("a zero pass depth doesn't hang - it clamps to a minimum step", () => {
		const levels = depthLevels(0, 6, 0);
		expect(levels[levels.length - 1]).toBe(-6);
		expect(levels.length).toBeGreaterThan(1);
	});
});
