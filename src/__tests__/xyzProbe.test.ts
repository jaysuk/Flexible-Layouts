import { describe, expect, it } from "vitest";

import {
	buildXyzProbeCommand, computeCornerParams, deployXyzProbeMacros, extractMacroVersion,
	M98_FORBIDDEN_PARAM_LETTERS,
	MACRO_SET_VERSION, XYZ_PROBE_CORNER_FILE, XYZ_PROBE_CORNER_MACRO, XYZ_PROBE_MACROS, XYZ_PROBE_X_FILE,
	XYZ_PROBE_X_MACRO, XYZ_PROBE_Y_FILE, XYZ_PROBE_Y_MACRO, XYZ_PROBE_Z_FILE, XYZ_PROBE_Z_MACRO,
	xyzProbeMacrosMissing, xyzProbeMacrosOutdated, type XyzProbeSettings,
} from "../util/xyzProbe";

// Deliberately asymmetric (plateWidth != plateHeight, xOffset != yOffset) so the FR/BL corner swap
// is actually distinguishable in the test fixtures below - a square plate with equal offsets would
// make a broken swap look identical to a correct one.
const SETTINGS: XyzProbeSettings = {
	endmillDiameter: 6.35, plateWidth: 60, plateHeight: 40, plateThickness: 5,
	xOffset: 10, yOffset: 15, feedrate: 500, searchMargin: 8, probeIndex: 0,
};

describe("computeCornerParams", () => {
	// Pinned against the reference algorithm's own logic (FelixHauser/Duet-XYZ-Probe's
	// cornerParams()): swap = !(corner === 'FL' || corner === 'BR').
	it("FL: no swap", () => {
		expect(computeCornerParams("FL", SETTINGS)).toEqual({
			xDirection: 1, yDirection: 1, xOffset: 10, yOffset: 15, xDimension: 60, yDimension: 40,
		});
	});

	it("BR: no swap, both directions negative", () => {
		expect(computeCornerParams("BR", SETTINGS)).toEqual({
			xDirection: -1, yDirection: -1, xOffset: 10, yOffset: 15, xDimension: 60, yDimension: 40,
		});
	});

	// The plate is physically rotated for these two corners, so X/Y offset and dimension swap.
	it("FR: swapped, xDirection negative", () => {
		expect(computeCornerParams("FR", SETTINGS)).toEqual({
			xDirection: -1, yDirection: 1, xOffset: 15, yOffset: 10, xDimension: 40, yDimension: 60,
		});
	});

	it("BL: swapped, yDirection negative", () => {
		expect(computeCornerParams("BL", SETTINGS)).toEqual({
			xDirection: 1, yDirection: -1, xOffset: 15, yOffset: 10, xDimension: 40, yDimension: 60,
		});
	});
});

describe("buildXyzProbeCommand", () => {
	// Exact string format, hand-verified: toFixed(4) for decimals, rounded integer feedrate, the 10
	// lettered params in order - a byte-for-byte regression here would be caught immediately.
	it("formats the FL corner command exactly", () => {
		const cmd = buildXyzProbeCommand("0:/macros/XyzProbe", "xyz_corner.g", "FL", SETTINGS);
		expect(cmd).toBe(
			'M98 P"0:/macros/XyzProbe/xyz_corner.g" A1 B1 C6.3500 D5.0000 E10.0000 F15.0000 L60.0000 H40.0000 I500 J8.0000 K0',
		);
	});

	it("formats the FR corner command exactly, with swapped E/F/K/H and negative A", () => {
		const cmd = buildXyzProbeCommand("0:/macros/XyzProbe", "xyz_corner.g", "FR", SETTINGS);
		expect(cmd).toBe(
			'M98 P"0:/macros/XyzProbe/xyz_corner.g" A-1 B1 C6.3500 D5.0000 E15.0000 F10.0000 L40.0000 H60.0000 I500 J8.0000 K0',
		);
	});

	it("rounds the feedrate to an integer", () => {
		const cmd = buildXyzProbeCommand("0:/macros/XyzProbe", "xyz_z.g", "FL", { ...SETTINGS, feedrate: 499.6 });
		expect(cmd).toContain(" I500");
	});

	it("uses the given macro folder and file", () => {
		const cmd = buildXyzProbeCommand("0:/macros/Custom", "xyz_x.g", "BR", SETTINGS);
		expect(cmd.startsWith('M98 P"0:/macros/Custom/xyz_x.g"')).toBe(true);
	});

	/**
	 * THE regression test for the bug that made this widget do nothing at all.
	 *
	 * RRF's StringParser::FindParameters ends the current command at the first bare `G` or `M`
	 * outside quotes/braces ("we assume that a G or M ... is the start of a new command", implemented
	 * as a literal `break`). FL used to pass the plate X dimension as `G60.0000`, so RRF cut the line
	 * in two: M98 lost every parameter from `G` onward, the macro's first `{param.I}` reference blew
	 * up with an unknown-value error before any motion, and the orphaned tail ran as a real `G60`
	 * (save position to slot). This asserts the property directly rather than just the fixed strings
	 * above, so re-introducing ANY forbidden letter fails here with a pointed message.
	 */
	it("never passes a parameter on a letter RRF would read as the start of a new command", () => {
		for (const corner of ["FL", "FR", "BL", "BR"] as const) {
			for (const file of [XYZ_PROBE_CORNER_FILE, XYZ_PROBE_X_FILE, "xyz_y.g", "xyz_z.g"]) {
				const cmd = buildXyzProbeCommand("0:/macros/XyzProbe", file, corner, SETTINGS);
				// Strip the quoted filename first - its own ".g" is inside quotes, which RRF's parser
				// tracks and skips, so it is not a command boundary and must not be tested as one.
				const withoutFilename = cmd.replace(/"[^"]*"/g, '""');
				for (const letter of M98_FORBIDDEN_PARAM_LETTERS) {
					expect(
						new RegExp(`\\s${letter}[-\\d]`).test(withoutFilename),
						`${file} @ ${corner} passes a parameter on forbidden letter "${letter}": ${cmd}`,
					).toBe(false);
				}
			}
		}
	});
});

