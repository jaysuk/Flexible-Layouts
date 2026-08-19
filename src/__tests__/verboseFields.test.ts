import { afterEach, describe, expect, it, vi } from "vitest";

const setVerboseQueries = vi.fn();
vi.mock("@/stores/machine", () => ({
	useMachineStore: () => ({ setVerboseQueries }),
}));

import {
	acquireVerboseQueries, pathNeedsVerboseQueries, releaseVerboseQueries, resetForTests,
} from "../model/verboseFields";

afterEach(() => {
	setVerboseQueries.mockClear();
	resetForTests();
});

describe("pathNeedsVerboseQueries", () => {
	it("matches the known verbose spindle fields", () => {
		expect(pathNeedsVerboseQueries("spindles[0].max")).toBe(true);
		expect(pathNeedsVerboseQueries("spindles[0].min")).toBe(true);
		expect(pathNeedsVerboseQueries("spindles[3].frequency")).toBe(true);
		expect(pathNeedsVerboseQueries("spindles[3].idlePwm")).toBe(true);
		expect(pathNeedsVerboseQueries("spindles[3].maxPwm")).toBe(true);
		expect(pathNeedsVerboseQueries("spindles[3].minPwm")).toBe(true);
		expect(pathNeedsVerboseQueries("spindles[3].type")).toBe(true);
	});

	it("does not match a spindle's non-verbose fields, or unrelated OM paths", () => {
		expect(pathNeedsVerboseQueries("spindles[0].current")).toBe(false);
		expect(pathNeedsVerboseQueries("spindles[0].state")).toBe(false);
		expect(pathNeedsVerboseQueries("heat.heaters[0].current")).toBe(false);
		expect(pathNeedsVerboseQueries("sensors.probes[0].value[0]")).toBe(false);
	});

	it("returns false for an empty/missing path", () => {
		expect(pathNeedsVerboseQueries(undefined)).toBe(false);
		expect(pathNeedsVerboseQueries(null)).toBe(false);
		expect(pathNeedsVerboseQueries("")).toBe(false);
	});
});

describe("acquireVerboseQueries / releaseVerboseQueries - ref counted", () => {
	it("enables on the first acquire, ignores concurrent holders, disables only once the last releases", () => {
		acquireVerboseQueries();
		expect(setVerboseQueries).toHaveBeenCalledTimes(1);
		expect(setVerboseQueries).toHaveBeenLastCalledWith(true);

		acquireVerboseQueries(); // a second, concurrent holder
		expect(setVerboseQueries).toHaveBeenCalledTimes(1); // no redundant re-enable

		releaseVerboseQueries(); // first holder releases - one holder still remains
		expect(setVerboseQueries).toHaveBeenCalledTimes(1);
		expect(setVerboseQueries).toHaveBeenLastCalledWith(true);

		releaseVerboseQueries(); // last holder releases
		expect(setVerboseQueries).toHaveBeenCalledTimes(2);
		expect(setVerboseQueries).toHaveBeenLastCalledWith(false);
	});

	it("releasing with nothing held is a no-op, not a spurious disable call", () => {
		releaseVerboseQueries();
		expect(setVerboseQueries).not.toHaveBeenCalled();
	});
});

describe("gracefully does nothing on a store older than DWC 3.7.0-beta.3 (no setVerboseQueries method)", () => {
	it("does not throw when the store lacks setVerboseQueries", async () => {
		vi.resetModules();
		vi.doMock("@/stores/machine", () => ({ useMachineStore: () => ({}) }));
		const mod = await import("../model/verboseFields");
		expect(() => mod.acquireVerboseQueries()).not.toThrow();
		expect(() => mod.releaseVerboseQueries()).not.toThrow();
		vi.doUnmock("@/stores/machine");
		vi.resetModules();
	});
});
