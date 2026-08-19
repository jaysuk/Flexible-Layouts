import { describe, expect, it } from "vitest";

import {
	applyJobTrackingPatches, CANCEL_G_PATH, patchCancelGForJobTracking, patchStartGForJobTracking,
	patchStopGForJobTracking, planJobTrackingPatches, START_G_PATH, STOP_G_PATH, type JobMacroPlan,
} from "../model/maintenance/jobTrackingPatch";

const START_HOOK = "set global.flMaintJobsStarted = global.flMaintJobsStarted + 1";
const STOP_HOOK = "set global.flMaintJobsFinished = global.flMaintJobsFinished + 1";
const CANCEL_HOOK = "set global.flMaintJobsCancelled = global.flMaintJobsCancelled + 1";

describe("patchStartGForJobTracking", () => {
	it("creates a minimal file when start.g doesn't exist (null, distinct from empty string)", () => {
		const result = patchStartGForJobTracking(null);
		expect(result.changed).toBe(true);
		expect(result.text).toContain(START_HOOK);
	});

	it("appends the counter without touching existing content", () => {
		const original = "M83 ; relative extruder mode\n";
		const result = patchStartGForJobTracking(original);
		expect(result.changed).toBe(true);
		expect(result.text.startsWith(original)).toBe(true);
		expect(result.text).toContain(START_HOOK);
	});

	it("guards on state.status != \"simulating\" so an M37 dry-run is never counted as a real start", () => {
		const result = patchStartGForJobTracking("");
		expect(result.text).toMatch(/if exists\(global\.flMaintJobsStarted\) && state\.status != "simulating"/);
	});

	it("is a no-op when start.g already has the counter", () => {
		const original = `M83\nif exists(global.flMaintJobsStarted) && state.status != "simulating"\n\t${START_HOOK}\n`;
		const result = patchStartGForJobTracking(original);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});
});

describe("patchStopGForJobTracking", () => {
	it("creates a minimal file when stop.g doesn't exist", () => {
		const result = patchStopGForJobTracking(null);
		expect(result.changed).toBe(true);
		expect(result.text).toContain(STOP_HOOK);
	});

	it("has no simulation guard - stop.g never runs during a simulation, so none is needed", () => {
		const result = patchStopGForJobTracking("");
		expect(result.text).not.toContain("simulating");
		expect(result.text).toMatch(/if exists\(global\.flMaintJobsFinished\)\r?\n\tset global\.flMaintJobsFinished/);
	});

	it("is a no-op when stop.g already has the counter", () => {
		const original = `${STOP_HOOK}\n`;
		const result = patchStopGForJobTracking(original);
		expect(result.changed).toBe(false);
	});
});

describe("patchCancelGForJobTracking", () => {
	it("creates cancel.g when it's missing - unlike start.g/stop.g, this one is never left absent", () => {
		const result = patchCancelGForJobTracking(null);
		expect(result.changed).toBe(true);
		expect(result.text).toContain(CANCEL_HOOK);
		// The creation message explains WHY, since a plugin silently creating a new sys file is
		// surprising unless the reason (RRF's stop.g fallback) is made explicit in the preview.
		expect(result.changes[0]).toContain("stop.g instead");
	});

	it("appends without touching existing content when cancel.g already exists", () => {
		const original = "; my own cancel handling\nM117 Cancelled\n";
		const result = patchCancelGForJobTracking(original);
		expect(result.text.startsWith(original)).toBe(true);
		expect(result.text).toContain(CANCEL_HOOK);
	});

	it("is a no-op when cancel.g already has the counter", () => {
		const original = `${CANCEL_HOOK}\n`;
		const result = patchCancelGForJobTracking(original);
		expect(result.changed).toBe(false);
	});
});

describe("planJobTrackingPatches / applyJobTrackingPatches", () => {
	function fakeIo(files: Record<string, string>) {
		const uploaded: Record<string, string> = {};
		return {
			io: {
				downloadText: async (path: string) => {
					if (!(path in files)) { throw new Error("not found"); }
					return files[path];
				},
				upload: async (path: string, content: Blob) => { uploaded[path] = await content.text(); },
			},
			uploaded,
		};
	}

	it("plans all three files at their fixed 0:/sys paths", async () => {
		const { io } = fakeIo({});
		const plans = await planJobTrackingPatches(io);
		expect(plans.map((p) => p.path)).toEqual([START_G_PATH, STOP_G_PATH, CANCEL_G_PATH]);
		expect(plans.every((p) => p.plan.changed)).toBe(true); // none exist yet - all three get created
	});

	it("plans no change for files that already have their counter", async () => {
		const { io } = fakeIo({
			[START_G_PATH]: `if exists(global.flMaintJobsStarted) && state.status != "simulating"\n\t${START_HOOK}\n`,
			[STOP_G_PATH]: `${STOP_HOOK}\n`,
			[CANCEL_G_PATH]: `${CANCEL_HOOK}\n`,
		});
		const plans = await planJobTrackingPatches(io);
		expect(plans.every((p) => !p.plan.changed)).toBe(true);
	});

	it("applyJobTrackingPatches only uploads plans that actually changed, at the right paths", async () => {
		const { io, uploaded } = fakeIo({ [START_G_PATH]: `${START_HOOK}\n` }); // already has it - stop.g/cancel.g don't exist
		const plans = await planJobTrackingPatches(io);
		await applyJobTrackingPatches(io, plans);

		expect(uploaded[START_G_PATH]).toBeUndefined(); // already had the hook - not re-uploaded
		expect(uploaded[STOP_G_PATH]).toContain(STOP_HOOK);
		expect(uploaded[CANCEL_G_PATH]).toContain(CANCEL_HOOK);
	});

	it("skips plans with nothing to do without calling upload at all", async () => {
		let uploadCalls = 0;
		const plans: Array<JobMacroPlan> = [
			{ file: "start.g", path: START_G_PATH, plan: { text: "unchanged", changed: false, changes: [] } },
		];
		await applyJobTrackingPatches({ upload: async () => { uploadCalls++; } }, plans);
		expect(uploadCalls).toBe(0);
	});
});
