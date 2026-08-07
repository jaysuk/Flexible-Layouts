#!/usr/bin/env node
/**
 * Build the G-code parser Web Worker as a standalone script under dwc/js/, where
 * build-plugin-pkg.js's dwc/ copy step picks it up for every ZIP/release build. Wired in as this
 * package's "preverify-build" script, so `npm run verify-build` runs it automatically. See
 * src/model/gcode/parseWorker.ts's doc comment for why this can't be a normal Vite-bundled chunk of
 * the main (IIFE-format) plugin entry.
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(root, "src", "model", "gcode", "parseWorker.ts");
const outfile = join(root, "dwc", "js", "flexible-layouts-gcode-parse.worker.js");

mkdirSync(dirname(outfile), { recursive: true });

await build({
	entryPoints: [entry],
	outfile,
	bundle: true,
	format: "iife",
	target: "es2020",
	minify: true,
	sourcemap: false,
});

console.log(`Built G-code parser worker: ${outfile}`);
