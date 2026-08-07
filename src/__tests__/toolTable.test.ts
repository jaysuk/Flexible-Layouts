import { describe, expect, it } from "vitest";

import { deleteToolEntry, getToolEntry, getToolTable, setToolTable, upsertToolEntry } from "../model/toolTable";

describe("toolTable", () => {
	it("is empty until something is stored", () => {
		expect(getToolTable()).toEqual([]);
		expect(getToolEntry(1)).toBeUndefined();
	});

	it("upserts a new entry and keeps the table sorted by tool number", () => {
		upsertToolEntry({ number: 2, name: "Ball nose", type: "ballnose", diameter: 3 });
		upsertToolEntry({ number: 0, name: "Facing", type: "surfacing", diameter: 50 });
		expect(getToolTable().map((t) => t.number)).toEqual([0, 2]);
	});

	it("replaces an existing entry in place rather than duplicating it", () => {
		upsertToolEntry({ number: 1, name: "Endmill", diameter: 6 });
		upsertToolEntry({ number: 1, name: "Endmill", diameter: 6.35 });
		const table = getToolTable();
		expect(table).toHaveLength(1);
		expect(table[0].diameter).toBe(6.35);
	});

	it("deletes by tool number", () => {
		setToolTable([{ number: 1 }, { number: 2 }]);
		deleteToolEntry(1);
		expect(getToolTable().map((t) => t.number)).toEqual([2]);
	});
});
