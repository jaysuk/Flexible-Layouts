/**
 * Parsing for DWC's Explorer route, `/Explorer/:tab?/:volume?/:path(.*)?`, so the replacement Explorer
 * page (see `page/fallbacks/ExplorerFallback.vue`) honours the same deep links the stock page does -
 * DWC's own upload/download notifications, the macro list and the filament rows all navigate with
 * `Path.explorerRoute(dir)` / `Path.editRoute(file)` (DWC src/utils/path.ts).
 *
 * The URL packs up to four things into its segments, parsed front to back exactly as the stock page's
 * `resolveExplorerRoute` does: an optional `t<n>` tab ordinal (ignored here - the panel manages its own
 * tabs), an optional `edit` marker meaning "this path is a file to open", an optional numeric volume
 * index (dropped for volume 0), then the path itself.
 */

export interface ExplorerRouteParams {
	tab?: string;
	volume?: string;
	/** vue-router's `:path(.*)?` yields a string; a `[[...path]]` catch-all yields segments. */
	path?: string | Array<string>;
}

/** What the URL asks the Explorer to show: a directory to browse, or a file to open in an editor. */
export interface ExplorerTarget {
	kind: "directory" | "editor";
	/** Absolute SD path, e.g. `0:/macros` (directory) or `0:/config.g` (file). */
	path: string;
}

export function parseExplorerRoute(params: ExplorerRouteParams): ExplorerTarget {
	const segments: Array<string> = [];
	if (params.tab !== undefined) {
		segments.push(params.tab);
	}
	if (params.volume !== undefined) {
		segments.push(params.volume);
	}
	if (Array.isArray(params.path)) {
		segments.push(...params.path);
	} else if (params.path) {
		segments.push(...params.path.split("/"));
	}
	const cleaned = segments.filter((segment) => segment !== "");

	if (cleaned.length > 0 && /^t\d+$/.test(cleaned[0])) {
		cleaned.shift();
	}
	let editor = false;
	if (cleaned.length > 0 && cleaned[0] === "edit") {
		editor = true;
		cleaned.shift();
	}
	let volume = 0;
	if (cleaned.length > 0 && /^\d+$/.test(cleaned[0])) {
		volume = Number.parseInt(cleaned[0], 10);
		cleaned.shift();
	}
	const rest = cleaned.join("/");
	// Directories are "0:/" at the root (what FileList expects); an editor target is always a file
	// path, so a bare `edit` with nothing after it degrades to browsing the volume root.
	if (editor && rest) {
		return { kind: "editor", path: `${volume}:/${rest}` };
	}
	return { kind: "directory", path: rest ? `${volume}:/${rest}` : `${volume}:/` };
}
