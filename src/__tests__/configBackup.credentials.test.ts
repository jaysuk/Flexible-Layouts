import { beforeEach, describe, expect, it } from "vitest";

import {
	addBackedUpMachineKey, getAutoBackupNudgeSettings, getBackedUpMachineKeys, getDuetCloudFifoLimit,
	getLastBackupAt, getRedactPreference, hasAcknowledgedUnredacted, resetForTests, setAcknowledgedUnredacted,
	setAutoBackupNudgeSettings, setDuetCloudFifoLimit, setLastBackupAt, setRedactPreference,
} from "../model/configBackup/credentials";

beforeEach(() => {
	resetForTests();
});

describe("per-destination redact preference", () => {
	it("defaults to off for every destination", () => {
		expect(getRedactPreference("local")).toBe(false);
		expect(getRedactPreference("duet")).toBe(false);
	});

	it("remembers a per-destination choice independently", () => {
		setRedactPreference("duet", true);
		expect(getRedactPreference("duet")).toBe(true);
		expect(getRedactPreference("local")).toBe(false);
	});
});

describe("unredacted-destination acknowledgement", () => {
	it("defaults to not acknowledged", () => {
		expect(hasAcknowledgedUnredacted("github")).toBe(false);
	});
	it("remembers acknowledgement per destination", () => {
		setAcknowledgedUnredacted("github");
		expect(hasAcknowledgedUnredacted("github")).toBe(true);
		expect(hasAcknowledgedUnredacted("drive")).toBe(false);
	});
});

describe("Duet cloud FIFO limit", () => {
	it("defaults to 5", () => {
		expect(getDuetCloudFifoLimit()).toBe(5);
	});
	it("persists a custom limit", () => {
		setDuetCloudFifoLimit(10);
		expect(getDuetCloudFifoLimit()).toBe(10);
	});
});

describe("last backup timestamp", () => {
	it("defaults to null", () => {
		expect(getLastBackupAt()).toBeNull();
	});
	it("persists an ISO timestamp", () => {
		setLastBackupAt("2026-01-01T00:00:00.000Z");
		expect(getLastBackupAt()).toBe("2026-01-01T00:00:00.000Z");
	});
});

describe("backed-up machine keys", () => {
	it("defaults to empty", () => {
		expect(getBackedUpMachineKeys()).toEqual([]);
	});
	it("accumulates distinct keys without duplicates", () => {
		addBackedUpMachineKey("machine-a");
		addBackedUpMachineKey("machine-b");
		addBackedUpMachineKey("machine-a");
		expect(getBackedUpMachineKeys().sort()).toEqual(["machine-a", "machine-b"]);
	});
});

describe("automatic backup nudge settings", () => {
	it("defaults to all triggers on with a 7-day overdue threshold", () => {
		expect(getAutoBackupNudgeSettings()).toEqual({ configSaved: true, overdue: true, overdueDays: 7, newMachine: true });
	});
	it("persists a custom configuration", () => {
		setAutoBackupNudgeSettings({ configSaved: false, overdue: true, overdueDays: 14, newMachine: false });
		expect(getAutoBackupNudgeSettings()).toEqual({ configSaved: false, overdue: true, overdueDays: 14, newMachine: false });
	});
});
