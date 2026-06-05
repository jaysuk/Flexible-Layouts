import { defineConfig } from "vitest/config";

// Unit tests for the plugin's pure-logic modules (object-model paths, conditions, document
// helpers). Node environment — no DWC/Vuetify runtime needed. Run with `npm test`.
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
	},
});
