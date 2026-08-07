import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { dwcVitestConfig } from "dwc-plugin-test-kit/vitest";

// The kit stubs the common `@/…` imports, but not `@/composables/useGcodeThumbnails` (its real
// implementation pulls in `@/utils/path`, which the kit deliberately doesn't stub). Point it at a
// local stub so widgets that use it can mount in tests. Real builds use DWC's actual composable.
const gcodeThumbStub = fileURLToPath(new URL("./test/stubs/useGcodeThumbnails.ts", import.meta.url));
const stubComposables = {
	name: "flex-stub-composables",
	enforce: "pre" as const,
	resolveId(id: string) {
		return id === "@/composables/useGcodeThumbnails" ? gcodeThumbStub : null;
	},
};

// Pure-logic tests (src/**) plus component mount/contract tests (test/**). All the Vitest + Vuetify
// + DWC-mock wiring lives in the shared kit; the consumer only supplies the Vue SFC plugin (so it
// resolves from this repo's node_modules at config-load time).
export default dwcVitestConfig({
	plugins: [stubComposables, vue()],
	// Coverage ratchet: floors set just below the current numbers so coverage can only go up — CI's
	// `test:coverage` fails if a change drops below them. Raise as you add tests. Only enforced under
	// `--coverage`; plain `npm test` stays ungated/fast.
	test: { coverage: { thresholds: { statements: 40, branches: 32, functions: 25, lines: 42 } } },
});
