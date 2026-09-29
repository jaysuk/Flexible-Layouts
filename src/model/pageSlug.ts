/**
 * Readable ids for custom pages.
 *
 * A custom page's id IS its route path (`/Plugins/FlexibleLayouts/p/<id>`), and it is also the key everything
 * else hangs off: `document.pages`, `nav.order`, `nav.hidden`, `startupPath`, `jobStartPath`, and the ids DWC
 * derives for a built-in panel's saved settings (`<route path>::<panel>`). Pages used to get a random UUID, which
 * is what showed in the address bar. New pages now get a slug of their title (`/p/my-dashboard`), and
 * `migrateOpaquePageIds` gives the same treatment to a document that still holds UUID-named pages.
 *
 * The id is fixed when the page is created: renaming the page later does not change its URL, so a bookmark or a
 * link keeps working. (Re-keying on every rename would mean rewriting every reference above each time.)
 *
 * Pure - no DWC imports - so the converters that build documents outside the app (BtnCmd import) can share it.
 */
import type { LayoutDocument, PageLayout } from "./document";

/** All custom-page route paths share this prefix. */
export const CUSTOM_PAGE_PREFIX = "/Plugins/FlexibleLayouts/p/";

const MAX_SLUG_LENGTH = 48;
const FALLBACK_SLUG = "page";

/** `My Dashboard!` -> `my-dashboard`. Letters and digits only, so the result is always a safe route segment. */
export function slugify(title: string): string {
	const slug = title
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // é -> e
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/g, "");
	return slug || FALLBACK_SLUG;
}

/** A route path for a new page titled `title` that is not any of `taken` (full paths): `-2`, `-3`... on a clash. */
export function uniqueCustomPagePath(title: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	const base = slugify(title);
	let path = CUSTOM_PAGE_PREFIX + base;
	for (let n = 2; used.has(path); n++) {
		path = `${CUSTOM_PAGE_PREFIX}${base}-${n}`;
	}
	return path;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// `newItemId()`'s fallback where `crypto.randomUUID` is missing (an insecure-context browser).
const FALLBACK_ID = /^flx-[0-9a-z]+-[0-9a-z]+$/;

/** Whether a custom page's id is one of the generated ones (as opposed to a readable slug). */
export function isOpaquePageId(path: string): boolean {
	if (!path.startsWith(CUSTOM_PAGE_PREFIX)) return false;
	const id = path.slice(CUSTOM_PAGE_PREFIX.length);
	return UUID.test(id) || FALLBACK_ID.test(id);
}

/**
 * Give every custom page that still has a generated id a readable one, in place. Everything that referred to the
 * old path is rewritten (`nav.order`, `nav.hidden`, `startupPath`, `jobStartPath`) and the page remembers the old
 * path in `legacyPaths`, so a bookmark to it can be sent on to the new address.
 *
 * Deterministic for a given document (pages are taken in document order), so two browsers that load the same
 * layout from the card agree on every new id. Idempotent: a document with nothing to change is left alone.
 *
 * @returns old path -> new path, for whatever lives outside the document (saved panel settings)
 */
export function migrateOpaquePageIds(doc: LayoutDocument): Map<string, string> {
	const moved = new Map<string, string>();
	const entries = Object.entries(doc.pages);
	if (!entries.some(([path, page]) => page.kind === "custom" && isOpaquePageId(path))) return moved;

	const taken = new Set(entries.filter(([path]) => !isOpaquePageId(path)).map(([path]) => path));
	const renamed: Array<[string, PageLayout]> = entries.map(([path, page]) => {
		if (page.kind !== "custom" || !isOpaquePageId(path)) return [path, page];
		const next = uniqueCustomPagePath(page.title ?? "", taken);
		taken.add(next);
		if (next === path) return [path, page]; // a title that slugs to something UUID-shaped: nothing to do
		moved.set(path, next);
		page.legacyPaths = [...new Set([...(page.legacyPaths ?? []), path])];
		return [next, page];
	});

	// Same object, same order: the document is reactive and other code holds `doc.pages`.
	for (const key of Object.keys(doc.pages)) delete doc.pages[key];
	for (const [path, page] of renamed) doc.pages[path] = page;

	const remap = (path: string): string => moved.get(path) ?? path;
	doc.nav.order = doc.nav.order.map(remap);
	doc.nav.hidden = doc.nav.hidden.map(remap);
	if (doc.startupPath) doc.startupPath = remap(doc.startupPath);
	if (doc.jobStartPath) doc.jobStartPath = remap(doc.jobStartPath);
	return moved;
}

/** The page a path belongs to - itself, or the page that used to live there - or null when it is neither. */
export function resolveCustomPagePath(doc: LayoutDocument, path: string): string | null {
	if (doc.pages[path]) return path;
	for (const [key, page] of Object.entries(doc.pages)) {
		if (page.legacyPaths?.includes(path)) return key;
	}
	return null;
}
