import { describe, expect, it } from "vitest";

import {
	configGHasEventLogging, configGHasMaintenanceRestore, daemonGHasMaintenanceHook,
	patchConfigGForEventLogging, patchConfigGForMaintenance, patchDaemonGForMaintenance,
} from "../model/maintenance/configPatch";
import { MAINTENANCE_DAEMON_FILE, MAINTENANCE_MACRO_FOLDER, MAINTENANCE_STATE_PATH } from "../model/maintenance/macros";

describe("patchConfigGForMaintenance", () => {
	it("appends the restore call when config.g doesn't have it", () => {
		const result = patchConfigGForMaintenance("M111 S0\nM552 S1\n");
		expect(result.changed).toBe(true);
		expect(result.text).toBe(`M111 S0\nM552 S1\nM98 P"${MAINTENANCE_STATE_PATH}"\n`);
	});

	it("is a no-op when config.g already restores the state", () => {
		const original = `M111 S0\nM98 P"${MAINTENANCE_STATE_PATH}"\n`;
		const result = patchConfigGForMaintenance(original);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});

	it("configGHasMaintenanceRestore ignores a mention only in a comment", () => {
		expect(configGHasMaintenanceRestore(`M111 S0 ; see ${MAINTENANCE_STATE_PATH}\n`)).toBe(false);
	});
});

describe("patchDaemonGForMaintenance", () => {
	it("creates a minimal one-line daemon.g when none exists (null, distinct from empty string)", () => {
		const result = patchDaemonGForMaintenance(null);
		expect(result.changed).toBe(true);
		expect(result.text).toBe(`M98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}"\n`);
	});

	it("appends the hook to an existing daemon.g without touching its content", () => {
		const result = patchDaemonGForMaintenance("; my own daemon.g\nG4 S1\n");
		expect(result.changed).toBe(true);
		expect(result.text).toBe(`; my own daemon.g\nG4 S1\nM98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}"\n`);
	});

	it("is a no-op when daemon.g already calls the maintenance macro", () => {
		const original = `; my own daemon.g\nM98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}"\n`;
		const result = patchDaemonGForMaintenance(original);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});

	it("an EMPTY existing daemon.g (real file, zero bytes) is appended to, not treated as missing", () => {
		const result = patchDaemonGForMaintenance("");
		expect(result.changed).toBe(true);
		expect(result.text).toBe(`M98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}"\n`);
	});

	it("daemonGHasMaintenanceHook ignores a mention only in a comment", () => {
		expect(daemonGHasMaintenanceHook(`G4 S1 ; see ${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}\n`)).toBe(false);
	});
});

describe("configGHasEventLogging / patchConfigGForEventLogging", () => {
	it("detects an existing M929 S1 line", () => {
		expect(configGHasEventLogging('M929 P"eventlog.txt" S1\n')).toBe(true);
	});

	it("does not count M929 S0 (explicitly disabled) as enabled", () => {
		expect(configGHasEventLogging("M929 S0\n")).toBe(false);
	});

	it("does not count a mention only in a comment", () => {
		expect(configGHasEventLogging("M111 S0 ; see M929\n")).toBe(false);
	});

	it("appends an M929 S1 line when none exists", () => {
		const result = patchConfigGForEventLogging("M111 S0\n");
		expect(result.changed).toBe(true);
		expect(result.text).toContain('M929 P"eventlog.txt" S1');
	});

	it("is a no-op when logging is already enabled", () => {
		const original = 'M929 P"eventlog.txt" S1\n';
		const result = patchConfigGForEventLogging(original);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(original);
	});
});
