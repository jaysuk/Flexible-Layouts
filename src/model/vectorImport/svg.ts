/**
 * SVG import.
 *
 * This does NOT parse path data. Writing a correct `d` parser means arcs,
 * implicit repeated commands, smooth-curve reflection and relative/absolute
 * pairs for nine command letters — several hundred lines of code whose only job
 * is to reproduce something already sitting in the browser, correctly, at
 * native speed.
 *
 * Instead every shape is walked with SVGGeometryElement.getPointAtLength(),
 * which covers <path>, <rect>, <circle>, <ellipse>, <line>, <polyline> and
 * <polygon> identically, and getCTM() folds in every nested <g transform>. The
 * output is dense, so it goes straight through the simplifier.
 *
 * The price is paid twice. It needs a live DOM — the geometry methods return
 * zeroes on a document that was parsed but never attached, so the element is
 * attached hidden and removed in a finally block — and it flattens the one
 * distinction the DOM does not expose through this interface: a <path> holding
 * several subpaths walks as if it were one, because the gaps between them have
 * no arc length. That is put back below (splitRuns, svgSample.ts), from the
 * walk itself rather than from the `d` attribute.
 *
 * NO UNIT TEST for this file, deliberately — happy-dom (this repo's vitest
 * environment) stubs every geometry API this depends on: `getTotalLength()` is
 * a literal `// TODO` returning 0, `getPointAtLength()` returns an empty point,
 * `getCTM()` returns an identity matrix. A test written against that would pass
 * vacuously (every shape reporting `total === 0` and being skipped) while
 * proving nothing. Do not add one - if this needs a regression test, it needs
 * a real browser, which is what FL's Playwright e2e harness is for. The actual
 * unit/curve/transform maths this file depends on lives in the pure, fully
 * tested `svgUnits.ts` and `svgSample.ts` instead - keep new logic there, not
 * here, so it stays testable.
 *
 * Ported from meeloo/AxisControl (Apache-2.0), src/import/svg.ts.
 * Copyright the AxisControl authors; used under the Apache License 2.0.
 * Incorporated into this GPL-3.0-or-later work, as Apache-2.0 permits.
 * Changes: unit detection now delegates to svgUnits.millimetresPerUnit(), which is viewBox-aware
 * (mm per user unit AFTER the viewBox scale, not per raw root-width pixel) - a genuine correctness
 * improvement over the original `millimetresPerPixel()`, which ignored viewBox scaling entirely and
 * happened to only misbehave on files that combine a physical width with a viewBox of different
 * proportions. Subpath splitting and closed-loop detection now delegate to svgSample.splitRuns()/
 * closeIfMeeting() rather than being inlined in the sampling loop; both were forced by needing this
 * logic to be independently unit-testable (see the no-unit-test note above). The "declared" unit
 * label still requires the width/height attribute to carry an actual unit suffix (matching the
 * original's behaviour exactly) rather than trusting svgUnits' own more permissive `declared` flag,
 * which treats a bare unitless width as legitimately px-by-default - appropriate for a general-purpose
 * parser, but a bare number here is, in practice, almost always an arbitrary drawing-tool unit rather
 * than a deliberate physical declaration.
 */
import { simplify } from "./geometry";
import { closeIfMeeting, splitRuns } from "./svgSample";
import { millimetresPerUnit } from "./svgUnits";
import type { ImportedDrawing, Point, Polyline } from "./types";

/** Shapes with the geometry interface. Everything else is ignored. */
const SHAPES = "path, rect, circle, ellipse, line, polyline, polygon";

function isHidden(el: Element): boolean {
	// Construction lines are routinely left in the file with display:none, and
	// cutting them would be a nasty surprise.
	const style = (el.getAttribute("style") ?? "").replace(/\s/g, "");
	return (
		el.getAttribute("display") === "none" ||
		style.includes("display:none") ||
		el.getAttribute("visibility") === "hidden"
	);
}

/** True when any ancestor up to the <svg> is hidden. */
function hiddenInTree(el: Element, root: Element): boolean {
	for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
		if (isHidden(node)) return true;
	}
	return false;
}

function applyMatrix(m: DOMMatrix | null, p: { x: number; y: number }): Point {
	return m ? [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f] : [p.x, p.y];
}

