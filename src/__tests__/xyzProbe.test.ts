import { describe, expect, it } from "vitest";

import {
	buildXyzProbeCommand, computeCornerParams, deployXyzProbeMacros, XYZ_PROBE_CORNER_FILE,
	XYZ_PROBE_MACROS, XYZ_PROBE_X_FILE, XYZ_PROBE_Y_FILE, XYZ_PROBE_Z_FILE, xyzProbeMacrosMissing,
	type XyzProbeSettings,
} from "../util/xyzProbe";

// Deliberately asymmetric (plateWidth != plateHeight, xOffset != yOffset) so the FR/BL corner swap
// is actually distinguishable in the test fixtures below - a square plate with equal offsets would
// make a broken swap look identical to a correct one.
const SETTINGS: XyzProbeSettings = {
	endmillDiameter: 6.35, plateWidth: 60, plateHeight: 40, plateThickness: 5,
	xOffset: 10, yOffset: 15, feedrate: 500, searchMargin: 8,
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
	// Exact string format, hand-verified: toFixed(4) for decimals, rounded integer feedrate, the 9
	// lettered params (A-J) in order - a byte-for-byte regression here would be caught immediately.
	it("formats the FL corner command exactly", () => {
		const cmd = buildXyzProbeCommand("0:/macros/XyzProbe", "xyz_corner.g", "FL", SETTINGS);
		expect(cmd).toBe(
			'M98 P"0:/macros/XyzProbe/xyz_corner.g" A1 B1 C6.3500 D5.0000 E10.0000 F15.0000 G60.0000 H40.0000 I500 J8.0000',
		);
	});

	it("formats the FR corner command exactly, with swapped E/F/G/H and negative A", () => {
		const cmd = buildXyzProbeCommand("0:/macros/XyzProbe", "xyz_corner.g", "FR", SETTINGS);
		expect(cmd).toBe(
			'M98 P"0:/macros/XyzProbe/xyz_corner.g" A-1 B1 C6.3500 D5.0000 E15.0000 F10.0000 G40.0000 H60.0000 I500 J8.0000',
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
