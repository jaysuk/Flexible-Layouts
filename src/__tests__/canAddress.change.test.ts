import { describe, expect, it } from "vitest";

import { applyCanAddressRewrite, planCanAddressRewrite, sendCanAddressChange } from "../model/canAddress/change";

function fakeIo(files: Record<string, string>, dirs: Record<string, Array<{ name: string; isDirectory: boolean }>>) {
	const uploaded: Record<string, string> = {};
	const sentCodes: Array<string> = [];
	return {
		io: {
			getFileList: async (dir: string) => dirs[dir] ?? [],
			downloadText: async (path: string) => {
				if (!(path in files)) { throw new Error("not found"); }
				return files[path];
			},
			upload: async (path: string, content: Blob) => { uploaded[path] = await content.text(); },
			sendCode: async (code: string) => { sentCodes.push(code); return ""; },
		},
		uploaded,
		sentCodes,
	};
}

describe("planCanAddressRewrite", () => {
	it("scans 0:/sys, 0:/macros and 0:/filaments, only including files that actually reference the old address", () => {
		const { io } = fakeIo(
			{
				"0:/sys/config.g": "M569 P121.0 S1\nG28\n",
				"0:/sys/homeall.g": "G91\nG1 Z5\n", // no reference - must be excluded from the plan
				"0:/macros/Print/start.g": 'M950 F0 C"121.out0"\n',
				"0:/filaments/PLA/load.g": 'M950 J0 C"121.io0.in"\nG1 E50\n',
			},
			{
				"0:/sys": [{ name: "config.g", isDirectory: false }, { name: "homeall.g", isDirectory: false }],
				"0:/macros": [{ name: "Print", isDirectory: true }],
				"0:/macros/Print": [{ name: "start.g", isDirectory: false }],
				"0:/filaments": [{ name: "PLA", isDirectory: true }],
				"0:/filaments/PLA": [{ name: "load.g", isDirectory: false }],
			},
		);
		return planCanAddressRewrite(io, 121, 20).then((plans) => {
			expect(plans.map((p) => p.path).sort()).toEqual([
				"0:/filaments/PLA/load.g", "0:/macros/Print/start.g", "0:/sys/config.g",
			]);
			expect(plans.every((p) => p.result.changed)).toBe(true);
		});
	});

	it("0:/filaments not existing at all is normal, not an error (a machine with no custom filaments)", async () => {
		const { io } = fakeIo(
			{ "0:/sys/config.g": "M569 P121.0\n" },
			{ "0:/sys": [{ name: "config.g", isDirectory: false }], "0:/macros": [] }, // no "0:/filaments" entry at all
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		expect(plans.map((p) => p.path)).toEqual(["0:/sys/config.g"]);
	});

	it("recurses into macro subfolders (macros are documented as freely sub-foldered)", async () => {
		const { io } = fakeIo(
			{ "0:/macros/Tools/Change/T0.g": "M569 P121.0\n" },
			{
				"0:/sys": [],
				"0:/macros": [{ name: "Tools", isDirectory: true }],
				"0:/macros/Tools": [{ name: "Change", isDirectory: true }],
				"0:/macros/Tools/Change": [{ name: "T0.g", isDirectory: false }],
			},
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		expect(plans.map((p) => p.path)).toEqual(["0:/macros/Tools/Change/T0.g"]);
	});

	it("inspects macro files with NO extension at all - RRF doesn't require .g for an M98-invoked macro, and user macros conventionally have none (e.g. \"Preheat PLA\")", async () => {
		const { io } = fakeIo(
			{ "0:/macros/Preheat PLA": 'M950 F0 C"121.out0"\nM106 P0 S1\n' },
			{
				"0:/sys": [],
				"0:/macros": [{ name: "Preheat PLA", isDirectory: false }],
			},
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		expect(plans.map((p) => p.path)).toEqual(["0:/macros/Preheat PLA"]);
	});

	it("still inspects (not skips) files with an unrelated extension - a wrong reference could be anywhere", async () => {
		const { io } = fakeIo(
			{ "0:/sys/notes.txt": "M569 P121.0 ; leftover note referencing the old board\n" },
			{
				"0:/sys": [{ name: "notes.txt", isDirectory: false }],
				"0:/macros": [],
			},
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		expect(plans.map((p) => p.path)).toEqual(["0:/sys/notes.txt"]);
	});

	it("a genuinely unrelated file (no reference to the old address) is still excluded from the plan regardless of extension", async () => {
		const { io } = fakeIo(
			{
				"0:/sys/notes.txt": "just a comment, no gcode here\n",
				"0:/sys/config.g.bak": "M569 P5.0 ; a different board entirely\n",
				"0:/macros/Preheat PLA": "M106 P0 S1\n",
			},
			{
				"0:/sys": [{ name: "notes.txt", isDirectory: false }, { name: "config.g.bak", isDirectory: false }],
				"0:/macros": [{ name: "Preheat PLA", isDirectory: false }],
			},
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		expect(plans).toEqual([]);
	});

	it("skips .bak files even when they DO reference the old address - a stale backup copy, not live gcode", async () => {
		const { io } = fakeIo(
			{
				"0:/sys/config.g": "M569 P121.0 S1\n",
				"0:/sys/config.g.bak": "M569 P121.0 S1\n", // identical content, but a backup copy - must not be rewritten
			},
			{ "0:/sys": [{ name: "config.g", isDirectory: false }, { name: "config.g.bak", isDirectory: false }], "0:/macros": [] },
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		expect(plans.map((p) => p.path)).toEqual(["0:/sys/config.g"]);
	});

	it("resolves to an empty plan (not a throw) if a directory listing fails, e.g. offline", async () => {
		const io = {
			getFileList: async () => { throw new Error("offline"); },
			downloadText: async () => { throw new Error("offline"); },
		};
		await expect(planCanAddressRewrite(io, 121, 20)).resolves.toEqual([]);
	});
});

describe("applyCanAddressRewrite", () => {
	it("uploads every planned file at its own path with the rewritten text", async () => {
		const { io, uploaded } = fakeIo(
			{ "0:/sys/config.g": "M569 P121.0\n" },
			{ "0:/sys": [{ name: "config.g", isDirectory: false }], "0:/macros": [] },
		);
		const plans = await planCanAddressRewrite(io, 121, 20);
		await applyCanAddressRewrite(io, plans);
		expect(uploaded["0:/sys/config.g"]).toBe("M569 P20.0\n");
	});
});

describe("sendCanAddressChange", () => {
	it("sends M952 to reprogram the address, then M999 targeting the OLD address to restart the board", async () => {
		const { io, sentCodes } = fakeIo({}, { "0:/sys": [], "0:/macros": [] });
		await sendCanAddressChange(io, 121, 20);
		expect(sentCodes).toEqual(["M952 B121 A20", "M999 B121"]);
	});
});
