import { defineConfig, devices } from "@playwright/test";

// Drives a running DWC (BASE_URL) that has FlexibleLayouts installed, with the mock Duet started
// alongside (webServer below). See e2e/README.md for the one-time setup (build/serve DWC + the
// plugin, then `npm run e2e`). webServer.cwd defaults to this config's directory, so the relative
// `mock-duet/server.mjs` resolves and finds the kit in the repo's node_modules.
export default defineConfig({
	testDir: "./tests",
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: process.env.BASE_URL ?? "http://localhost:5173",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "node mock-duet/server.mjs",
		url: "http://localhost:8080/rr_connect",
		reuseExistingServer: !process.env.CI,
	},
});
