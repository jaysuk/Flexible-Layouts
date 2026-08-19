import { describe, expect, it } from "vitest";

import { rewriteCanAddressReferences } from "../model/canAddress/rewrite";

describe("rewriteCanAddressReferences - driver/device dotted addressing", () => {
	it("rewrites M569's P<addr>.<driver>", () => {
		const r = rewriteCanAddressReferences("M569 P121.0 S1", 121, 20);
		expect(r.changed).toBe(true);
		expect(r.text).toBe("M569 P20.0 S1");
	});

	it("rewrites every M569.x sub-command variant", () => {
		for (const cmd of ["M569.1", "M569.2", "M569.3", "M569.4", "M569.5", "M569.6"]) {
			const r = rewriteCanAddressReferences(`${cmd} P121.0`, 121, 20);
			expect(r.text, cmd).toBe(`${cmd} P20.0`);
		}
	});

	it("rewrites M584's colon-separated driver list, leaving local (non-dotted) driver numbers alone", () => {
		const r = rewriteCanAddressReferences("M584 X0 Y1 Z2 E3:4:121.0:121.1", 121, 20);
		expect(r.text).toBe("M584 X0 Y1 Z2 E3:4:20.0:20.1");
	});

	it("rewrites every M584 axis letter (X Y Z U V W A B C D E)", () => {
		const r = rewriteCanAddressReferences("M584 X121.0 Y121.1 Z121.2 U121.3 V121.4 W121.5 A121.6 B121.7 C121.8 D121.9 E121.10", 121, 20);
		for (const letter of ["X", "Y", "Z", "U", "V", "W", "A", "B", "C", "D", "E"]) {
			expect(r.text, letter).toContain(`${letter}20.`);
			expect(r.text, letter).not.toContain(`${letter}121.`);
		}
	});

	it("rewrites M955/M956 accelerometer board.device addressing", () => {
		expect(rewriteCanAddressReferences("M955 P121.0 I20", 121, 20).text).toBe("M955 P20.0 I20");
		expect(rewriteCanAddressReferences('M956 P121.0 S1000 A0 F"test.csv"', 121, 20).text)
			.toBe('M956 P20.0 S1000 A0 F"test.csv"');
	});

	it("does NOT rewrite a bare (non-dotted) driver number that happens to equal the old address", () => {
		const r = rewriteCanAddressReferences("M569 P121 S1", 121, 20); // no dot - this is driver 121 on the main board, not board 121
		expect(r.changed).toBe(false);
	});
});

describe("rewriteCanAddressReferences - false-positive safety (the whole reason this is command-scoped)", () => {
	it("does NOT touch M569's own B parameter (chopper blanking time), even when it numerically matches the old address", () => {
		// If this were a blind "replace any Bn" the blanking time here would be corrupted.
		const r = rewriteCanAddressReferences("M569 P0 B2", 2, 99);
		expect(r.changed).toBe(false);
		expect(r.text).toBe("M569 P0 B2");
	});

	it("does NOT touch an unrelated decimal value on an unrecognised command (e.g. motor current %)", () => {
		const r = rewriteCanAddressReferences("M913 X100.0 Y100.0", 100, 20);
		expect(r.changed).toBe(false);
	});

	it("does NOT touch a bare integer parameter that numerically matches the old address on an unrecognised command", () => {
		const r = rewriteCanAddressReferences("M140 B1 S60", 1, 55); // B1 here means bed heater 1, not a CAN address
		expect(r.changed).toBe(false);
	});

	it("does NOT touch a filename that coincidentally looks like a port-name prefix, on a command that isn't a port command", () => {
		// M32's quoted argument is a filename, not a port. "121.gcode" is syntactically identical to a
		// port-name string ("<addr>.<rest>") - the only thing that keeps this safe is that M32 was
		// never whitelisted as a port-bearing command.
		const r = rewriteCanAddressReferences('M32 "121.gcode"', 121, 20);
		expect(r.changed).toBe(false);
	});

	it("does NOT touch a macro filename passed to M98's P parameter, even though M308's P IS a port", () => {
		// Same letter (P), same quoted-digits-dot shape, completely different meaning depending on the
		// command - this is exactly why matching is scoped per-command, not per-letter alone.
		const r = rewriteCanAddressReferences('M98 P"121.g"', 121, 20);
		expect(r.changed).toBe(false);
	});

	it("does NOT touch a mention only in a comment", () => {
		const r = rewriteCanAddressReferences("G4 S1 ; board 121 needs P121.0 someday", 121, 20);
		expect(r.changed).toBe(false);
	});
});