describe("macro bodies", () => {
	// The whole point of switching away from M585: no macro may reference it, and G38.2 (the
	// side-effect-free replacement) must be used for every probing move. The header comment
	// deliberately explains WHY (mentioning M585 by name), so this checks actual G-code lines only.
	function codeLines(body: string): Array<string> {
		return body.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith(";"));
	}
	it("never invokes M585 as a command", () => {
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			for (const line of codeLines(body)) {
				expect(line, `${name}: "${line}"`).not.toMatch(/\bM585\b/);
			}
		}
	});

	it("every macro uses G38.2 for its probing move(s)", () => {
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			expect(body, name).toContain("G38.2");
		}
	});

	it("all four expected macro files are present", () => {
		expect(Object.keys(XYZ_PROBE_MACROS).sort()).toEqual(
			[XYZ_PROBE_CORNER_FILE, XYZ_PROBE_X_FILE, XYZ_PROBE_Y_FILE, XYZ_PROBE_Z_FILE].sort(),
		);
	});

	it("declares every param.* letter it uses in its header comment", () => {
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			const used = new Set(Array.from(body.matchAll(/param\.([A-Z])/g), (m) => m[1]));
			for (const letter of used) {
				expect(body, `${name} uses param.${letter} but doesn't document it`).toContain(`param.${letter}`);
			}
		}
	});

	it("every macro carries the current version stamp", () => {
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			expect(extractMacroVersion(body), name).toBe(MACRO_SET_VERSION);
		}
	});

	/**
	 * Every edge probe positions the tool exactly 5mm clear of the plate face before searching, so the
	 * search vector must be `5 + searchMargin` - just far enough to reach contact plus the operator's
	 * placement tolerance. It used to ask for the whole return-to-centre distance as well
	 * (`plateDim/2 + 5 + endmill/2 + margin`), which on default settings is ~48mm: about 43mm PAST
	 * contact, ending beyond the plate's own centre. A probe that failed to trigger therefore drove
	 * the endmill straight through the plate instead of stopping just past the expected edge.
	 */
	it("searches only 5 + searchMargin on every X/Y edge probe, never the return-to-centre distance", () => {
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			for (const line of codeLines(body).filter((l) => /^G38\.2\s+[XY]/.test(l.trim()))) {
				expect(line, `${name}: "${line}" searches further than 5 + searchMargin`)
					.toMatch(/^G38\.2 [XY]\{\(5 \+ param\.J\) \* param\.[AB]\}/);
			}
		}
	});

	it("uses the probe index it was given for every G38.2, rather than hardcoding probe 0", () => {
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			const probeMoves = codeLines(body).filter((l) => l.trim().startsWith("G38.2"));
			expect(probeMoves.length, `${name} has no probing moves`).toBeGreaterThan(0);
			for (const line of probeMoves) {
				expect(line, `${name}: "${line}"`).toContain("K{param.K}");
				expect(line, `${name} still hardcodes a probe index`).not.toMatch(/\bK\d/);
			}
		}
	});
});

describe("corner macro mid-stage confirmations", () => {
	// The multi-stage corner macro gets a blocking M291 after each stage's retract, so an operator can
	// catch a bad probe before the next stage runs. Cancel must abort the rest of the macro on its own
	// (RRF does this automatically for a plain S3 with no J) - never add a J param here, it would
	// change that behaviour.
	it("has exactly 3 M291 confirmations, each S3 with no J parameter", () => {
		const m291Lines = XYZ_PROBE_CORNER_MACRO.split("\n").filter((l) => l.trim().startsWith("M291"));
		expect(m291Lines).toHaveLength(3);
		for (const line of m291Lines) {
			expect(line, line).toMatch(/\bS3\b/);
			expect(line, line).not.toMatch(/\bJ\d/);
		}
	});

	it("the single-axis macros have no M291 confirmations (only the multi-stage corner macro needs them)", () => {
		for (const [name, body] of [["x", XYZ_PROBE_X_MACRO], ["y", XYZ_PROBE_Y_MACRO], ["z", XYZ_PROBE_Z_MACRO]] as const) {
			expect(body, name).not.toMatch(/\bM291\b/);
		}
	});
});

