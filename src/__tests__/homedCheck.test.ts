import { describe, expect, it } from "vitest";

import { unhomedAxes } from "../util/homedCheck";

function model(axes: Array<{ letter: string; homed: boolean }>) {
	return { move: { axes } };
}

describe("unhomedAxes", () => {
	it("returns an empty list when no letters are requested", () => {
		expect(unhomedAxes(model([{ letter: "X", homed: false }]), [])).toEqual([]);
	});

	it("returns the requested letters that are not homed, preserving requested order", () => {
		const m = model([{ letter: "X", homed: true }, { letter: "Y", homed: false }, { letter: "Z", homed: false }]);
		expect(unhomedAxes(m, ["Z", "X", "Y"])).toEqual(["Z", "Y"]);
	});

	it("returns an empty list when every requested axis is homed", () => {
		const m = model([{ letter: "X", homed: true }, { letter: "Y", homed: true }]);
		expect(unhomedAxes(m, ["X", "Y"])).toEqual([]);
	});

	it("is case-insensitive on axis letters", () => {
		const m = model([{ letter: "x", homed: false }]);
		expect(unhomedAxes(m, ["X"])).toEqual(["X"]);
	});

	it("treats an axis the machine doesn't report as unhomed, conservatively", () => {
		const m = model([{ letter: "X", homed: true }]);
		expect(unhomedAxes(m, ["X", "U"])).toEqual(["U"]);
	});

	it("never throws on a missing/incomplete object model", () => {
		expect(unhomedAxes({}, ["X"])).toEqual(["X"]);
		expect(unhomedAxes(null, ["X"])).toEqual(["X"]);
		expect(unhomedAxes(undefined, ["X"])).toEqual(["X"]);
	});
});