export interface SvgOptions {
	/** Chord tolerance for flattening curves, mm. */
	tolerance: number;
	name: string;
}

export function importSvg(text: string, opts: SvgOptions): ImportedDrawing {
	const warnings: string[] = [];
	const doc = new DOMParser().parseFromString(text, "image/svg+xml");

	const parseError = doc.querySelector("parsererror");
	if (parseError) throw new Error(`SVG is not well-formed: ${parseError.textContent?.slice(0, 120)}`);

	const svg = doc.documentElement as unknown as SVGSVGElement;
	if (svg.tagName.toLowerCase() !== "svg") throw new Error("file does not contain an <svg> root");

	// Off-screen but laid out: visibility:hidden or display:none would make the
	// geometry methods return nothing, so it is moved out of view instead.
	const holder = document.createElement("div");
	holder.setAttribute(
		"style",
		"position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden",
	);
	const imported = document.importNode(svg, true) as SVGSVGElement;
	holder.appendChild(imported);
	document.body.appendChild(holder);

	try {
		const width = imported.getAttribute("width");
		const height = imported.getAttribute("height");
		const viewBox = imported.getAttribute("viewBox");
		const unit = millimetresPerUnit(width, height, viewBox);
		if (unit.warning) warnings.push(unit.warning);
		const mmPerUnit = unit.mm;
		// svgUnits' own flag, not a regex over the raw attribute. A `width="50%"` matches any
		// "does it carry a unit?" pattern while telling you nothing about physical size, so deriving
		// this here reported `units: "mm"` for a file that had not stated a size - suppressing the very
		// banner that exists to make an unknown scale impossible to miss.
		const declared = unit.declared;

		// Sample in source units at a step that yields the requested chord
		// tolerance once scaled to mm. Curvature is unknown, so this oversamples and
		// lets the simplifier take the slack out.
		const step = Math.max(0.05, opts.tolerance / 4 / mmPerUnit);

		const paths: Polyline[] = [];
		let skipped = 0;

		for (const el of Array.from(imported.querySelectorAll(SHAPES))) {
			if (hiddenInTree(el, imported)) continue;
			const geom = el as SVGGeometryElement;
			if (typeof geom.getTotalLength !== "function") {
				skipped++;
				continue;
			}

			let total = 0;
			try {
				total = geom.getTotalLength();
			} catch {
				skipped++;
				continue;
			}
			if (!(total > 0)) continue;

			const matrix = geom.getCTM();
			const count = Math.max(2, Math.ceil(total / step) + 1);

			// Sampled in the element's own (untransformed) local space - splitRuns()'s jump threshold
			// (`spacing`) is in that same space, and comparing post-transform points against a
			// pre-transform spacing would silently break under any scaled or skewed ancestor <g>. See
			// svgSample.ts's own note on this.
			const raw: Array<Point> = [];
			for (let i = 0; i < count; i++) {
				const p = geom.getPointAtLength((total * i) / (count - 1));
				raw.push([p.x, p.y]);
			}
			const spacing = total / (count - 1);

			for (const run of splitRuns(raw, spacing)) {
				const transformed = run.map((p) => applyMatrix(matrix, { x: p[0], y: p[1] }));
				// A shape whose ends meet is closed even though nothing in the DOM says
				// so — that is how a `Z`-terminated path and a <rect> both arrive.
				const { points, closed } = closeIfMeeting(transformed, step);

				const simplified = simplify(points, opts.tolerance / mmPerUnit);
				if (simplified.length >= 2) {
					paths.push({
						points: simplified,
						closed,
						layer: el.getAttribute("id") ?? el.getAttribute("class") ?? undefined,
					});
				}
			}
		}

		if (skipped) warnings.push(`${skipped} shape(s) could not be measured and were skipped.`);
		if (imported.querySelector("text, image, use")) {
			warnings.push("Text, images and <use> references are ignored. Convert text to paths before exporting.");
		}
		if (!paths.length) warnings.push("No usable geometry found.");

		return {
			source: "svg",
			name: opts.name,
			paths,
			units: declared ? "mm" : "unknown",
			mmPerUnit,
			warnings,
		};
	} finally {
		holder.remove();
	}
}
