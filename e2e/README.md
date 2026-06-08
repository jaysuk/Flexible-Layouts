# E2E (Playwright + mock Duet)

End-to-end tests for FlexibleLayouts running inside a **real browser** + a **real DWC**, connected to
a mock Duet. This covers what the mount tests (`npm test`) can't: teleported overlays, the custom
shell, route registration, and light/dark visual regression.

The mock connector is the kit's tested `createMockDuet` (see the kit's `test/mock-duet.test.ts`), so
the Duet side is reliable. The browser side needs DWC actually serving the plugin, so it's a manual
opt-in rather than part of `npm test` / CI.

## One-time

```bash
npm install            # installs @playwright/test (a devDependency)
npx playwright install chromium
```

## Run

1. **Serve a DWC that has FlexibleLayouts installed.** Easiest: a DWC checkout with this plugin under
   `src/plugins/` and `npm run dev` (note the URL, e.g. `http://localhost:5173`).
2. From this repo root:

   ```bash
   BASE_URL=http://localhost:5173 npm run e2e
   ```

   The mock Duet is started automatically by Playwright's `webServer` on `:8080`. Point DWC's machine
   host at `localhost:8080` so it connects to the mock.

The first spec (app loads, no console errors, baseline screenshot) runs as-is. The FlexibleLayouts
flows in `tests/smoke.spec.ts` are `test.skip` with `TODO`s — fill in the selectors for your DWC build
and unskip. To gate this in CI, add a job that builds/serves DWC and runs `npm run e2e` (kept out of
the default workflow because it needs a browser + DWC build).
