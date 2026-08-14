import { describe, expect, it } from "vitest";

import {
	deployMaintenanceMacros, extractMaintenanceMacroVersion, MAINTENANCE_DAEMON_FILE, MAINTENANCE_DAEMON_MACRO,
	MAINTENANCE_FLUSH_FILE, MAINTENANCE_FLUSH_MACRO, MAINTENANCE_MACRO_FOLDER, MAINTENANCE_MACRO_SET_VERSION,
	MAINTENANCE_MACROS, MAINTENANCE_STATE_PATH, maintenanceMacrosMissing, maintenanceMacrosOutdated,
	seedMaintenanceState,
} from "../model/maintenance/macros";

// A fake card: in-memory path->text map, plus per-op failure switches and a sent-code log - mirrors
// xyzProbe.test.ts's fakeIO() shape.
function fakeIO(seed: Record<string, string> = {}) {
	const files = new Map<string, string>(Object.entries(seed));
	const sentCodes: Array<string> = [];
	const fail = { upload: false, download: false, sendCode: false };
	return {
		files, sentCodes, fail,
		upload: async (filename: string, content: Blob) => {
			if (fail.upload) { throw new Error("upload failed"); }
			files.set(filename, await content.text());
		},
		downloadText: async (filename: string) => {
			if (fail.download) { throw new Error("download failed"); }
			const text = files.get(filename);
			if (text === undefined) { throw new Error("not found"); }
			return text;
		},
		sendCode: async (code: string) => {
			if (fail.sendCode) { throw new Error("send failed"); }
			sentCodes.push(code);
			return "";
		},
	};
}

describe("macro bodies", () => {
	it("both macros carry the current version stamp", () => {
		for (const [name, body] of Object.entries(MAINTENANCE_MACROS)) {
			expect(extractMaintenanceMacroVersion(body), name).toBe(MAINTENANCE_MACRO_SET_VERSION);
		}
	});

	it("the daemon macro bails out (M99) before touching undeclared globals", () => {
		const beforeFirstUse = MAINTENANCE_DAEMON_MACRO.indexOf("M99");
		const firstAccumulate = MAINTENANCE_DAEMON_MACRO.indexOf("global.flMaintSpindleSec = global.flMaintSpindleSec");
		expect(beforeFirstUse).toBeGreaterThan(-1);
		expect(firstAccumulate).toBeGreaterThan(beforeFirstUse);
	});

	it("clamps a negative delta (reboot between polls) rather than letting it corrupt the accumulator", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if var\.dt < 0/);
	});

	it("the daemon macro calls the flush macro by its declared folder/filename", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toContain(`M98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_FLUSH_FILE}"`);
	});

	it("the flush macro writes to the declared state path using if-exists/else-set (safe to re-run)", () => {
		expect(MAINTENANCE_FLUSH_MACRO).toContain(`echo >"${MAINTENANCE_STATE_PATH}"`);
		expect(MAINTENANCE_FLUSH_MACRO).toMatch(/if !exists\(global\.flMaintSpindleIndex\)/);
		expect(MAINTENANCE_FLUSH_MACRO).toMatch(/set global\.flMaintSpindleIndex/);
	});

	// --- FFF tracking (print hours / filament used / tool changes), added alongside the original
	// spindle-hours (CNC/laser) tracking - see macros.ts's header comment for the full design.
	it("guards spindle tracking with #spindles so an FFF machine (no spindles array entry) never indexes out of bounds", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if #spindles > global\.flMaintSpindleIndex/);
	});

	it("accumulates print-seconds independently while state.status is processing", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if state\.status == "processing"/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("global.flMaintPrintSec = global.flMaintPrintSec");
	});

	it("sums every extruder's rawPosition and clamps a negative (G92-reset) delta to nothing, not a subtraction", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/while var\.i < #move\.extruders/);
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if var\.deltaE > 0/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("global.flMaintFilamentMm = global.flMaintFilamentMm");
	});

	it("counts a tool change only when the polled tool actually differs from last time", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if state\.currentTool != global\.flMaintLastTool/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("global.flMaintToolChanges = global.flMaintToolChanges + 1");
	});

	it("the flush macro also persists print-seconds, filament-mm and tool-changes", () => {
		for (const g of ["flMaintPrintSec", "flMaintFilamentMm", "flMaintToolChanges"]) {
			expect(MAINTENANCE_FLUSH_MACRO).toContain(`if !exists(global.${g})`);
			expect(MAINTENANCE_FLUSH_MACRO).toContain(`set global.${g} = " ^ global.${g}`);
		}
	});
});

