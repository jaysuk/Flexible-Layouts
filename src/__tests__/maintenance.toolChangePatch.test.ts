import { describe, expect, it } from "vitest";

import {
	applyTpostPatches, findTpostFiles, patchTpostForToolChanges, planTpostPatches, SYS_DIR, type TpostPatchPlan,
} from "../model/maintenance/toolChangePatch";

const HOOK_LINE = "set global.flMaintToolChanges = global.flMaintToolChanges + 1";

describe("patchTpostForToolChanges", () => {
	it("creates a minimal file when none exists (null, distinct from empty string)", () => {
		const result = patchTpostForToolChanges(null);
		expect(result.changed).toBe(true);
		expect(result.text).toContain(HOOK_LINE);
		expect(result.text).toContain("if exists(global.flMaintToolChanges)");
	});

	it("appends the counter to an existing file without touching its content", () => {
		const original = "M116 P0 ; wait for tool 0\nM83\nG1 E4 F2500\n";
		const result = patchTpostForToolChanges(original);
		expect(result.changed).toBe(true);
		expect(result.text.startsWith(original)).toBe(true);
		expect(result.text).toContain(HOOK_LINE);
	});

	it("an EMPTY existing file (real file, zero bytes) is appended to, not treated as missing", () => {
		const result = patchTpostForToolChanges("");
		expect(result.changed).toBe(true);
		expect(result.text).toContain(HOOK_LINE);
	});

	it("is a no-op when the file already has the counter", () => {
		const original = `M116 P0\n; Flexible Layouts: count this tool change for maintenance tracking\nif exists(global.flMaintToolChanges)\n\t${HOOK_LINE}\n`;
		const result = patchTpostForToolChanges(original);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});

	it("ignores a mention only in a comment - still patches", () => {
		const original = "; see flMaintToolChanges = global.flMaintToolChanges + 1 for tracking\nM116 P0\n";
		const result = patchTpostForToolChanges(original);
		expect(result.changed).toBe(true);
	});

	it("guards the increment with exists() so a machine without maintenance tracking set up never errors", () => {
		const result = patchTpostForToolChanges("G4 S0\n");
		expect(result.text).toMatch(/if exists\(global\.flMaintToolChanges\)\r?\n\tset global\.flMaintToolChanges/);
	});
});

describe("findTpostFiles", () => {
	it("falls back to the generic tpost.g when nothing is on the card", async () => {
		const names = await findTpostFiles({ getFileList: async () => [] });
		expect(names).toEqual(["tpost.g"]);
	});

	it("uses only the numbered tpost#.g files when any exist - never the generic one alongside them", async () => {
		const names = await findTpostFiles({
			getFileList: async () => [
				{ isDirectory: false, name: "tpost0.g", size: 10, lastModified: null },
				{ isDirectory: false, name: "tpost1.g", size: 10, lastModified: null },
				{ isDirectory: false, name: "tpost.g", size: 10, lastModified: null },
			],
		});
		expect(names).toEqual(["tpost0.g", "tpost1.g"]);
	});

	it("falls back to the generic tpost.g when it's the only tpost file present (no numbered ones)", async () => {
		const names = await findTpostFiles({
			getFileList: async () => [{ isDirectory: false, name: "tpost.g", size: 10, lastModified: null }],
		});
		expect(names).toEqual(["tpost.g"]);
	});

	it("ignores tfree#.g/tpre#.g and any directory named like a tpost file", async () => {
		const names = await findTpostFiles({
			getFileList: async () => [
				{ isDirectory: false, name: "tfree0.g", size: 10, lastModified: null },
				{ isDirectory: false, name: "tpre0.g", size: 10, lastModified: null },
				{ isDirectory: true, name: "tpost0.g", size: 0, lastModified: null },
			],
		});
		expect(names).toEqual(["tpost.g"]); // the directory doesn't count as a numbered file, so this falls back
	});

	it("falls back to just the generic name if the directory listing itself fails (e.g. offline)", async () => {
		const names = await findTpostFiles({ getFileList: async () => { throw new Error("offline"); } });
		expect(names).toEqual(["tpost.g"]);
	});
});

describe("planTpostPatches / applyTpostPatches", () => {
	function fakeIo(files: Record<string, string>) {
		const uploaded: Record<string, string> = {};
		return {
			io: {
				getFileList: async () => Object.keys(files).map((name) => ({ isDirectory: false, name, size: 10, lastModified: null })),
				downloadText: async (path: string) => {
					const name = path.slice(`${SYS_DIR}/`.length);
					if (!(name in files)) { throw new Error("not found"); }
					return files[name];
				},
				upload: async (path: string, content: Blob) => { uploaded[path] = await content.text(); },
			},
			uploaded,
		};
	}

	it("plans a patch for every discovered numbered file, and does NOT touch the generic tpost.g when numbered files exist", async () => {
		const { io } = fakeIo({ "tpost0.g": "M116 P0\n", "tpost.g": "M116\n" });
		const plans = await planTpostPatches(io);
		expect(plans.map((p) => p.file)).toEqual(["tpost0.g"]);
		expect(plans[0].plan.changed).toBe(true); // exists, needs the hook
	});

	it("plans a patch for the generic tpost.g only when no numbered files exist", async () => {
		const { io } = fakeIo({});
		const plans = await planTpostPatches(io);
		expect(plans.map((p) => p.file)).toEqual(["tpost.g"]);
		expect(plans[0].plan.changed).toBe(true); // doesn't exist yet
	});

	it("plans no change for a file that already has the hook", async () => {
		const { io } = fakeIo({ "tpost.g": `M116\n${HOOK_LINE}\n` });
		const plans = await planTpostPatches(io);
		expect(plans.find((p) => p.file === "tpost.g")!.plan.changed).toBe(false);
	});

	it("applyTpostPatches only uploads plans that actually changed, at the right path", async () => {
		const { io, uploaded } = fakeIo({ "tpost0.g": `M116\n${HOOK_LINE}\n`, "tpost1.g": "M116\n" });
		const plans = await planTpostPatches(io);
		await applyTpostPatches(io, plans);

		expect(uploaded[`${SYS_DIR}/tpost0.g`]).toBeUndefined(); // already had the hook - not re-uploaded
		expect(uploaded[`${SYS_DIR}/tpost1.g`]).toContain(HOOK_LINE);
		expect(uploaded[`${SYS_DIR}/tpost.g`]).toBeUndefined(); // numbered files exist - generic left alone entirely
	});

	it("skips plans with nothing to do without calling upload at all", async () => {
		let uploadCalls = 0;
		const plans: Array<TpostPatchPlan> = [
			{ file: "tpost0.g", path: `${SYS_DIR}/tpost0.g`, plan: { text: "unchanged", changed: false, changes: [] } },
		];
		await applyTpostPatches({ upload: async () => { uploadCalls++; } }, plans);
		expect(uploadCalls).toBe(0);
	});
});
