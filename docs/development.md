# Development

## Source layout

```
Flexible-Layouts/
  plugin.json             DWC manifest (id, name, version, dwcVersion)
  package.json            name (needed by the build) + bundled deps + test script
  vitest.config.ts        unit-test config
  build.bat               Windows one-shot build against a DWC checkout
  src/
    index.ts              entry: registers the shell, route overrides, settings tab, i18n,
                          cache flags, theme, escape guard; cleans up on plugin unload
    shell/                custom app shell (app bar, drawer, status region, header widgets)
    page/                 FlexPage (one editable page) + FlexGrid + FlexGridItem
    widgets/              one component per widget type + the catalog/registry
    editor/               palettes and configuration dialogs (properties, theme, profiles, lock, …)
    model/                document schema, persistence store, profiles, pages, import/export, lock
    settings/             the Settings → Flexible Layouts tab
    composables/          small helpers (e.g. breakpoint matchMedia)
    util/                 object-model path resolution + condition evaluation
    i18n/                 translatable strings (en.json)
    __tests__/            vitest unit tests for the pure-logic modules
```

## How it plugs into DWC

- `registerLayout()` installs a **custom shell** plus per-route component overrides, so each editable
  page renders an editable grid while the custom layout is active and the original component when
  it's not. `/BuiltInLayout` always returns to stock DWC.
- The editable canvas is [grid-layout-plus](https://github.com/qdreamer/grid-layout-plus) (vertical
  compaction off → free placement; items can't overlap).
- The persisted document lives under DWC settings at `plugins.flexibleLayouts` (schema-versioned;
  see `model/document.ts`), restructured into **profiles → pages → widgets**.
- Cleanup that outlives a component (the escape-guard watcher, the Plugins-page router guard) is torn
  down on DWC's `dwcPluginUnloaded` event so nothing leaks when the plugin is stopped.

## Building (the external-plugin model)

The plugin is compiled by DWC's `scripts/build-plugin-pkg.js`, which bundles the source into a single
content-hashed IIFE and packages it with a `dwcFiles` manifest. A few things are specific to building
an **external** plugin (one that lives outside the DWC tree):

- **`package.json` with a `name` is required** — Vite's library build derives the CSS filename from
  it, and an external repo otherwise has none.
- **Run `npm install` here first.** Bundled (non-externalised) dependencies — currently just
  `grid-layout-plus` — are resolved from *this* repo's `node_modules`, not DWC's.
- **Only the documented plugin API can be imported.** The build externalises these to `window.DWC` at
  runtime: `@/plugins`, `@/stores/*`, `@/i18n`, `@/utils/events`, `vue`, `vue-router`, `pinia`,
  `vue-i18n`, `@duet3d/objectmodel`, `@duet3d/connectors`, `vuetify/components`. Anything else under
  `@/…` (e.g. `@/composables/*`) is a DWC internal that **won't resolve** for an external build — use
  the externalised equivalent instead. (This is why the first-run activation prompt uses
  `useUiStore().makeNotification` rather than DWC's internal confirm-dialog composable.)
- **No auto-imports.** The build runs only the Vue plugin — every `.vue`/`.ts` file must explicitly
  import `ref`/`computed`/etc. from `vue` and import its own components.
- **Don't import `vuetify` directly.** It isn't externalised and would bundle a broken second copy;
  use Vuetify components as tags (they're globally registered) and the local `composables/` helpers.

```bash
npm install                                          # once, in this repo
npm run build-plugin-pkg -- /path/to/Flexible-Layouts   # from your DWC checkout
```

or run `build.bat` (edit `DWC_DIR` first) on Windows. The ZIP lands in this folder.

## Type-checking

The build (esbuild/rolldown) strips types without checking them. To type-check against DWC's
`@/…` aliases, copy `src/` into a throwaway folder under the DWC tree and run `vue-tsc`:

```bash
cp -r src/. <DWC>/src/plugins/_FLCheck/
( cd <DWC> && npx vue-tsc --noEmit ) | grep _FLCheck   # empty = clean
rm -rf <DWC>/src/plugins/_FLCheck
```

## Testing

`npm test` runs the full vitest suite via [dwc-plugin-test-kit](https://github.com/jaysuk/dwc-plugin-test-kit)
(a sibling repo, linked with `file:../dwc-plugin-test-kit`):

- **Pure-logic** unit tests — `src/__tests__/**` (object-model paths, conditions, document helpers).
- **Mount smoke tests** — `test/widgets.smoke.test.ts` mounts **every** widget from the registry
  (connected and disconnected) under Vuetify + happy-dom with the DWC stores mocked, asserting it
  renders without throwing. Adding a widget covers it automatically — this is the net that catches
  setup/TDZ and render crashes.
- **G-code contract tests** — `test/widgets.gcode.test.ts` drives interactions and asserts the exact
  G-code sent (e.g. jog, spindle `M3`, `M292`, `M150`).

The kit also provides `npm run typecheck` and `npm run verify-build` (both need `DWC_DIR` pointing at
a DuetWebControl checkout), and a reusable CI workflow (`.github/workflows/ci.yml`). See the kit's
README for the full harness API and an optional Playwright E2E template.

## Upgrading alongside DWC

DWC 3.7 is still in alpha; its plugin API and component set move. After pulling a new DWC, rebuild and
re-type-check. The activation/escape/lock flows depend on `settings.useCustomLayout`,
`settings.layoutUserSet`, the `/BuiltInLayout` route, and the `dwcPluginUnloaded` event remaining
available.
