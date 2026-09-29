import { describe, expect, it } from "vitest";

import { explorerUrl, parseExplorerRoute, sameExplorerTarget, type ExplorerTarget } from "../model/explorerRoute";

// Mirrors DWC's own resolveExplorerRoute (src/pages/Explorer/...) and the URLs its
// Path.explorerRoute()/Path.editRoute() produce, so the replacement page honours the same deep links.
describe("parseExplorerRoute", () => {
	it("bare /Explorer browses the root of volume 0", () => {
		expect(parseExplorerRoute({})).toEqual({ kind: "directory", path: "0:/" });
	});

	it("a plain path browses that directory on volume 0 (volume is dropped from the URL)", () => {
		// /Explorer/macros/print  ->  tab=macros, volume=print (the router hands segments positionally)
		expect(parseExplorerRoute({ tab: "macros", volume: "print" })).toEqual({ kind: "directory", path: "0:/macros/print" });
		expect(parseExplorerRoute({ tab: "sys" })).toEqual({ kind: "directory", path: "0:/sys" });
	});

	it("a numeric leading segment is the volume", () => {
		expect(parseExplorerRoute({ tab: "1", volume: "gcodes" })).toEqual({ kind: "directory", path: "1:/gcodes" });
		expect(parseExplorerRoute({ tab: "1" })).toEqual({ kind: "directory", path: "1:/" });
	});

	it("`edit` marks a file to open, with or without a volume", () => {
		expect(parseExplorerRoute({ tab: "edit", volume: "sys", path: "config.g" })).toEqual({ kind: "editor", path: "0:/sys/config.g" });
		expect(parseExplorerRoute({ tab: "edit", volume: "1", path: "gcodes/a.gcode" })).toEqual({ kind: "editor", path: "1:/gcodes/a.gcode" });
	});

	it("accepts a catch-all path as segments as well as a string", () => {
		expect(parseExplorerRoute({ tab: "edit", volume: "macros", path: ["sub", "x.g"] })).toEqual({ kind: "editor", path: "0:/macros/sub/x.g" });
	});

	it("ignores a t<n> tab ordinal", () => {
		expect(parseExplorerRoute({ tab: "t2", volume: "edit", path: "sys/config.g" })).toEqual({ kind: "editor", path: "0:/sys/config.g" });
		expect(parseExplorerRoute({ tab: "t3", volume: "macros" })).toEqual({ kind: "directory", path: "0:/macros" });
	});

	it("a bare `edit` with no file degrades to browsing the volume root", () => {
		expect(parseExplorerRoute({ tab: "edit" })).toEqual({ kind: "directory", path: "0:/" });
	});
});

describe("explorerUrl", () => {
	// The URLs DWC's own Path.explorerRoute()/Path.editRoute() build - a link made here and one made there
	// have to be the same link.
	it("matches DWC's URLs for the cases it documents", () => {
		expect(explorerUrl({ kind: "directory", path: "0:/" })).toBe("/Explorer");
		expect(explorerUrl({ kind: "directory", path: "0:/macros" })).toBe("/Explorer/macros");
		expect(explorerUrl({ kind: "editor", path: "0:/macros/foo.g" })).toBe("/Explorer/edit/macros/foo.g");
		expect(explorerUrl({ kind: "directory", path: "1:/" })).toBe("/Explorer/1");
		expect(explorerUrl({ kind: "editor", path: "1:/config.g" })).toBe("/Explorer/edit/1/config.g");
		// a folder actually named "0" would read back as the volume, so volume 0 is spelled out
		expect(explorerUrl({ kind: "directory", path: "0:/0/sub" })).toBe("/Explorer/0/0/sub");
	});

	it("is read back as the same target by parseExplorerRoute", () => {
		const targets: Array<ExplorerTarget> = [
			{ kind: "directory", path: "0:/" }, { kind: "directory", path: "0:/sys" }, { kind: "editor", path: "0:/sys/config.g" },
			{ kind: "directory", path: "1:/" }, { kind: "editor", path: "1:/a/b.g" }, { kind: "directory", path: "0:/0/sub" },
			{ kind: "editor", path: "0:/12/x.g" },
		];
		for (const target of targets) {
			const segments = explorerUrl(target).split("/").slice(2); // drop "" and "Explorer"
			const [tab, volume, ...path] = segments;
			expect(parseExplorerRoute({ tab, volume, path }), explorerUrl(target)).toEqual(target);
		}
	});
});

describe("sameExplorerTarget", () => {
	it("compares kind and path, ignoring a trailing slash", () => {
		expect(sameExplorerTarget({ kind: "directory", path: "0:/sys/" }, { kind: "directory", path: "0:/sys" })).toBe(true);
		expect(sameExplorerTarget({ kind: "directory", path: "0:/sys" }, { kind: "editor", path: "0:/sys" })).toBe(false);
		expect(sameExplorerTarget({ kind: "directory", path: "0:/sys" }, { kind: "directory", path: "0:/macros" })).toBe(false);
	});
});
