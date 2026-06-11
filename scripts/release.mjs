#!/usr/bin/env node
/**
 * Cut a release: bump plugin.json + package.json, commit, and create the annotated version tag. The
 * tag push is what triggers the CI release build (see .github/workflows/release.yml + CONTRIBUTING.md).
 *
 *   node scripts/release.mjs 1.0.12          # bump + commit + tag (you push when ready)
 *   node scripts/release.mjs 1.0.12 --push   # …and push the commit + tag (triggers the release)
 *   npm run release -- 1.0.12 [--push]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const push = args.includes("--push");
const version = args.find((a) => !a.startsWith("-"));

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
	console.error("Usage: node scripts/release.mjs <version> [--push]   e.g. 1.0.12");
	process.exit(1);
}
const tag = `v${version}`;

function git(argv) {
	execFileSync("git", argv, { stdio: "inherit" });
}

// Refuse to release a dirty tree (other than the files we're about to bump).
const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
	.split("\n").map((l) => l.slice(3)).filter((f) => f && f !== "plugin.json" && f !== "package.json");
if (dirty.length) {
	console.error(`Working tree has uncommitted changes; commit or stash them first:\n  ${dirty.join("\n  ")}`);
	process.exit(1);
}

for (const file of ["plugin.json", "package.json"]) {
	const json = JSON.parse(readFileSync(file, "utf8"));
	json.version = version;
	writeFileSync(file, JSON.stringify(json, null, file === "plugin.json" ? "\t" : 2) + "\n");
}
console.log(`Bumped plugin.json + package.json -> ${version}`);

git(["add", "plugin.json", "package.json"]);
git(["commit", "-m", `chore(release): ${tag}`]);
git(["tag", "-a", tag, "-m", `FlexibleLayouts ${tag}`]);
console.log(`Committed and tagged ${tag}`);

if (push) {
	git(["push"]);
	git(["push", "origin", tag]);
	console.log("Pushed. CI will build the ZIP and draft the GitHub Release.");
} else {
	console.log(`\nReview, then push to trigger the release:\n  git push && git push origin ${tag}`);
}
