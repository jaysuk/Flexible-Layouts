/**
 * Apply an {@link InputModifier} to a user-entered value — the input-side counterpart to the value
 * widget's display formatting. Used by every value-entry widget (input, slider, stepper, heater) just
 * before the value is substituted into a `{value}` command or written to a global.
 */
import type { InputModifier } from "../model/document";
import { evalMathExpr } from "./mathExpr";

/** Coerce a possibly-blank field to a finite number, falling back to `d`. */
function numOr(x: unknown, d: number): number {
	if (x === undefined || x === null || x === "") {
		return d;
	}
	const n = Number(x);
	return Number.isFinite(n) ? n : d;
}

/** True when the modifier would actually change anything (so we can skip it / not persist blanks). */
export function hasInputModifier(mod?: InputModifier): boolean {
	if (!mod) {
		return false;
	}
	const num = (x: unknown) => x !== undefined && x !== null && x !== "" && Number.isFinite(Number(x));
	return num(mod.scale) || num(mod.offset)
		|| !!(mod.expression && mod.expression.trim())
		|| !!(mod.map && mod.map.some((m) => (m.from ?? "") !== "" || (m.to ?? "") !== ""));
}

/** Trim float noise without forcing a fixed precision. */
function numToStr(v: number): string {
	return Number(v.toFixed(6)).toString();
}

/**
 * Transform an entered value into the string to send. No-op (returns the value unchanged) when the
 * modifier is empty. Order: exact map match first, then numeric `scale`/`offset` then `expression`.
 * A non-numeric value with no matching map entry is returned unchanged.
 */
export function applyInputModifier(entered: string | number, mod?: InputModifier): string {
	const raw = String(entered);
	if (!hasInputModifier(mod)) {
		return raw;
	}
	if (mod!.map?.length) {
		const hit = mod!.map.find((m) => m.from === raw);
		if (hit) {
			return hit.to;
		}
	}
	const n = Number(entered);
	if (raw.trim() !== "" && Number.isFinite(n)) {
		let v = n * numOr(mod!.scale, 1) + numOr(mod!.offset, 0);
		if (mod!.expression && mod!.expression.trim()) {
			const e = evalMathExpr(mod!.expression, v);
			if (e === undefined) {
				return raw; // malformed expression — send what was typed, untransformed
			}
			v = e;
		}
		return numToStr(v);
	}
	return raw;
}

/**
 * Inverse of the *linear* part only, for prefilling a field from a live value: entered =
 * (value - offset) / scale. Returns null when the modifier isn't purely linear (an expression or map
 * is set), since those can't be auto-inverted — the caller then skips prefilling.
 */
export function invertLinear(value: number, mod?: InputModifier): number | null {
	if (!hasInputModifier(mod)) {
		return value;
	}
	if ((mod!.expression && mod!.expression.trim())
		|| (mod!.map && mod!.map.some((m) => (m.from ?? "") !== "" || (m.to ?? "") !== ""))) {
		return null;
	}
	const scale = numOr(mod!.scale, 1);
	if (scale === 0) {
		return null;
	}
	return Number((((value - numOr(mod!.offset, 0)) / scale)).toFixed(6));
}
