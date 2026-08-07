import { describe, expect, it } from "vitest";

import { getProbeRoles, probeIndexForRole, setProbeRole, setProbeRoles } from "../model/probing/roles";

describe("probe roles", () => {
	it("has no roles assigned until something is stored", () => {
		expect(getProbeRoles()).toEqual({});
		expect(probeIndexForRole("toolLength")).toBeNull();
	});

	it("assigns and reads back a role independently of the others", () => {
		setProbeRole("toolLength", 1);
		expect(probeIndexForRole("toolLength")).toBe(1);
		expect(probeIndexForRole("workpiece")).toBeNull();
		expect(probeIndexForRole("feature")).toBeNull();
	});

	it("clears a role by passing null without disturbing other roles", () => {
		setProbeRoles({ toolLength: 1, workpiece: 0 });
		setProbeRole("toolLength", null);
		expect(probeIndexForRole("toolLength")).toBeNull();
		expect(probeIndexForRole("workpiece")).toBe(0);
	});

	it("allows probe index 0 to be a valid, distinct assignment from unassigned", () => {
		setProbeRole("feature", 0);
		expect(probeIndexForRole("feature")).toBe(0);
	});
});
