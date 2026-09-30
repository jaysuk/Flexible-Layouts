#!/usr/bin/env node
/**
 * Fails when a `<v-btn>` that shows only an icon has no accessible name (no `aria-label` / `title`, no text).
 * A screen reader announces such a button as just "button". See MISSING-FEATURES-PLAN.md §B8 step 2.
 *
 *   node scripts/check-icon-buttons.mjs            # scans src/**\/*.vue
 *   import { findUnnamedIconButtons } from ...     # used by test/a11y/iconButtons.test.ts
 *
 * Static and heuristic by design: it reads the template text, it does not compile it. A button whose name comes
 * from somewhere the script cannot see (a `v-bind` object, say) should get an explicit `aria-label` anyway.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Attribute names that give a button its accessible name. */
const NAMING_ATTRS = ["aria-label", ":aria-label", "v-bind:aria-label", "title", ":title", "v-bind:title", "aria-labelledby"];

/** Reads one start tag beginning at `start` (`<`), honouring quoted attribute values that may contain `>`. */
function readStartTag(src, start) {
	let quote = null;
	for (let i = start; i < src.length; i++) {
		const c = src[i];
		if (quote) { if (c === quote) { quote = null; } continue; }
		if (c === '"' || c === "'") { quote = c; continue; }
		if (c === ">") { return { text: src.slice(start, i + 1), end: i + 1 }; }
	}
	return null;
}

function attrNames(tag) {
	const names = new Set();
	// Strip quoted values first so their content is never mistaken for attribute names.
	const bare = tag.replace(/"[^"]*"|'[^']*'/g, '""');
	for (const m of bare.matchAll(/[\s]([:@#]?[A-Za-z][\w:.\-]*)/g)) { names.add(m[1]); }
	return names;
}

/** The text between a start tag and its matching `</v-btn>` (buttons do not nest). */
function innerContent(src, end) {
	const close = src.indexOf("</v-btn>", end);
	return close === -1 ? "" : src.slice(end, close);
}

/** True when the inner markup has visible text or an interpolation once icons are removed. */
function hasVisibleText(inner) {
	const noIcons = inner.replace(/<v-icon\b[^>]*>[\s\S]*?<\/v-icon>/g, "").replace(/<v-icon\b[^>]*\/>/g, "");
	const noTags = noIcons.replace(/<[^>]+>/g, "");
	return /\S/.test(noTags);
}

/** @returns {{ line: number, tag: string }[]} */
export function findUnnamedIconButtons(source) {
	const template = source.includes("<template") ? source : `<template>${source}</template>`;
	const out = [];
	const re = /<v-btn(?=[\s>/])/g;
	let m;
	while ((m = re.exec(template))) {
		const tag = readStartTag(template, m.index);
		if (!tag) { continue; }
		const names = attrNames(tag.text);
		const iconOnly = names.has("icon") || names.has(":icon");
		if (!iconOnly) { continue; }
		if (NAMING_ATTRS.some((a) => names.has(a))) { continue; }
		const selfClosing = /\/>$/.test(tag.text);
		if (!selfClosing && hasVisibleText(innerContent(template, tag.end))) { continue; }
		const line = template.slice(0, m.index).split("\n").length;
		out.push({ line, tag: tag.text.replace(/\s+/g, " ").slice(0, 140) });
	}
	return out;
}

function* vueFiles(dir) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") { yield* vueFiles(p); } }
		else if (name.endsWith(".vue")) { yield p; }
	}
}

export function scanDirectory(dir) {
	const found = [];
	for (const file of vueFiles(dir)) {
		for (const hit of findUnnamedIconButtons(readFileSync(file, "utf8"))) { found.push({ file, ...hit }); }
	}
	return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = fileURLToPath(new URL("../src", import.meta.url));
	const found = scanDirectory(root);
	for (const f of found) { console.error(`${relative(process.cwd(), f.file)}:${f.line}  ${f.tag}`); }
	if (found.length) {
		console.error(`\n${found.length} icon-only <v-btn> without an accessible name - add :aria-label (and :title for a tooltip).`);
		process.exit(1);
	}
	console.log("check-icon-buttons: ok");
}