describe("rewriteCanAddressReferences - quoted port names", () => {
	it("rewrites a plain port name prefix", () => {
		const r = rewriteCanAddressReferences('M950 H1 C"121.out0"', 121, 20);
		expect(r.text).toBe('M950 H1 C"20.out0"');
	});

	it("preserves a leading ! or ^ polarity/pull-up modifier", () => {
		expect(rewriteCanAddressReferences('M950 J0 C"!121.io0.in"', 121, 20).text).toBe('M950 J0 C"!20.io0.in"');
		expect(rewriteCanAddressReferences('M950 J0 C"^121.io0.in"', 121, 20).text).toBe('M950 J0 C"^20.io0.in"');
	});

	it("rewrites a compound port string ('a+b') - the prefix applies once, at the start, per RRF's own documented convention (not repeated per segment)", () => {
		const r = rewriteCanAddressReferences('M950 F0 C"121.out0+out1"', 121, 20);
		expect(r.text).toBe('M950 F0 C"20.out0+out1"');
	});

	it("applies on every whitelisted port-bearing command (M308 temperature sensor), but leaves that command's OTHER quoted strings (Y, A) alone even if they happened to start with digits", () => {
		const r = rewriteCanAddressReferences('M308 S0 P"121.temp0" Y"thermistor" A"121 degrees"', 121, 20);
		expect(r.text).toBe('M308 S0 P"20.temp0" Y"thermistor" A"121 degrees"');
	});

	it("applies on M574 (endstop) and M558 (Z probe) too", () => {
		expect(rewriteCanAddressReferences('M574 X1 S1 P"121.io0.in"', 121, 20).text).toBe('M574 X1 S1 P"20.io0.in"');
		expect(rewriteCanAddressReferences('M558 P8 C"121.io1.in" H5 F120', 121, 20).text).toBe('M558 P8 C"20.io1.in" H5 F120');
	});

	it("leaves a port name for a DIFFERENT board address untouched", () => {
		const r = rewriteCanAddressReferences('M950 H1 C"5.out0"', 121, 20);
		expect(r.changed).toBe(false);
	});
});

describe("rewriteCanAddressReferences - whitelisted B-parameter commands", () => {
	it.each(["M115", "M122", "M997", "M999", "M957"])("rewrites B<oldAddr> on %s", (cmd) => {
		const r = rewriteCanAddressReferences(`${cmd} B121`, 121, 20);
		expect(r.text).toBe(`${cmd} B20`);
	});

	it("does not partially match a longer number (old address 12 must not match B121)", () => {
		const r = rewriteCanAddressReferences("M999 B121", 12, 99);
		expect(r.changed).toBe(false);
	});

	it("M999 with no B parameter (restart main board) is left alone", () => {
		const r = rewriteCanAddressReferences("M999", 121, 20);
		expect(r.changed).toBe(false);
	});
});

describe("rewriteCanAddressReferences - multi-line files and reporting", () => {
	it("reports the correct 1-based line numbers and before/after text for a multi-line file", () => {
		const text = [
			"; config.g",
			"M569 P121.0 S1",
			"G4 S1",
			'M950 H1 C"121.out0"',
		].join("\n");
		const r = rewriteCanAddressReferences(text, 121, 20);
		expect(r.changed).toBe(true);
		expect(r.changedLines).toEqual([
			{ line: 2, before: "M569 P121.0 S1", after: "M569 P20.0 S1" },
			{ line: 4, before: 'M950 H1 C"121.out0"', after: 'M950 H1 C"20.out0"' },
		]);
	});

	it("is a no-op (changed: false, identical text) for a file with no matching references at all", () => {
		const text = "M569 P0.0 S1\nG28\n";
		const r = rewriteCanAddressReferences(text, 121, 20);
		expect(r.changed).toBe(false);
		expect(r.text).toBe(text);
		expect(r.changedLines).toEqual([]);
	});

	it("preserves a trailing comment on a rewritten line", () => {
		const r = rewriteCanAddressReferences("M569 P121.0 S1 ; driver on board 121", 121, 20);
		expect(r.text).toBe("M569 P20.0 S1 ; driver on board 121");
	});
});
