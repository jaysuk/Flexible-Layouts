import { describe, expect, it } from "vitest";

import { computeDueStatus } from "../model/reminders/dueStatus";

describe("computeDueStatus", () => {
	it("is 'unknown' when the delta is null (no baseline logged yet)", () => {
		expect(computeDueStatus(null, 100)).toBe("unknown");
	});

	it("is 'unknown' when the interval isn't configured (<= 0), never a false overdue", () => {
		expect(computeDueStatus(500, 0)).toBe("unknown");
		expect(computeDueStatus(500, -10)).toBe("unknown");
	});

	it("is 'ok' well below the interval", () => {
		expect(computeDueStatus(10, 100)).toBe("ok");
	});

	it("is 'dueSoon' within the last 10% of the interval", () => {
		expect(computeDueStatus(90, 100)).toBe("dueSoon");
		expect(computeDueStatus(95, 100)).toBe("dueSoon");
	});

	it("is 'ok' just below the dueSoon threshold", () => {
		expect(computeDueStatus(89, 100)).toBe("ok");
	});

	it("is 'overdue' at or beyond the interval", () => {
		expect(computeDueStatus(100, 100)).toBe("overdue");
		expect(computeDueStatus(150, 100)).toBe("overdue");
	});
});
