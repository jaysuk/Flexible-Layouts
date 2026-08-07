/**
 * Profile cutting: follow an imported outline, at depth, with tabs.
 *
 * The geometry arriving here is already final — offset by the tool radius,
 * wound for the requested cut direction, ordered holes-first. This file only
 * decides depths and entries, which keeps every decision that depends on the
 * drawing in the importer and every decision that depends on the machine here.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/cam/profile.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: F1 - the whole build is now wrapped in a try/catch. format.ts's `n()` throws on a
 * non-finite coordinate (see its own header); catching it here means a bad computed coordinate
 * refuses to produce a program at all, rather than silently emitting a feed move to the work origin
 * at cut depth. The UI must ALSO guard before calling this — this is the last line of defence, not
 * the only one. F9 - `tabTop` now returns null (no tabs) for a non-positive cut depth instead of
 * letting the height-vs-depth comparison run against a negative number. Import path for `Polyline`
 * changed to `../vectorImport/types` (type-only, erases at build time).
 */
import { Gcode, depthLevels, n, type GeneratedProgram } from "./format";
import { cutLoopWithTabs, describeTabs, type TabSpec } from "./tabs";
import type { Polyline } from "../vectorImport/types";

export interface ProfileParams {
	toolDiameter: number;
	/** Top of the material in work coordinates. */
	zTop: number;
	depth: number;
	depthPerPass: number;
	feedRate: number;
	plungeFeed: number;
	rpm: number;
	safeZ: number;
	/**
	 * Tool to change to before cutting, or null to use whatever is loaded.
	 *
	 * Null is the honest default: a panel where no tool was chosen has no idea
	 * what is in the spindle, and a guessed tool change is worse than none.
	 */
	tool?: number | null;
	spindleDwell: number;
	tabs: TabSpec;
	/** Length of the descending entry along each loop, mm. 0 plunges. */
	rampLength: number;
	/** Description of where the geometry came from, for the file header. */
	sourceNote: string;
}

export function profile(loops: Polyline[], p: ProfileParams): GeneratedProgram {
	const warnings: string[] = [];
	const usable = loops.filter((l) => l.points.length >= 2);

	if (!usable.length) {
		return {
			name: "profile.nc",
			gcode: new Gcode().header("Profile", ["nothing to cut"]).toString(),
			summary: "Nothing to cut",
			warnings: ["No geometry survived offsetting."],
		};
	}

	const levels = depthLevels(p.zTop, p.depth, p.depthPerPass);
	const tabZ = tabTop(p, warnings);
	const open = usable.filter((l) => !l.closed).length;
	if (open) {
		warnings.push(
			`${open} open path(s) are cut as they are drawn — the tool centre follows the line, so the cut is ${n(p.toolDiameter)}mm wide.`,
		);
	}
	if (p.rampLength <= 0) {
		warnings.push("No entry ramp: the tool plunges straight down on every pass. Use a centre-cutting tool.");
	}

	try {
		const g = new Gcode();
		g.header("Profile", [
			p.sourceNote,
			`${usable.length} path(s), tool ${n(p.toolDiameter)}mm`,
			`${levels.length} depth pass(es) to ${n(p.depth)}mm`,
			describeTabs(p.tabs, tabZ),
		]);
		g.blank();
		g.toolChange(p.tool ?? null);
		g.spindleOn(p.rpm, p.spindleDwell);
		g.rapid({ z: p.safeZ });

		// Loop-major: each profile is taken to full depth before the next is started.
		// Level-major would leave every part attached until the very last pass, which
		// sounds safer but means one bad pass ruins all of them, and it triples the
		// traversing.
		usable.forEach((loop, index) => {
			g.blank();
			g.comment(`path ${index + 1} of ${usable.length}${loop.layer ? ` (${loop.layer})` : ""}`);
			let previousZ = p.zTop;

			for (const z of levels) {
				g.rapid({ z: p.safeZ });
				if (loop.closed) {
					cutLoopWithTabs(g, loop.points, {
						z,
						tabZ,
						tabs: p.tabs,
						feed: p.feedRate,
						plungeFeed: p.plungeFeed,
						toolDiameter: p.toolDiameter,
						entryZ: previousZ,
						rampLength: p.rampLength,
					});
				} else {
					// An open path has no seam to ramp around, so it is cut there and back:
					// down the line at this level, then straight back at the same depth,
					// which doubles as the return traverse.
					const [first] = loop.points;
					g.rapid({ x: first[0], y: first[1] });
					g.feed({ z, f: p.plungeFeed });
					for (const [x, y] of loop.points.slice(1)) g.feed({ x, y, f: p.feedRate });
					for (const [x, y] of loop.points.slice(0, -1).reverse()) g.feed({ x, y, f: p.feedRate });
				}
				previousZ = z;
			}
		});

		g.blank();
		g.rapid({ z: p.safeZ });
		g.spindleOff();
		g.end();

		return {
			name: "profile.nc",
			gcode: g.toString(),
			summary:
				`Cut ${usable.length} path(s) to ${n(p.depth)}mm in ${levels.length} pass(es)` +
				(tabZ === null ? "" : `, ${describeTabs(p.tabs, tabZ)}`),
			warnings,
		};
	} catch (err) {
		return {
			name: "profile.nc",
			gcode: new Gcode().header("Profile", ["refused: invalid geometry"]).toString(),
			summary: "Refused to generate a program",
			warnings: [
				// Deliberately not phrased as "a coordinate came out non-finite" - by far the commonest
				// cause is an empty numeric field on the panel, which reaches here as a string rather
				// than as a NaN, and a message naming the wrong cause sends the operator hunting in the
				// wrong place. format.ts's own error text says which value it actually was.
				...warnings,
				`Program generation refused - ${err instanceof Error ? err.message : String(err)}. Check the cut parameters for an empty or invalid field.`,
			],
		};
	}
}

/** Z the tool rides at across a tab, or null when tabs are off or impossible. */
function tabTop(p: { zTop: number; depth: number; tabs: TabSpec }, warnings: string[]): number | null {
	const { tabs } = p;
	if (tabs.count <= 0 || tabs.width <= 0 || tabs.height <= 0) return null;
	// F9: a non-positive cut depth has nothing meaningful to compare a tab height against - guard it
	// directly rather than let the check below phrase its warning around a negative "depth".
	if (p.depth <= 0) return null;
	if (tabs.height >= p.depth) {
		warnings.push(
			`Tab height (${n(tabs.height)}mm) is not less than the cut depth (${n(p.depth)}mm) — the profile would never be cut through. Tabs ignored.`,
		);
		return null;
	}
	return p.zTop - p.depth + tabs.height;
}
