import axe from "axe-core";

/**
 * Runs axe-core over a mounted element and returns the critical/serious violations, as
 * `rule-id` strings (sorted, de-duplicated). happy-dom has no layout engine, so the rules that need one
 * (colour contrast, and a few visibility ones) are switched off here and belong to the Playwright e2e run.
 * Vuetify's hidden `<input tabindex="-1">` inside a v-slider is excluded: it is form plumbing that is never
 * focusable or announced - the labelled role="slider" thumb is the control.
 */
export async function axeViolations(el: Element): Promise<string[]> {
	const results = await axe.run({ include: [el], exclude: [[".v-slider__container > input"]] } as unknown as axe.ElementContext, {
		resultTypes: ["violations"],
		rules: {
			"color-contrast": { enabled: false },
			"color-contrast-enhanced": { enabled: false },
			// Widgets are mounted in isolation, not as a whole page.
			// A closed Vuetify v-tooltip leaves an empty role="tooltip" shell in the DOM; it is hidden by CSS,
			// which happy-dom does not apply, so axe would flag every one.
			"aria-tooltip-name": { enabled: false },
			region: { enabled: false },
			"landmark-one-main": { enabled: false },
			"page-has-heading-one": { enabled: false },
		},
	});
	const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
	return [...new Set(bad.map((v) => v.id))].sort();
}