describe("extractMacroVersion", () => {
	it("reads the stamp out of a shipped macro", () => {
		expect(extractMacroVersion(XYZ_PROBE_CORNER_MACRO)).toBe(MACRO_SET_VERSION);
	});

	it("is 0 for text with no stamp (pre-versioning macro, or a stripped header)", () => {
		expect(extractMacroVersion("; just a comment\nG91\n")).toBe(0);
	});
});

// A fake card: in-memory path->text map, plus per-op failure switches.
function fakeIO(seed: Record<string, string> = {}) {
	const files = new Map<string, string>(Object.entries(seed));
	const fail = { upload: false, download: false };
	return {
		files,
		fail,
		upload: async (filename: string, content: Blob) => {
			if (fail.upload) { throw new Error("upload failed"); }
			files.set(filename, await content.text());
		},
		downloadText: async (filename: string) => {
			if (fail.download) { throw new Error("download failed"); }
			const text = files.get(filename);
			if (text === undefined) { throw new Error("not found"); }
			return text;
		},
	};
}

describe("xyzProbeMacrosMissing", () => {
	it("is true when the corner macro isn't on the card", async () => {
		const io = fakeIO();
		await expect(xyzProbeMacrosMissing(io, "0:/macros/XyzProbe")).resolves.toBe(true);
	});

	it("is false when the corner macro is already present", async () => {
		const io = fakeIO({ "0:/macros/XyzProbe/xyz_corner.g": "; already here" });
		await expect(xyzProbeMacrosMissing(io, "0:/macros/XyzProbe")).resolves.toBe(false);
	});

	// Offline/errored reads must read as "missing" (safe to attempt a deploy), not throw.
	it("is true (not thrown) when the check itself fails", async () => {
		const io = fakeIO();
		io.fail.download = true;
		await expect(xyzProbeMacrosMissing(io, "0:/macros/XyzProbe")).resolves.toBe(true);
	});
});

describe("xyzProbeMacrosOutdated", () => {
	it("is false when the on-card macro carries the current version stamp", async () => {
		const io = fakeIO({ "0:/macros/XyzProbe/xyz_corner.g": XYZ_PROBE_CORNER_MACRO });
		await expect(xyzProbeMacrosOutdated(io, "0:/macros/XyzProbe")).resolves.toBe(false);
	});

	it("is true when the on-card macro carries an older version stamp", async () => {
		const stale = XYZ_PROBE_CORNER_MACRO.replace(
			`FL-XYZ-PROBE-MACRO-VERSION: ${MACRO_SET_VERSION}`, "FL-XYZ-PROBE-MACRO-VERSION: 1",
		);
		const io = fakeIO({ "0:/macros/XyzProbe/xyz_corner.g": stale });
		await expect(xyzProbeMacrosOutdated(io, "0:/macros/XyzProbe")).resolves.toBe(true);
	});

	it("is true when the on-card macro has no version stamp at all (pre-versioning deploy)", async () => {
		const io = fakeIO({ "0:/macros/XyzProbe/xyz_corner.g": "; xyz_corner.g - old macro\nG91\nG38.2 Z-5 F500 P0\n" });
		await expect(xyzProbeMacrosOutdated(io, "0:/macros/XyzProbe")).resolves.toBe(true);
	});

	// Ambiguous between "genuinely outdated" and "transient/offline" - resolves to false so a blip
	// never flags a healthy macro as needing an overwrite.
	it("is false (not thrown) when the check itself fails", async () => {
		const io = fakeIO({ "0:/macros/XyzProbe/xyz_corner.g": XYZ_PROBE_CORNER_MACRO });
		io.fail.download = true;
		await expect(xyzProbeMacrosOutdated(io, "0:/macros/XyzProbe")).resolves.toBe(false);
	});
});

describe("deployXyzProbeMacros", () => {
	it("uploads all 4 macros to the given folder with matching content", async () => {
		const io = fakeIO();
		await expect(deployXyzProbeMacros(io, "0:/macros/XyzProbe")).resolves.toBe(true);
		expect(io.files.size).toBe(4);
		for (const [name, body] of Object.entries(XYZ_PROBE_MACROS)) {
			expect(io.files.get(`0:/macros/XyzProbe/${name}`)).toBe(body);
		}
	});

	it("deploys to a custom folder when given one", async () => {
		const io = fakeIO();
		await deployXyzProbeMacros(io, "0:/macros/Custom");
		expect(io.files.has(`0:/macros/Custom/${XYZ_PROBE_CORNER_FILE}`)).toBe(true);
	});

	it("reports failure (not a throw) if an upload fails", async () => {
		const io = fakeIO();
		io.fail.upload = true;
		await expect(deployXyzProbeMacros(io, "0:/macros/XyzProbe")).resolves.toBe(false);
	});
});
