/**
 * Answers the display's questions from DWC's object model: the legacy `N<code>` values and `V<code>`
 * visibility codes documented at the top of RRF's `Display/Menu.cpp`, and `V{...}` / `N{...}` expressions
 * (evaluated with dwc-gcode-core's expression evaluator against the model).
 *
 * The model is read as loosely-typed data on purpose: this is a preview, so a missing field (an older board,
 * a machine with no chamber) reads as 0 / hidden rather than throwing.
 */
import { evaluateExpression, parseExpression, type EvalValue, type MenuValue } from "dwc-gcode-core";

import { isPrintingStatus } from "../../util/printLock";

type Model = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function num(v: unknown): number {
	return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Walk `a.b[0].c` down an object. */
export function objectModelValue(model: Model, path: string): EvalValue {
	let cur: unknown = model;
	for (const part of path.split(".")) {
		const m = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
		if (!m) throw new Error(`Bad object model path: ${path}`);
		cur = (cur as Record<string, unknown> | null | undefined)?.[m[1]];
		for (const idx of m[2].matchAll(/\[(\d+)\]/g)) cur = (cur as Array<unknown> | null | undefined)?.[Number(idx[1])];
		if (cur === undefined) return null; // RRF: an absent path evaluates as null
	}
	return cur as EvalValue;
}

function toMenuValue(v: EvalValue): MenuValue {
	if (typeof v === "number") return Number.isInteger(v) ? { type: "int", value: v } : { type: "float", value: v };
	if (typeof v === "string") return { type: "text", value: v };
	if (typeof v === "boolean") return { type: "bool", value: v };
	if (v === null) return { type: "null" };
	return { type: "text", value: JSON.stringify(v) };
}

/** An `N{...}` expression, or `undefined` when it doesn't parse / evaluate (the display shows `***`). */
export function evaluateMenuValue(model: Model, expression: string): MenuValue | undefined {
	const parsed = parseExpression(expression);
	if (parsed.errors.length > 0) return undefined;
	const outcome = evaluateExpression(parsed.ast, {
		resolvePath: (path) => objectModelValue(model, path),
		resolveVariable: () => { throw new Error("no variables on the display"); },
	});
	return outcome.ok ? toMenuValue(outcome.value) : undefined;
}

/** A `V{...}` condition; RRF treats an error as false. */
export function evaluateMenuCondition(model: Model, expression: string): boolean {
	const v = evaluateMenuValue(model, expression);
	if (!v) return false;
	switch (v.type) {
		case "bool": return v.value;
		case "int":
		case "float": return v.value !== 0;
		case "text": return v.value.length > 0;
		default: return false;
	}
}

/** The heater index an item number stands for: tools 0-78 (79 = the selected tool), beds 80-89, chambers 90-99. */
function heaterIndex(model: Model, item: number): number | undefined {
	if (item < 80) {
		const toolNumber = item === 79 ? num(model.state?.currentTool) : item;
		return model.tools?.[toolNumber]?.heaters?.[0];
	}
	if (item < 90) return model.heat?.bedHeaters?.[item - 80];
	return model.heat?.chamberHeaters?.[item - 90];
}

function temperature(model: Model, group: number, item: number): number {
	const heater = heaterIndex(model, item);
	if (heater === undefined || heater < 0) return 0;
	const h = model.heat?.heaters?.[heater];
	if (group === 0) return num(h?.current);
	if (item < 80) {
		// A tool's own targets live on the tool (its heater's are the same numbers in practice).
		const toolNumber = item === 79 ? num(model.state?.currentTool) : item;
		const t = model.tools?.[toolNumber];
		return num(group === 1 ? t?.active?.[0] : t?.standby?.[0]);
	}
	return num(group === 1 ? h?.active : h?.standby);
}

/** A legacy `N<code>` value in display units (see `MenuHost.legacyValue`). */
export function legacyValue(model: Model, code: number): number | string | undefined {
	const group = Math.floor(code / 100);
	const item = code % 100;
	switch (group) {
		case 0:
		case 1:
		case 2:
			return temperature(model, group, item);
		case 3: {
			const fan = item === 99 ? model.fans?.[num(model.tools?.[num(model.state?.currentTool)]?.fans?.[0])] : model.fans?.[item];
			return num(fan?.actualValue ?? fan?.requestedValue) * 100;
		}
		case 4:
			return num(model.move?.extruders?.[item]?.factor) * 100;
		case 5:
			switch (item) {
				case 0: return num(model.move?.speedFactor) * 100;
				case 1: return String(model.state?.displayMessage ?? "");
				case 10: case 11: case 12: case 13: case 14: case 15:
					return num(model.move?.axes?.[item - 10]?.userPosition);
				case 20: return num(model.state?.currentTool);
				case 21: return num(model.move?.axes?.[2]?.babystep);
				case 30: case 31: case 32: case 33:
					return Number(String(model.network?.interfaces?.[0]?.actualIP ?? "").split(".")[item - 30]) || 0;
				case 34: return String(model.network?.interfaces?.[0]?.actualIP ?? "");
				case 35: {
					const size = num(model.job?.file?.size);
					return size > 0 && isPrintingStatus(model.state?.status) ? (num(model.job?.filePosition) / size) * 100 : 0;
				}
				case 36: return isPrintingStatus(model.state?.status) ? num(model.job?.timesLeft?.file) : 0;
				case 37: return isPrintingStatus(model.state?.status) ? num(model.job?.timesLeft?.filament) : 0;
				case 38: return num(model.move?.currentMove?.requestedSpeed);
				case 39: return num(model.move?.currentMove?.topSpeed);
				default: return undefined;
			}
		default:
			return undefined;
	}
}

/** A legacy `V<code>` visibility (`MenuItem::IsVisible`). Unknown codes and 0 are always visible. */
export function visibilityCode(model: Model, code: number): boolean {
	const status = model.state?.status as string | undefined;
	const printing = isPrintingStatus(status);
	const paused = status === "paused" || status === "pausing";
	const reallyPrinting = status === "processing" || status === "simulating";
	const sdMounted = model.volumes?.[0]?.mounted !== false;
	const heaterFault = (heater: number | undefined) => heater !== undefined && model.heat?.heaters?.[heater]?.state === "fault";
	switch (code) {
		case 2: return reallyPrinting;
		case 3: return !reallyPrinting;
		case 4: return printing;
		case 5: return !printing;
		case 6: return paused;
		case 7: return reallyPrinting || status === "resuming";
		case 10: return sdMounted;
		case 11: return !sdMounted;
		case 20: return heaterFault(heaterIndex(model, 79));
		case 28: return heaterFault(model.heat?.bedHeaters?.[0]);
		default: return true;
	}
}
