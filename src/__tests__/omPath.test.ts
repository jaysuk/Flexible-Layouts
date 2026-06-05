import { describe, expect, it } from "vitest";

import { buildOmPath, resolveOmPath } from "../util/omPath";

describe("resolveOmPath", () => {
	const model = {
		heat: { heaters: [{ current: 25.4 }, { current: 210, active: 215 }] },
		move: { axes: [{ machinePosition: 1.5 }, { machinePosition: 2.5 }] },
		state: { status: "processing" },
	};

	it("resolves dotted + bracketed paths", () => {
		expect(resolveOmPath(model, "heat.heaters[1].current")).toBe(210);
		expect(resolveOmPath(model, "move.axes[0].machinePosition")).toBe(1.5);
		expect(resolveOmPath(model, "state.status")).toBe("processing");
	});

	it("returns undefined for missing / invalid segments", () => {
		expect(resolveOmPath(model, "heat.heaters[9].current")).toBeUndefined();
		expect(resolveOmPath(model, "does.not.exist")).toBeUndefined();
		expect(resolveOmPath(model, "")).toBeUndefined();
		expect(resolveOmPath(model, "state.status.nope")).toBeUndefined();
	});
});

describe("buildOmPath", () => {
	it("is the inverse of the resolver's segmentation", () => {
		expect(buildOmPath(["heat", "heaters", "1", "current"])).toBe("heat.heaters[1].current");
		expect(buildOmPath(["state", "status"])).toBe("state.status");
		expect(buildOmPath([])).toBe("");
	});
});
