import { describe, expect, it } from "vitest";

import {
	deployMaintenanceMacros, extractMaintenanceMacroVersion, MAINTENANCE_DAEMON_FILE, MAINTENANCE_DAEMON_MACRO,
	MAINTENANCE_FLUSH_FILE, MAINTENANCE_FLUSH_MACRO, MAINTENANCE_MACRO_FOLDER, MAINTENANCE_MACRO_SET_VERSION,
	MAINTENANCE_MACROS, MAINTENANCE_MAX_TRACKED_AXES, MAINTENANCE_MAX_TRACKED_FANS, MAINTENANCE_MAX_TRACKED_HEATERS,
	MAINTENANCE_STATE_PATH, maintenanceMacrosMissing, maintenanceMacrosOutdated, seedMaintenanceState,
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

	// Regression test for a real, user-hit bug (v5): RRF meta-gcode has no "endif" keyword at all -
	// blocks close purely by dedenting (confirmed against RRF's own persistentGlobal.g reference
	// example on the wiki, which chains multiple if/else blocks with nothing between them). The flush
	// macro used to `echo` a literal "endif" line after every block, which every deployed copy then
	// wrote into the persisted state file - RRF refused to load it at the next boot ("Bad command:
	// endif"), silently losing every tracked total. This must never come back, in either macro.
	it("never emits an 'endif' line - RRF meta-gcode has no such keyword", () => {
		expect(MAINTENANCE_FLUSH_MACRO).not.toMatch(/endif/i);
		expect(MAINTENANCE_DAEMON_MACRO).not.toMatch(/endif/i);
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
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/while iterations < #move\.extruders/);
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if var\.deltaE > 0/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("global.flMaintFilamentMm = global.flMaintFilamentMm");
	});

	it("uses RRF's own iterations loop counter, not a hand-rolled index variable", () => {
		expect(MAINTENANCE_DAEMON_MACRO).not.toMatch(/var i = 0/);
		expect(MAINTENANCE_DAEMON_MACRO).not.toMatch(/var\.i/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("move.extruders[iterations].rawPosition");
	});

	// Regression test for a real bug: global.* survives a macro-file redeploy (only a reboot clears
	// it), so a machine already running an older daemon macro could have flMaintLastPollTime already
	// declared while flMaintLastExtruderPos (added later) was not - if all were gated behind ONE
	// shared exists-check, the new ones would never get seeded. Each must have its own independent guard.
	it("seeds each poll-comparison variable behind its OWN exists-guard, not one shared guard", () => {
		for (const g of ["flMaintLastPollTime", "flMaintUnflushedSec", "flMaintLastExtruderPos", "flMaintEnabled", "flMaintPowerOnSec"]) {
			expect(MAINTENANCE_DAEMON_MACRO, g).toMatch(new RegExp(`if !exists\\(global\\.${g}\\)\\r?\\n\\tglobal ${g} = `));
		}
	});

	// --- Power-on time: accumulates on every poll regardless of machine mode/spindle/print state
	// (unlike every other counter, which gates on something), but still respects the pause flag since
	// it comes after the enabled-check's M99 return.
	it("accumulates power-on time unconditionally (after the pause-check, before any per-mode gate)", () => {
		const enabledCheck = MAINTENANCE_DAEMON_MACRO.indexOf("if !global.flMaintEnabled");
		const powerOnAccumulate = MAINTENANCE_DAEMON_MACRO.indexOf("global.flMaintPowerOnSec = global.flMaintPowerOnSec + var.dt");
		const spindleGuard = MAINTENANCE_DAEMON_MACRO.indexOf("if #spindles > global.flMaintSpindleIndex");
		expect(powerOnAccumulate).toBeGreaterThan(-1);
		expect(powerOnAccumulate).toBeGreaterThan(enabledCheck); // after the pause gate, so pausing does stop it
		expect(powerOnAccumulate).toBeLessThan(spindleGuard); // but unconditional w.r.t. machine mode/spindle state
	});

	// --- Filament runout/jam/slippage count, edge-triggered off extruder 0's filament monitor status.
	it("seeds the last-seen filament status only when a monitor is actually configured", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(
			/if !exists\(global\.flMaintLastFilamentStatus\) && #sensors\.filamentMonitors > 0\r?\n\tglobal flMaintLastFilamentStatus = sensors\.filamentMonitors\[0\]\.status/,
		);
	});

	it("guards filament-error tracking with #sensors.filamentMonitors so a machine with none never indexes out of bounds", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if #sensors\.filamentMonitors > 0/);
	});

	it("treats noFilament/tooLittleMovement/tooMuchMovement/sensorError as problem states, but not noDataReceived/ok/noMonitor", () => {
		for (const problem of ["noFilament", "tooLittleMovement", "tooMuchMovement", "sensorError"]) {
			expect(MAINTENANCE_DAEMON_MACRO, problem).toContain(`== "${problem}"`);
		}
		expect(MAINTENANCE_DAEMON_MACRO).not.toContain('== "noDataReceived"');
	});

	it("counts a filament error only on the transition into a problem state (edge-triggered), not every poll spent in one", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if var\.fmIsProblem && !var\.fmWasProblem/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("global.flMaintFilamentErrors = global.flMaintFilamentErrors + 1");
	});

	it("can be paused without undeploying - flMaintEnabled gates accumulation, and last-poll-time is kept current regardless", () => {
		const enabledCheck = MAINTENANCE_DAEMON_MACRO.indexOf("if !global.flMaintEnabled");
		const pollTimeUpdate = MAINTENANCE_DAEMON_MACRO.indexOf("set global.flMaintLastPollTime = state.upTime");
		const spindleAccumulate = MAINTENANCE_DAEMON_MACRO.indexOf("global.flMaintSpindleSec = global.flMaintSpindleSec");
		expect(enabledCheck).toBeGreaterThan(-1);
		expect(pollTimeUpdate).toBeGreaterThan(-1);
		expect(pollTimeUpdate).toBeLessThan(enabledCheck); // poll time updates BEFORE the pause check
		expect(enabledCheck).toBeLessThan(spindleAccumulate); // pause check happens BEFORE any accumulation
	});

	// v6: tool changes are counted by toolChangePatch.ts's direct increment in tpost#.g/tpost.g, not by
	// polling here - polling could only ever see the latest tool at each poll, silently undercounting a
	// rapid multi-tool sequence between two polls. See toolChangePatch.test.ts for that counter's tests.
	it("no longer polls state.currentTool to count tool changes", () => {
		// A comment explaining the v6 change is fine (and expected) - it's an actual comparison/
		// assignment against state.currentTool or flMaintLastTool that must be gone.
		expect(MAINTENANCE_DAEMON_MACRO).not.toMatch(/if\s+state\.currentTool/);
		expect(MAINTENANCE_DAEMON_MACRO).not.toMatch(/(global|set)\s+flMaintLastTool|global\.flMaintLastTool/);
	});

	it("the flush macro also persists print-seconds, filament-mm, tool-changes, power-on time, filament errors, job counts and the enabled flag", () => {
		for (const g of [
			"flMaintPrintSec", "flMaintFilamentMm", "flMaintToolChanges", "flMaintPowerOnSec", "flMaintFilamentErrors",
			"flMaintJobsStarted", "flMaintJobsFinished", "flMaintJobsCancelled", "flMaintEnabled",
		]) {
			expect(MAINTENANCE_FLUSH_MACRO).toContain(`if !exists(global.${g})`);
			expect(MAINTENANCE_FLUSH_MACRO).toContain(`set global.${g} = " ^ global.${g}`);
		}
	});

	// --- v8: per-axis travel / per-fan / per-heater tracking. All three are FIXED-SIZE arrays (see
	// MAINTENANCE_MAX_TRACKED_* in macros.ts) seeded as a plain literal - never built with a loop -
	// specifically to avoid the more failure-prone "build an array dynamically" RRF meta-gcode shape.
	it("seeds each v8 array as a fixed-length literal of the declared capacity, behind its own guard", () => {
		const cases: Array<[string, number, string]> = [
			["flMaintAxisMm", MAINTENANCE_MAX_TRACKED_AXES, "0"],
			["flMaintLastAxisPos", MAINTENANCE_MAX_TRACKED_AXES, "0"],
			["flMaintLastAxisHomed", MAINTENANCE_MAX_TRACKED_AXES, "false"],
			["flMaintFanSec", MAINTENANCE_MAX_TRACKED_FANS, "0"],
			["flMaintHeaterSec", MAINTENANCE_MAX_TRACKED_HEATERS, "0"],
			["flMaintHeaterFullSec", MAINTENANCE_MAX_TRACKED_HEATERS, "0"],
		];
		for (const [g, len, fill] of cases) {
			const literal = `{${Array(len).fill(fill).join(",")}}`;
			expect(MAINTENANCE_DAEMON_MACRO, g).toMatch(new RegExp(`if !exists\\(global\\.${g}\\)\\r?\\n\\tglobal ${g} = `));
			expect(MAINTENANCE_DAEMON_MACRO, g).toContain(`global ${g} = ${literal}`);
		}
	});

	it("guards axis/fan/heater tracking with a capacity check so an exotic machine that exceeds it is skipped, not indexed out of bounds", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toContain(`if #move.axes <= ${MAINTENANCE_MAX_TRACKED_AXES}`);
		expect(MAINTENANCE_DAEMON_MACRO).toContain(`if #fans <= ${MAINTENANCE_MAX_TRACKED_FANS}`);
		expect(MAINTENANCE_DAEMON_MACRO).toContain(`if #heat.heaters <= ${MAINTENANCE_MAX_TRACKED_HEATERS}`);
	});

	it("only accumulates axis travel once an axis was ALREADY homed on the previous poll (homing grace period)", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if var\.axisHomed\r?\n\s*if var\.axisWasHomed/);
		// The homed flag itself updates every poll regardless, outside the "was homed" branch - so a
		// freshly-homed axis captures its baseline position this poll and starts diffing next poll.
		expect(MAINTENANCE_DAEMON_MACRO).toContain("set global.flMaintLastAxisHomed[iterations] = var.axisHomed");
	});

	it("bounds an axis-position delta to the axis's own min-max range before trusting it (catches a WCS/offset jump)", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/var axisRange = move\.axes\[iterations\]\.max - move\.axes\[iterations\]\.min/);
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if var\.axisDelta <= var\.axisRange/);
	});

	it("uses abs() on the axis delta, not a signed subtraction, since travel accumulates regardless of direction", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toContain("var axisDelta = abs(move.axes[iterations].machinePosition - global.flMaintLastAxisPos[iterations])");
	});

	it("null-guards fans[] and heat.heaters[] before reading a field - both arrays can have unconfigured (null) slots", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if fans\[iterations\] != null && fans\[iterations\]\.actualValue > 0/);
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if heat\.heaters\[iterations\] != null && heat\.heaters\[iterations\]\.state != "off"/);
	});

	it("treats a heater as full-load at 95% average duty, tracked as a separate counter from plain on-time", () => {
		expect(MAINTENANCE_DAEMON_MACRO).toMatch(/if heat\.heaters\[iterations\]\.avgPwm >= 0\.95/);
		expect(MAINTENANCE_DAEMON_MACRO).toContain("global.flMaintHeaterFullSec[iterations] = global.flMaintHeaterFullSec[iterations] + var.dt");
	});

	it("the flush macro persists all four v8 arrays by manually building the {a,b,c} literal via a loop, not an array-to-string conversion", () => {
		for (const g of ["flMaintAxisMm", "flMaintFanSec", "flMaintHeaterSec", "flMaintHeaterFullSec"]) {
			expect(MAINTENANCE_FLUSH_MACRO, g).toContain(`if !exists(global.${g})`);
			expect(MAINTENANCE_FLUSH_MACRO, g).toMatch(new RegExp(`while iterations < #global\\.${g}`));
			// The written value is a `var` the loop built (ending in "Text"), never the raw global
			// itself concatenated directly - that would rely on an unverified array->string format.
			expect(MAINTENANCE_FLUSH_MACRO, g).toMatch(new RegExp(`global ${g} = " \\^ var\\.\\w+Text`));
			expect(MAINTENANCE_FLUSH_MACRO, g).not.toMatch(new RegExp(`global ${g} = " \\^ global\\.${g}\\b`));
		}
	});

	it("each v8 array gets its own uniquely-named loop-builder variable, so redeclaring one `var` twice never happens", () => {
		const varNames = [...MAINTENANCE_FLUSH_MACRO.matchAll(/var (\w+) = "\{"/g)].map((m) => m[1]);
		expect(varNames.length).toBe(4);
		expect(new Set(varNames).size).toBe(varNames.length); // all unique
	});

	// --- v10: the v8 axis/fan/heater loops are opt-in, each gated behind its OWN independent flag
	// (flMaintTrackAxes/flMaintTrackFans/flMaintTrackHeaters) - v9 briefly gated all three behind one
	// shared flMaintTrackDetail flag, which forced a user who only wanted (say) heater on-time to also
	// pay for axis/fan polling to get it.
	it("carries version 10", () => {
		expect(MAINTENANCE_MACRO_SET_VERSION).toBe(10);
	});

	it("seeds each of the three tracking flags to false behind its own exists-guard", () => {
		for (const g of ["flMaintTrackAxes", "flMaintTrackFans", "flMaintTrackHeaters"]) {
			expect(MAINTENANCE_DAEMON_MACRO, g).toMatch(new RegExp(`if !exists\\(global\\.${g}\\)\\r?\\n\\tglobal ${g} = false`));
		}
	});

	it("gates each of the three tracking blocks behind its OWN flag, not one shared flag", () => {
		const axisGuard = MAINTENANCE_DAEMON_MACRO.indexOf("if global.flMaintTrackAxes");
		const fanGuard = MAINTENANCE_DAEMON_MACRO.indexOf("if global.flMaintTrackFans");
		const heaterGuard = MAINTENANCE_DAEMON_MACRO.indexOf("if global.flMaintTrackHeaters");
		const axisCheck = MAINTENANCE_DAEMON_MACRO.indexOf(`if #move.axes <= ${MAINTENANCE_MAX_TRACKED_AXES}`);
		const fanCheck = MAINTENANCE_DAEMON_MACRO.indexOf(`if #fans <= ${MAINTENANCE_MAX_TRACKED_FANS}`);
		const heaterCheck = MAINTENANCE_DAEMON_MACRO.indexOf(`if #heat.heaters <= ${MAINTENANCE_MAX_TRACKED_HEATERS}`);
		for (const guard of [axisGuard, fanGuard, heaterGuard]) { expect(guard).toBeGreaterThan(-1); }
		// each check immediately follows ITS OWN guard, one line (one tab) below it - not some other
		// block's guard, and not still inside a now-removed outer shared guard.
		expect(axisCheck).toBeGreaterThan(axisGuard);
		expect(axisCheck).toBeLessThan(fanGuard);
		expect(fanCheck).toBeGreaterThan(fanGuard);
		expect(fanCheck).toBeLessThan(heaterGuard);
		expect(heaterCheck).toBeGreaterThan(heaterGuard);
		for (const check of [axisCheck, fanCheck, heaterCheck]) {
			expect(MAINTENANCE_DAEMON_MACRO.slice(check - 1, check)).toBe("\t");
		}
	});

	it("no longer has a single combined flMaintTrackDetail flag", () => {
		expect(MAINTENANCE_DAEMON_MACRO).not.toContain("flMaintTrackDetail");
		expect(MAINTENANCE_FLUSH_MACRO).not.toContain("flMaintTrackDetail");
	});

	it("the flush macro persists each of the three tracking flags via if-exists/else-set, alongside flMaintEnabled", () => {
		for (const g of ["flMaintTrackAxes", "flMaintTrackFans", "flMaintTrackHeaters"]) {
			expect(MAINTENANCE_FLUSH_MACRO, g).toContain(`if !exists(global.${g})`);
			expect(MAINTENANCE_FLUSH_MACRO, g).toContain(`global ${g} = " ^ global.${g}`);
			expect(MAINTENANCE_FLUSH_MACRO, g).toContain(`set global.${g} = " ^ global.${g}`);
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

	it("never emits an 'endif' line - RRF meta-gcode has no such keyword (same bug class as the flush macro)", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		expect(io.files.get(MAINTENANCE_STATE_PATH) ?? "").not.toMatch(/endif/i);
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

	it("defaults power-on time and filament-error count to 0 when extra is omitted", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintPowerOnSec = 0");
		expect(content).toContain("flMaintFilamentErrors = 0");
	});

	it("preserves already-accumulated power-on time and filament-error count when re-run with explicit extra values", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, { powerOnSeconds: 360000, filamentErrors: 3 });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintPowerOnSec = 360000");
		expect(content).toContain("flMaintFilamentErrors = 3");
	});

	it("defaults the job started/finished/cancelled counts to 0 when extra is omitted", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintJobsStarted = 0");
		expect(content).toContain("flMaintJobsFinished = 0");
		expect(content).toContain("flMaintJobsCancelled = 0");
	});

	it("preserves already-accumulated job counts when re-run with explicit extra values", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, { jobsStarted: 12, jobsFinished: 10, jobsCancelled: 2 });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintJobsStarted = 12");
		expect(content).toContain("flMaintJobsFinished = 10");
		expect(content).toContain("flMaintJobsCancelled = 2");
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

	it("defaults flMaintEnabled to true when the enabled param is omitted", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintEnabled = true");
	});

	it("writes flMaintEnabled = false when explicitly paused", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, {}, false);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintEnabled = false");
	});

	// --- v10: three independent tracking flags (each defaults OFF, unlike flMaintEnabled which
	// defaults ON) - see MaintenanceTrackingFlags's doc comment for why they're one object param.
	it("defaults all three tracking flags to false when the tracking param is omitted", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintTrackAxes = false");
		expect(content).toContain("flMaintTrackFans = false");
		expect(content).toContain("flMaintTrackHeaters = false");
	});

	it("writes only the explicitly-enabled tracking flags as true, leaving the rest false", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, {}, true, { fans: true });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintTrackAxes = false");
		expect(content).toContain("flMaintTrackFans = true");
		expect(content).toContain("flMaintTrackHeaters = false");
	});

	it("writes all three tracking flags as true when all are explicitly enabled", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, {}, true, { axes: true, fans: true, heaters: true });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain("flMaintTrackAxes = true");
		expect(content).toContain("flMaintTrackFans = true");
		expect(content).toContain("flMaintTrackHeaters = true");
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

	// --- v8 array counters ---------------------------------------------------------------------
	it("defaults the v8 arrays to all-zero literals of the fixed capacity when extra is omitted", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0);
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		const zeroAxis = `{${Array(MAINTENANCE_MAX_TRACKED_AXES).fill(0).join(",")}}`;
		const zeroFan = `{${Array(MAINTENANCE_MAX_TRACKED_FANS).fill(0).join(",")}}`;
		const zeroHeater = `{${Array(MAINTENANCE_MAX_TRACKED_HEATERS).fill(0).join(",")}}`;
		expect(content).toContain(`flMaintAxisMm = ${zeroAxis}`);
		expect(content).toContain(`flMaintFanSec = ${zeroFan}`);
		expect(content).toContain(`flMaintHeaterSec = ${zeroHeater}`);
		expect(content).toContain(`flMaintHeaterFullSec = ${zeroHeater}`);
	});

	it("preserves already-accumulated v8 array values when re-run with explicit extra values", async () => {
		const io = fakeIO();
		await seedMaintenanceState(io, 0, 0, { axisMm: [100, 200], fanSec: [10], heaterSec: [5, 6], heaterFullSec: [1, 2] });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		// Padded to the fixed capacity - a live array shorter than the tracking capacity (e.g. only 2
		// axes reported) must not shrink the persisted array, or the next poll's fixed-length indexing
		// in the daemon macro would go out of bounds.
		const expectAxis = `{100,200,${Array(MAINTENANCE_MAX_TRACKED_AXES - 2).fill(0).join(",")}}`;
		expect(content).toContain(`flMaintAxisMm = ${expectAxis}`);
		expect(content).toContain(`flMaintFanSec = {10,${Array(MAINTENANCE_MAX_TRACKED_FANS - 1).fill(0).join(",")}}`);
		expect(content).toContain(`flMaintHeaterSec = {5,6,${Array(MAINTENANCE_MAX_TRACKED_HEATERS - 2).fill(0).join(",")}}`);
		expect(content).toContain(`flMaintHeaterFullSec = {1,2,${Array(MAINTENANCE_MAX_TRACKED_HEATERS - 2).fill(0).join(",")}}`);
	});

	it("truncates a live array longer than the fixed tracking capacity rather than writing an oversized literal", async () => {
		const io = fakeIO();
		const tooLong = Array(MAINTENANCE_MAX_TRACKED_AXES + 5).fill(1);
		await seedMaintenanceState(io, 0, 0, { axisMm: tooLong });
		const content = io.files.get(MAINTENANCE_STATE_PATH) ?? "";
		expect(content).toContain(`flMaintAxisMm = {${Array(MAINTENANCE_MAX_TRACKED_AXES).fill(1).join(",")}}`);
	});
});
