import { describe, expect, it } from "vitest";

import { isBackupOverdue, isUnseenMachine } from "../model/configBackup/autoBackupNudges";

describe("isBackupOverdue", () => {
	const now = new Date("2026-01-08T00:00:00.000Z").getTime();

	it("is overdue when there has never been a backup", () => {
		expect(isBackupOverdue(null, 7, now)).toBe(true);
	});
	it("is not overdue when the last backup is within the threshold", () => {
		expect(isBackupOverdue("2026-01-05T00:00:00.000Z", 7, now)).toBe(false);
	});
	it("is overdue once the threshold has elapsed", () => {
		expect(isBackupOverdue("2026-01-01T00:00:00.000Z", 7, now)).toBe(true);
	});
	it("is exactly at the boundary when the age equals the threshold", () => {
		expect(isBackupOverdue("2026-01-01T00:00:00.000Z", 7, now)).toBe(true);
	});
});

describe("isUnseenMachine", () => {
	it("is never unseen when nothing has ever been backed up (covered by the overdue nudge instead)", () => {
		expect(isUnseenMachine("machine-a", new Set())).toBe(false);
	});
	it("is unseen when other machines have backups but this one doesn't", () => {
		expect(isUnseenMachine("machine-a", new Set(["machine-b", "machine-c"]))).toBe(true);
	});
	it("is not unseen once this machine has a backup on record", () => {
		expect(isUnseenMachine("machine-a", new Set(["machine-a", "machine-b"]))).toBe(false);
	});
});
