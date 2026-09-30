/**
 * DWC's "display units" setting (Settings > General > Units), for the widgets that show or accept lengths.
 *
 * Like stock DWC this is DISPLAY-ONLY: the firmware always reports millimetres and every command FL sends stays
 * in millimetres, so a value typed in inches is converted back before it goes into G-code. The pure functions take
 * `imperial` explicitly so they are trivial to test; `useLengthUnits()` binds them to the live settings.
 */
import { computed } from "vue";

import { useSettingsStore } from "@/stores/settings";

export const MM_PER_INCH = 25.4;

/** DWC's `UnitOfMeasure.imperial` enum value (kept as a literal so this stays free of a value import). */
const IMPERIAL = "inch";

export function mmToDisplay(mm: number, imperial: boolean): number {
	return imperial ? mm / MM_PER_INCH : mm;
}

export function displayToMm(value: number, imperial: boolean): number {
	return imperial ? value * MM_PER_INCH : value;
}

/**
 * Decimal places for a length read-out. A widget's own `precision` wins; in inches it gains two places because an
 * inch is 25x coarser than a millimetre (0.01 mm shows as 0.0004 in). With no explicit precision the default is the
 * widget's own fallback in metric (or DWC's "decimal places" setting if that is higher) and 4 places in inches.
 */
export function lengthDigits(imperial: boolean, explicit?: number, fallback = 2, dwcDecimals = 0): number {
	if (explicit !== undefined) {
		return Math.max(0, explicit) + (imperial ? 2 : 0);
	}
	return imperial ? 4 : Math.max(fallback, dwcDecimals);
}

/** "12.50" / "0.4921", in the active unit, without the unit text. */
export function formatLength(mm: number, imperial: boolean, explicit?: number, fallback = 2, dwcDecimals = 0): string {
	return mmToDisplay(mm, imperial).toFixed(lengthDigits(imperial, explicit, fallback, dwcDecimals));
}

/** Tooltip text for a configured step: always the millimetres it sends, plus the inch equivalent when in inches. */
export function stepTitle(mm: number, imperial: boolean): string {
	const text = `${Number(Math.abs(mm).toFixed(4))} mm`;
	return imperial ? `${text} (${Number((Math.abs(mm) / MM_PER_INCH).toFixed(4))} in)` : text;
}

export function useLengthUnits() {
	const settings = useSettingsStore() as { displayUnits?: string; decimalPlaces?: number };
	const imperial = computed(() => settings.displayUnits === IMPERIAL);
	const unit = computed(() => (imperial.value ? "in" : "mm"));
	const dwcDecimals = () => (typeof settings.decimalPlaces === "number" ? settings.decimalPlaces : 0);
	return {
		imperial,
		unit,
		toDisplay: (mm: number) => mmToDisplay(mm, imperial.value),
		toMm: (value: number) => displayToMm(value, imperial.value),
		digits: (explicit?: number, fallback = 2) => lengthDigits(imperial.value, explicit, fallback, dwcDecimals()),
		format: (mm: number, explicit?: number, fallback = 2) => formatLength(mm, imperial.value, explicit, fallback, dwcDecimals()),
		stepTitle: (mm: number) => stepTitle(mm, imperial.value),
	};
}
