/**
 * Which of a page's candidate route patterns DWC actually has a record for.
 *
 * `registerLayout`'s `routes` (and `addLayoutRoutes`) key overrides by the route record's canonical
 * `path`, and vue-router spells a catch-all differently across versions: DWC's Explorer record is
 * `/Explorer/:tab?/:volume?/:path*` on 3.7.0-rc.2 while its generated types still show
 * `/Explorer/:tab?/:volume?/:path(.*)?`. A pattern with no record is skipped by DWC with a console.warn
 * and the override silently doesn't exist - so list every spelling a build might use and install only the
 * ones that resolve.
 *
 * Resolved through `window.DWC.getPageComponent` (undefined for a path with no record) rather than an
 * import, so a DWC without it just gets every candidate, as before.
 */
export function existingRoutePaths(candidates: ReadonlyArray<string>): Array<string> {
	const dwc = (globalThis as { DWC?: { getPageComponent?: (path: string) => unknown } }).DWC;
	const probe = dwc?.getPageComponent;
	if (typeof probe !== "function") return [...candidates];
	const found = candidates.filter((path) => probe(path) !== undefined);
	return found.length > 0 ? found : [...candidates]; // none resolved: let DWC report it, as it always has
}
