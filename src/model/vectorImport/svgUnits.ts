/**
 * Pure SVG/CSS length and viewBox parsing.
 *
 * New module — no direct AxisControl equivalent. AxisControl's importer gets this for free from the
 * browser (`SVGLength.convertToSpecifiedUnits`, `getCTM()`), but happy-dom (FL's vitest environment)
 * only stubs both of those (see geometry.ts's sibling note on why svg.ts can't be unit-tested
 * directly), so the unit maths that would otherwise be invisible inside the DOM API is pulled out
 * here where it can actually be tested.
 */

/** 96 CSS px per inch is the SVG/CSS spec's fixed reference resolution — this is not a display DPI. */
export const MM_PER_PX = 25.4 / 96;

const UNIT_TO_MM: Record<string, number> = {
	mm: 1,
	cm: 10,
	in: 25.4,
	pt: 25.4 / 72, // 1in = 72pt
	pc: 25.4 / 6, // 1in = 6pc
	q: 0.25, // 1Q = 1/4 mm (quarter-millimetre), nothing to do with inches
	px: MM_PER_PX,
};

interface ParsedLength {
	mm: number;
	/** True only when the value carried a real physical unit suffix. A bare number is `px` by SVG's
	 *  default, which is a rendering convention, NOT a statement of physical size - the distinction
	 *  matters because it's the difference between "this file says how big it is" and "we guessed". */
	hasUnit: boolean;
}

function parseLength(value: string | null | undefined): ParsedLength | null {
	if (!value) return null;
	const match = /^([+-]?[\d.]+(?:e[+-]?\d+)?)\s*([a-z%]*)$/i.exec(value.trim());
	if (!match) return null;
	const num = Number(match[1]);
	if (!Number.isFinite(num)) return null;
	const unit = match[2].toLowerCase();
	if (unit === "") return { mm: num * MM_PER_PX, hasUnit: false };
	const perMm = UNIT_TO_MM[unit];
	return perMm === undefined ? null : { mm: num * perMm, hasUnit: true };
}

/**
 * Parses an SVG/CSS length into millimetres. Percentages and font-relative units (`%`, `em`, `rem`,
 * `vw`, `vh`) have no fixed physical size without extra context this function doesn't have, so those
 * — and anything unparseable — return `null` rather than guessing. A bare number is treated as `px`,
 * which is the SVG spec's default unit for an unqualified length.
 */
export function parseCssLength(value: string | null | undefined): number | null {
	return parseLength(value)?.mm ?? null;
}

export interface ViewBox {
	minX: number;
	minY: number;
	width: number;
	height: number;
}

/**
 * Parses a `viewBox="minX minY width height"` attribute. Accepts comma or whitespace separators, per
 * the SVG spec. Returns `null` for anything missing, malformed, or with a non-positive area — a
 * degenerate viewBox is treated the same as no viewBox at all, never as a division-by-zero hazard for
 * the caller.
 */
export function parseViewBox(value: string | null | undefined): ViewBox | null {
	if (!value) return null;
	const parts = value.trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
	const [minX, minY, width, height] = parts;
	if (!(width > 0) || !(height > 0)) return null;
	return { minX, minY, width, height };
}

export interface UnitResult {
	/** Millimetres per SVG user unit — the same "user unit" that path/shape coordinates are expressed
	 *  in, AFTER any viewBox scale is applied. This is what `getCTM()` would fold in. */
	mm: number;
	/** True if a physical size could actually be established (a declared width/height, scaled by a
	 *  viewBox if present); false if there was nothing to calibrate against and this fell back to the
	 *  96px/inch default. */
	declared: boolean;
	warning?: string;
}

/**
 * Millimetres per SVG user unit for a document with the given `width`/`height` attributes and
 * (optional) `viewBox`.
 *
 * NOT millimetres per pixel of `width`/`height` — when a viewBox is present, the declared physical
 * size scales the viewBox's own units, not the raw attribute numbers, exactly as `getCTM()` would:
 * `width="100mm"` over `viewBox="0 0 200 100"` means 200 user units span 100mm, i.e. 0.5mm/unit, not
 * 1mm/unit. Without a viewBox, one user unit is always exactly one CSS px — declaring a physical
 * width/height only sets the rendered viewport's physical size, it does not rescale the coordinate
 * system the way a viewBox does.
 */
export function millimetresPerUnit(
	width: string | null | undefined,
	height: string | null | undefined,
	viewBox: string | null | undefined,
): UnitResult {
	const box = parseViewBox(viewBox);
	const w = parseLength(width);
	const h = parseLength(height);

	// A percentage width ("50%") parses as no length at all, so it lands in the same "we guessed"
	// bucket as a missing one. That is the point: a percentage is a statement about the container,
	// not about the part, and treating it as a declared size is how a drawing gets cut at whatever
	// scale the browser happened to lay it out at.
	const unitless = "SVG size is in pixels with no physical unit - assuming 96px/inch, so check the measured size before cutting";

	if (box) {
		// With a viewBox the declared physical size scales the viewBox's OWN units, not the raw
		// attribute number - width="100mm" over viewBox="0 0 200 100" is 0.5mm per user unit.
		const use = w ?? h;
		const span = w ? box.width : box.height;
		if (use) {
			return use.hasUnit
				? { mm: use.mm / span, declared: true }
				: { mm: use.mm / span, declared: false, warning: unitless };
		}
		return {
			mm: MM_PER_PX,
			declared: false,
			warning: "SVG has a viewBox but no physical width/height - assuming 96px/inch",
		};
	}

	// Without a viewBox one user unit is exactly one CSS px: a physical width/height only sizes the
	// rendered viewport, it does not rescale the coordinate system the way a viewBox does.
	const any = w ?? h;
	if (any) {
		return any.hasUnit
			? { mm: MM_PER_PX, declared: true }
			: { mm: MM_PER_PX, declared: false, warning: unitless };
	}
	return {
		mm: MM_PER_PX,
		declared: false,
		warning: "SVG has no physical width/height - assuming 96px/inch",
	};
}
