import { describe, expect, it } from "vitest";

import { createEmptyDocument, type LayoutDocument } from "../model/document";
import { layoutHasContent, makeBackup, parseBackup } from "../model/sdBackup";

function withPage(): LayoutDocument {
	const doc = createEmptyDocument();
	doc.pages["/Dashboard"] = { kind: "override", grid: { cols: 12, rowHeight: 30 }, items: [
		{ i: "a", x: 0, y: 0, w: 2, h: 2, widget: { type: "builtinPanel", component: "MovementPanel" } },
	] };
	return doc;
}

describe("layoutHasContent", () => {
	it("is false for a single pristine/empty profile", () => {
		expect(layoutHasContent({ default: createEmptyDocument() })).toBe(false);
		expect(layoutHasContent({})).toBe(false);
	});

	it("is true when a profile has a page with widgets", () => {
		expect(layoutHasContent({ default: withPage() })).toBe(true);
	});

	it("is true when there is more than one profile (deliberate setup)", () => {
		expect(layoutHasContent({ a: createEmptyDocument(), b: createEmptyDocument() })).toBe(true);
	});

	it("counts header widgets, theme and startup page as content", () => {
		const header = createEmptyDocument();
		header.header = { items: [{ i: "h", x: 0, y: 0, w: 1, h: 1, widget: { type: "label", variant: "text", content: "x" } }] };
		expect(layoutHasContent({ default: header })).toBe(true);

		const theme = createEmptyDocument();
		theme.theme.enabled = true;
		expect(layoutHasContent({ default: theme })).toBe(true);

		const startup = createEmptyDocument();
		startup.startupPath = "/Console";
		expect(layoutHasContent({ default: startup })).toBe(true);
	});
});

describe("makeBackup / parseBackup", () => {
	it("round-trips a backup", () => {
		const profiles = { default: withPage() };
		const file = JSON.stringify(makeBackup(profiles, "default", 1234));
		const parsed = parseBackup(file);
		expect(parsed).not.toBeNull();
		expect(parsed!.savedAt).toBe(1234);
		expect(parsed!.activeProfile).toBe("default");
		expect(Object.keys(parsed!.profiles)).toEqual(["default"]);
	});

	it("rejects non-backup / malformed JSON", () => {
		expect(parseBackup("not json")).toBeNull();
		expect(parseBackup(JSON.stringify({ kind: "something-else", profiles: {} }))).toBeNull();
		expect(parseBackup(JSON.stringify({ kind: "flexible-layouts-backup", profiles: {} }))).toBeNull();
	});

	it("falls back to the first profile when activeProfile is invalid", () => {
		const file = JSON.stringify({ kind: "flexible-layouts-backup", schemaVersion: 1, savedAt: 1, activeProfile: "ghost", profiles: { only: createEmptyDocument() } });
		expect(parseBackup(file)!.activeProfile).toBe("only");
	});
});
