import { describe, expect, it } from "vitest";
import { join } from "node:path";

// @ts-expect-error - plain .mjs script, no type declarations
import { findUnnamedIconButtons, scanDirectory } from "../../scripts/check-icon-buttons.mjs";

const find = (tpl: string) => findUnnamedIconButtons(`<template>${tpl}</template>`) as Array<{ line: number; tag: string }>;

describe("check-icon-buttons: flags an icon-only v-btn without an accessible name", () => {
	it("flags icon= with no name", () => {
		expect(find(`<v-btn icon="mdi-close" @click="x" />`)).toHaveLength(1);
		expect(find(`<v-btn :icon="dyn" @click="x" />`)).toHaveLength(1);
	});
	it("flags a bare `icon` whose only content is a v-icon", () => {
		expect(find(`<v-btn icon @click="x"><v-icon>mdi-delete</v-icon></v-btn>`)).toHaveLength(1);
	});
	it("accepts aria-label / title / :title / :aria-label", () => {
		expect(find(`<v-btn icon="mdi-close" aria-label="Close" />`)).toHaveLength(0);
		expect(find(`<v-btn icon="mdi-close" :aria-label="$t('x')" />`)).toHaveLength(0);
		expect(find(`<v-btn icon="mdi-close" title="Close" />`)).toHaveLength(0);
		expect(find(`<v-btn icon="mdi-close" :title="$t('x')" />`)).toHaveLength(0);
	});
	it("accepts a bare `icon` button that also has text", () => {
		expect(find(`<v-btn icon><v-icon>mdi-x</v-icon> Remove</v-btn>`)).toHaveLength(0);
		expect(find(`<v-btn icon>{{ label }}</v-btn>`)).toHaveLength(0);
	});
	it("ignores buttons that are not icon-only", () => {
		expect(find(`<v-btn prepend-icon="mdi-plus">Add</v-btn>`)).toHaveLength(0);
		expect(find(`<v-btn>Go</v-btn>`)).toHaveLength(0);
	});
	it("handles a `>` inside an attribute value and a multi-line tag, and reports the line", () => {
		const hits = find(`\n<v-btn icon="mdi-x"\n  :disabled="a > b"\n  @click="go" />`);
		expect(hits).toHaveLength(1);
		expect(hits[0].line).toBe(2);
	});
});

describe("check-icon-buttons: the codebase", () => {
	it("has no unnamed icon-only v-btn in src/", () => {
		const found = scanDirectory(join(process.cwd(), "src"));
		expect(found.map((f: { file: string; line: number }) => `${f.file}:${f.line}`)).toEqual([]);
	});
});
