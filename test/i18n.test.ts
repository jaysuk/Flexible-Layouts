import { describe, expect, it } from "vitest";

import de from "../src/i18n/de.json";
import en from "../src/i18n/en.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(tree)) {
		if (typeof value === "string") {
			out[prefix + key] = value;
		} else {
			Object.assign(out, flatten(value, `${prefix}${key}.`));
		}
	}
	return out;
}

const enFlat = flatten(en as Tree);
const deFlat = flatten(de as Tree);
/** vue-i18n named placeholders, e.g. {count}. */
const placeholders = (s: string) => (s.match(/\{[^}]*\}/g) ?? []).sort();

describe("German locale", () => {
	it("has exactly the keys English has (a new English string needs a German one, and vice versa)", () => {
		expect(Object.keys(deFlat).sort()).toEqual(Object.keys(enFlat).sort());
	});

	it("keeps every {placeholder} and plural separator of the English string", () => {
		for (const [key, text] of Object.entries(enFlat)) {
			expect(placeholders(deFlat[key]), key).toEqual(placeholders(text));
			expect(deFlat[key].split("|").length, key).toBe(text.split("|").length);
		}
	});

	it("has no empty translation where English has text", () => {
		for (const [key, text] of Object.entries(enFlat)) {
			if (text !== "") {
				expect(deFlat[key].trim(), key).not.toBe("");
			}
		}
	});
});
