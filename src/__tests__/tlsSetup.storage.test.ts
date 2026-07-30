import { beforeEach, describe, expect, it } from "vitest";

import {
	getCertExpiryDate, getCertReminderSettings, resetForTests, setCertExpiryDate, setCertReminderSettings,
} from "../model/tlsSetup/storage";

beforeEach(() => {
	resetForTests();
});

describe("cert expiry date", () => {
	it("defaults to null", () => {
		expect(getCertExpiryDate()).toBeNull();
	});
	it("persists an ISO timestamp", () => {
		setCertExpiryDate("2036-01-01T00:00:00.000Z");
		expect(getCertExpiryDate()).toBe("2036-01-01T00:00:00.000Z");
	});
});

describe("cert reminder settings", () => {
	it("defaults to enabled with a 30-day warning", () => {
		expect(getCertReminderSettings()).toEqual({ enabled: true, warningDays: 30 });
	});
	it("persists a custom configuration", () => {
		setCertReminderSettings({ enabled: false, warningDays: 14 });
		expect(getCertReminderSettings()).toEqual({ enabled: false, warningDays: 14 });
	});
});