describe("extractMaintenanceMacroVersion", () => {
	it("is 0 for text with no stamp", () => {
		expect(extractMaintenanceMacroVersion("; just a comment\nG91\n")).toBe(0);
	});
});

describe("maintenanceMacrosMissing / Outdated", () => {
	it("missing is true when the daemon macro isn't on the card", async () => {
		const io = fakeIO();
		await expect(maintenanceMacrosMissing(io)).resolves.toBe(true);
	});

	it("missing is false, outdated is false, once both macros are deployed", async () => {
		const io = fakeIO();
		await expect(deployMaintenanceMacros(io)).resolves.toBe(true);
		await expect(maintenanceMacrosMissing(io)).resolves.toBe(false);
		await expect(maintenanceMacrosOutdated(io)).resolves.toBe(false);
	});

	it("outdated is true for a lower version stamp", async () => {
		const stale = MAINTENANCE_DAEMON_MACRO.replace(
			`FL-MAINTENANCE-MACRO-VERSION: ${MAINTENANCE_MACRO_SET_VERSION}`, "FL-MAINTENANCE-MACRO-VERSION: 0",
		);
		const io = fakeIO({ [`${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`]: stale });
		await expect(maintenanceMacrosOutdated(io)).resolves.toBe(true);
	});

	it("outdated is false (not thrown) when the check itself fails", async () => {
		const io = fakeIO({ [`${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`]: MAINTENANCE_DAEMON_MACRO });
		io.fail.download = true;
		await expect(maintenanceMacrosOutdated(io)).resolves.toBe(false);
	});
});

describe("seedMaintenanceState", () => {
	it("writes the state file and reloads it immediately via M98", async () => {
		const io = fakeIO();
		await expect(seedMaintenanceState(io, 0, 0)).resolves.toBe(true);
		expect(io.files.get(MAINTENANCE_STATE_PATH)).toContain("flMaintSpindleIndex = 0");
		expect(io.sentCodes).toEqual([`M98 P"${MAINTENANCE_STATE_PATH}"`]);
	});

	it("preserves an already-accumulated total when re-run with a nonzero spindleSeconds", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 12345);
		expect(io.files.get(MAINTENANCE_STATE_PATH)).toContain("flMaintSpindleSec = 12345");
	});

	it("defaults the FFF counters to 0 when extra is omitted", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintPrintSec = 0");
		expect(content).toContain("flMaintFilamentMm = 0");
		expect(content).toContain("flMaintToolChanges = 0");
	});

	it("preserves already-accumulated FFF counters when re-run with explicit extra values", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, { printSeconds: 7200, filamentMm: 15000, toolChanges: 42 });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintPrintSec = 7200");
		expect(content).toContain("flMaintFilamentMm = 15000");
		expect(content).toContain("flMaintToolChanges = 42");
	});

	it("is safe to call more than once (if-exists/else-set, not a bare global declaration)", async () => {
		// The content itself must never re-declare an existing global with the bare `global` keyword -
		// that's an RRF error the second time this runs in the same boot session.
		const io = fakeIO();
		await seedMaintenanceState(io, 1, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toMatch(/if !exists\(global\.flMaintSpindleIndex\)/);
		expect(content).toMatch(/set global\.flMaintSpindleIndex = 1/);
	});

	it("reports failure (not a throw) if the upload fails", async () => {
		const io = fakeIO();
		io.fail.upload = true;
		await expect(seedMaintenanceState(io, 0, 0)).resolves.toBe(false);
	});

	it("reports failure (not a throw) if the M98 reload fails", async () => {
		const io = fakeIO();
		io.fail.sendCode = true;
		await expect(seedMaintenanceState(io, 0, 0)).resolves.toBe(false);
	});
});
