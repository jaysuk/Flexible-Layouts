import vue from "@vitejs/plugin-vue";
import { dwcVitestConfig } from "dwc-plugin-test-kit/vitest";

// Pure-logic tests (src/**) plus component mount/contract tests (test/**). All the Vitest + Vuetify
// + DWC-mock wiring lives in the shared kit; the consumer only supplies the Vue SFC plugin (so it
// resolves from this repo's node_modules at config-load time).
export default dwcVitestConfig({
	plugins: [vue()],
	// Coverage ratchet: floors set just below the current numbers so coverage can only go up — CI's
	// `test:coverage` fails if a change drops below them. Raise as you add tests. Only enforced under
	// `--coverage`; plain `npm test` stays ungated/fast.
	test: { coverage: { thresholds: { statements: 27, branches: 20, functions: 15, lines: 27 } } },
});
