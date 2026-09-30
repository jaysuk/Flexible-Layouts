/**
 * Known axe critical/serious violations, keyed by test subject -> axe rule ids.
 *
 * A RATCHET: this list may only shrink. `a11y.test.ts` fails when a subject shows a violation that is not
 * listed here (a regression) AND when a listed violation no longer occurs (delete the entry - it is fixed).
 * Never add an entry to make a new failure pass; fix the markup.
 */
export const A11Y_ALLOWLIST: Record<string, readonly string[]> = {};
