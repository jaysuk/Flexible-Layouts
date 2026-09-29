import { describe, expect, it } from "vitest";

import { createEmptyDocument, createEmptyPage, type LayoutDocument } from "../model/document";
import {
	CUSTOM_PAGE_PREFIX, isOpaquePageId, migrateOpaquePageIds, resolveCustomPagePath, slugify, uniqueCustomPagePath,
} from "../model/pageSlug";

const P = CUSTOM_PAGE_PREFIX;
const UUID_A = "3f2b8c1e-9a4d-4e6b-8f10-2c7d5a9e1b34";
const UUID_B = "a1b2c3d4-0000-4000-8000-123456789abc";
const UUID_C = "deadbeef-1111-4222-8333-444455556666";

function docWith(pages: Record<string, { title?: string; kind?: "custom" | "override" }>): LayoutDocument {
	const doc = createEmptyDocument();
	for (const [path, p] of Object.entries(pages)) {
		doc.pages[path] = { ...createEmptyPage(p.kind ?? "custom"), title: p.title };
	}
	return doc;
}

describe("slugify", () => {
	it("makes a lower-case, dash-separated route segment", () => {
		expect(slugify("My Dashboard")).toBe("my-dashboard");
		expect(slugify("  Bed  &  Nozzle -- Heat!! ")).toBe("bed-nozzle-heat");
		expect(slugify("Café Ünïcode")).toBe("cafe-unicode");
	});

	it("falls back to 'page' when nothing usable is left", () => {
		expect(slugify("")).toBe("page");
		expect(slugify("!!!")).toBe("page");
		expect(slugify("日本語")).toBe("page");
	});

	it("is capped, and never ends on a dash where the cap cut it", () => {
		const slug = slugify("word ".repeat(40));
		expect(slug.length).toBeLessThanOrEqual(48);
		expect(slug.endsWith("-")).toBe(false);
	});
});

describe("uniqueCustomPagePath", () => {
	it("is the slug under the custom-page prefix", () => {
		expect(uniqueCustomPagePath("My Dashboard", [])).toBe(`${P}my-dashboard`);
	});

	it("numbers a clash, counting up past the ones already taken", () => {
		expect(uniqueCustomPagePath("Home", [`${P}home`])).toBe(`${P}home-2`);
		expect(uniqueCustomPagePath("Home", [`${P}home`, `${P}home-2`, `${P}home-3`])).toBe(`${P}home-4`);
	});

	it("only clashes on the whole path, not on a prefix of it", () => {
		expect(uniqueCustomPagePath("Home", [`${P}home-page`, "/Home"])).toBe(`${P}home`);
	});
});

describe("isOpaquePageId", () => {
	it("recognises the generated ids, and only those", () => {
		expect(isOpaquePageId(P + UUID_A)).toBe(true);
		expect(isOpaquePageId(P + "flx-lq3x9k2-a7b3c1")).toBe(true); // newItemId()'s no-crypto fallback
		expect(isOpaquePageId(P + "my-dashboard")).toBe(false);
		expect(isOpaquePageId(P + "home-2")).toBe(false);
		expect(isOpaquePageId("/Console")).toBe(false);
		expect(isOpaquePageId("/Plugins/Other/p/" + UUID_A)).toBe(false);
	});
});

describe("migrateOpaquePageIds", () => {
	it("re-keys a page by its title, remembering where it was", () => {
		const doc = docWith({ [P + UUID_A]: { title: "Print Farm" } });
		const moved = migrateOpaquePageIds(doc);
		expect([...moved]).toEqual([[P + UUID_A, `${P}print-farm`]]);
		expect(Object.keys(doc.pages)).toEqual([`${P}print-farm`]);
		expect(doc.pages[`${P}print-farm`].legacyPaths).toEqual([P + UUID_A]);
	});

	it("rewrites everything that pointed at the old path", () => {
		const doc = docWith({ [P + UUID_A]: { title: "One" }, [P + UUID_B]: { title: "Two" } });
		doc.nav.order = [P + UUID_B, "/Console", P + UUID_A];
		doc.nav.hidden = [P + UUID_A];
		doc.startupPath = P + UUID_B;
		doc.jobStartPath = P + UUID_A;
		migrateOpaquePageIds(doc);
		expect(doc.nav.order).toEqual([`${P}two`, "/Console", `${P}one`]);
		expect(doc.nav.hidden).toEqual([`${P}one`]);
		expect(doc.startupPath).toBe(`${P}two`);
		expect(doc.jobStartPath).toBe(`${P}one`);
	});

	it("keeps the pages in the order they were in, and touches nothing that is not a generated custom id", () => {
		const doc = docWith({
			"/Console": { kind: "override" },
			[P + UUID_A]: { title: "Zebra" },
			[`${P}already-nice`]: { title: "Already Nice" },
			[P + UUID_B]: { title: "Aardvark" },
		});
		const console_ = doc.pages["/Console"];
		migrateOpaquePageIds(doc);
		expect(Object.keys(doc.pages)).toEqual(["/Console", `${P}zebra`, `${P}already-nice`, `${P}aardvark`]);
		expect(doc.pages["/Console"]).toBe(console_);
		expect(doc.pages[`${P}already-nice`].legacyPaths).toBeUndefined();
	});

	it("gives two pages with the same title different addresses, and avoids one that already exists", () => {
		const doc = docWith({
			[`${P}home`]: { title: "Home" },
			[P + UUID_A]: { title: "Home" },
			[P + UUID_B]: { title: "Home" },
		});
		migrateOpaquePageIds(doc);
		expect(Object.keys(doc.pages)).toEqual([`${P}home`, `${P}home-2`, `${P}home-3`]);
	});

	it("is a no-op the second time, and for a document with nothing to change", () => {
		const doc = docWith({ [P + UUID_A]: { title: "One" } });
		migrateOpaquePageIds(doc);
		const after = JSON.stringify(doc);
		expect(migrateOpaquePageIds(doc).size).toBe(0);
		expect(JSON.stringify(doc)).toBe(after);
	});

	it("names pages without a title 'page', 'page-2'...", () => {
		const doc = docWith({ [P + UUID_A]: {}, [P + UUID_B]: {} });
		migrateOpaquePageIds(doc);
		expect(Object.keys(doc.pages)).toEqual([`${P}page`, `${P}page-2`]);
	});

	it("gives every browser that loads the same layout the same ids", () => {
		const make = () => docWith({ [P + UUID_A]: { title: "Same" }, [P + UUID_B]: { title: "Same" }, [P + UUID_C]: { title: "Other" } });
		const a = make();
		const b = make();
		migrateOpaquePageIds(a);
		migrateOpaquePageIds(b);
		expect(Object.keys(a.pages)).toEqual(Object.keys(b.pages));
	});

	it("keeps earlier legacy paths when a page has already moved once", () => {
		const doc = docWith({ [P + UUID_A]: { title: "One" } });
		doc.pages[P + UUID_A].legacyPaths = [P + UUID_C];
		migrateOpaquePageIds(doc);
		expect(doc.pages[`${P}one`].legacyPaths).toEqual([P + UUID_C, P + UUID_A]);
	});
});

describe("resolveCustomPagePath", () => {
	it("finds a page by its address, or by one it used to have", () => {
		const doc = docWith({ [P + UUID_A]: { title: "One" } });
		migrateOpaquePageIds(doc);
		expect(resolveCustomPagePath(doc, `${P}one`)).toBe(`${P}one`);
		expect(resolveCustomPagePath(doc, P + UUID_A)).toBe(`${P}one`);
		expect(resolveCustomPagePath(doc, P + UUID_B)).toBeNull();
	});
});
