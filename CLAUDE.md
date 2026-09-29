# Flexible Layouts — working notes

Vue 3 + Vuetify plugin for DuetWebControl (drag-and-drop layout customisation for 3D printers/CNC).

## Commands

- **Tests**: `npm test` — runs the full vitest suite. Bare `npx vitest run` (no file argument) fails
  with a runner-detection error unrelated to code; always use the `npm test` script for a full run.
  A single file works fine directly: `npx vitest run path/to/file.test.ts`.
- **Typecheck**: needs a local DuetWebControl checkout — `DWC_DIR=<path-to-DuetWebControl> npm run typecheck`.
  Bare `npm run typecheck` fails without `DWC_DIR` set.
- **Build verification**: `DWC_DIR=<path> npm run verify-build` — produces `FlexibleLayouts-<ver>.zip`
  (the installable plugin package) **and** `FlexibleLayouts-<ver>-srcmap.zip` (debug sourcemaps, held
  back from the main archive) in the repo root. Both are gitignored (`*.zip`) — safe to leave, or
  delete them, after a local build.

## Architecture

- **Widget schema**: `src/model/document.ts` — a discriminated union `Widget` type, one variant per
  widget, plus `createDefaultWidget(type)`. New fields should be optional/additive so
  `migrateDocument()` doesn't need a new step; only add a migration when a field's *meaning* changes,
  not when adding a new optional one.
- **Widgets**: `src/widgets/*.vue`, one per type. Registered in `src/widgets/registry.ts`:
  `FREEFORM_WIDGETS` / `BUILTIN_PANELS` (catalog entries: icon, label key, default grid size),
  `describeWidget(widget)` (icon+title from a live instance), `defaultSizeForWidget(widget)`.
- **Editor UI**: `src/editor/PropertiesDialog.vue` is one large file with a
  `<template v-else-if="draft.type === 'X'">` block per widget type — add new per-widget config UI
  there, in the same block-per-type style. Reusable dialogs/pickers (file picker, image picker, icon
  picker, colour picker) are their own small components under `src/editor/`.
- **i18n**: `src/i18n/en.json`, one flat namespace, all keys under `plugins.flexibleLayouts.*`.
- **`<script setup>` convention**: this codebase relies on Vue's automatic prop exposure — a template
  can reference a prop by bare name (`widget.foo`) even though the script only ever captures
  `const props = defineProps<...>()`. Some widgets additionally do `const widget = props.widget;` in
  the script for convenience (e.g. `ToolpathWidget.vue`) — both forms are fine and equivalent.
- **12864 display emulator**: the LCD, fonts, menu layout and encoder behaviour all live in
  `dwc-gcode-core` (`MenuDisplay`, `resolveMenu` - ported from RRF's `src/Display`, so a fix to how a menu
  renders belongs there, not here). This repo only supplies the host: `src/model/display12864/` (menu
  directory loader, object-model values/visibility, a host that *records* G-code and never sends it) and
  `src/widgets/Display12864Emulator.vue`, shown beside a menu file's editor tab in `ExplorerPanel.vue`.
  It follows the **unsaved buffer** when the menu file is open in `GcodeCmEditor` (`editorPreference.ts`'s
  `shouldUseNewGcodeEditor` now says yes for a menu file when the opt-in is on): the editor emits a debounced
  `live-text`, `ExplorerPanel.vue` keeps it per tab and passes every open menu tab's text to the emulator as
  `overrides`, which restarts the display at the menu it was showing. DWC's Monaco exposes only `save()`/`focus()`
  (`defineExpose({ save, focus: focusEditor })`), so a menu file still opened there falls back to the saved
  file, re-read on save. `GcodeCmEditor` is kind-aware (`isMenu`): menu grammar + live `menu/*` linting from
  `dwc-gcode-editor`'s `menuFile.ts` (needs editor >= v0.11.0), no G-code completion/F4/Run/stepper.
  The emulator's **Message box** menu shows a sample M291 box (`MenuDisplay.setMessageBox`, core >= 1.30.0): a preview
  has no live M291, so the emulator plays the firmware's part - a recorded `M292` (an OK/Cancel press) takes the box
  down again with `setMessageBox(null)`, after the encoder call returns, as RRF does (clearing it synchronously
  would re-arm the inactivity timeout that a box switches off).
- **Stock Explorer replacement is opt-in and can be switched at run time** (where DWC allows): an override replaces
  the stock page's keep-alive (a record with any override renders through `RouteOverrideDispatcher`, which hides the
  component name from `keep-alive`), so it can't be always-on and is installed only while wanted.
  `page/explorerReplacement.ts`'s `syncExplorerReplacement()` (called from the Settings toggles) uses DWC's
  `addLayoutRoutes`/`removeLayoutRoutes` when `window.DWC` has them (feature-detected at run time, never imported -
  the manifest pins only a DWC major) and otherwise returns false, which Settings shows as "reload to apply" - the
  old behaviour. The plugin-load install still goes through `registerLayout`'s `routes` (`EXPLORER_REPLACED_AT_LOAD`).
  The route pattern is looked up, not assumed: DWC 3.7.0-rc.2's record is `/Explorer/:tab?/:volume?/:path*` while its
  generated types say `:path(.*)?`; `EXPLORER_PAGE.paths` lists both and `model/routeRecords.ts`'s
  `existingRoutePaths` keeps the ones `getPageComponent` resolves. (Before that the replacement was silently inert on
  rc.2: DWC warned "Cannot override route" and skipped it.) The DWC side lives on `../DuetWebControl` branch
  `feature/runtime-layout-routes` (not pushed).
- **Phone navigation (opt-in "DWC-style navigation on phones")**: `shell/MobileHub.vue` (tiles, with each page's
  `MenuItem.badge` as a `NavMenuBadge` in the corner), `shell/useMobileHub.ts` (`useMobileHubMode` = phone + opt-in + not
  editing; `useShowMobileHub` adds "route is `/`"), `shell/hubTransition.ts` (the `fl-hub-forward`/`fl-hub-back` name, set in a
  `beforeEach` guard and handed to `DwcRouterView`'s `transitionName`; CSS is an UNSCOPED block at the end of `FlexShell.vue`,
  with a `prefers-reduced-motion` off switch) and `page/pageOverride.ts`. Gotchas, both found in a real browser: (1) a
  `<Transition>` child needs a single element root - a leading template comment makes a dev-build fragment and the leave
  animation silently never runs (`MobileHub`'s comment lives inside its root; a test pins it); (2) the Dashboard override is one
  component PER PATH (`/` and `/Dashboard`), because Vue only animates a swap between two component types, and the hub
  decision is made from the record, not the router's current route, or the hub sliding out turns into the dashboard mid-slide.
  Edit mode has no hub and no slide (the drawer is how you leave).
- **Shared logic gets extracted once a second consumer needs it**, not duplicated — e.g.
  `util/shapes.ts`'s `buttonShapeToParams()` (shared by `CommandButtonWidget.vue` and
  `HotspotWidget.vue`'s shaped regions), `composables/useWidgetPreviewFrame.ts` (shared by
  `WidgetPalette.vue`'s hover preview and `WhatsNewWidgetCard.vue`).

## Testing

- `dwc-plugin-test-kit` provides `mountInDwc()`, `loadObjectModel()`, `setModel()`, `setConnected()`,
  `setFiles()`, `sentCodes()`, `lastCode()`, etc. — a mocked machine store + i18n + Vuetify.
- The test-kit's `useMachineStore` stub does **not** implement `download()`/`upload()`. Mock it
  per-test-file by wrapping the real stub:
  `vi.mock("@/stores/machine", async (importOriginal) => { const actual = await importOriginal(); return { ...actual, useMachineStore: () => ({ ...actual.useMachineStore(), async download(...) {...} }) }; })`
  — see `src/__tests__/maintenanceWidget.test.ts` or `labelWidgetSdImage.test.ts`.
- Any `v-dialog`-based component needs an `attach?: boolean | string` prop passed straight through to
  `v-dialog`, purely for testability — Vuetify teleports dialog content to `<body>` by default, which
  Vue Test Utils' wrapper can't see, so `w.find(...)` silently finds nothing. Mount closed
  (`modelValue: false, attach: true`) then `await wrapper.setProps({ modelValue: true })` — see
  `GcodeFilePickerDialog.vue` / `WhatsNewDialog.vue` and their test files for the pattern.
- `test/widgets.smoke.test.ts` mounts every registered widget with its default config — a broken
  template/setup on any widget fails immediately, so it's a cheap regression net for any registry
  change.
- Pointer-drag interactions (native `pointerdown`/`pointermove`/`pointerup`) ARE tested in this repo
  by dispatching real `PointerEvent`s and stubbing `element.setPointerCapture = () => {}` (happy-dom
  doesn't implement it) — see `src/__tests__/hotspotRegionEditor.test.ts`.

## Release process

- `scripts/release.mjs <version> [--push]` (or `npm run release -- <version> [--push]`) bumps
  `plugin.json` + `package.json`, commits `chore(release): vX.Y.Z`, and creates an annotated tag.
  **It refuses to run on a dirty tree** (anything other than those two files) — commit everything
  else first.
- Pushing the tag triggers `.github/workflows/release.yml`: builds against a fresh DuetWebControl
  checkout (default `v3.7-dev`, or `workflow_dispatch` input), typechecks, `verify-build`s, and
  auto-publishes a GitHub Release (title from `scripts/release-title.mjs`'s yoga-pun list, notes
  generated automatically).
- **Release notes are a shared script**, fetched fresh at build time from
  `jaysuk/dwc-plugin-runtime`'s `scripts/changelog.mjs`, pinned to a commit sha
  (`RUNTIME_REF` in `release.yml`) — this is the single source of truth across every plugin in this
  author's family (FL, OmBrowser, duet-tool-align, duet-webcam-bridge, dwc-plugin-test-kit,
  dwc-plugin-runtime itself). It buckets `git log <prevTag>..HEAD` by Conventional-Commit type
  (feat/fix/perf/refactor/docs/test/chore/breaking). `<prevTag>` is always *the immediately preceding
  tag* — there is no flag to widen the range.
  - To generate a changelog spanning further back (e.g. "everything since two releases ago"): fetch
    that exact script (`curl -fsSL https://raw.githubusercontent.com/jaysuk/dwc-plugin-runtime/<RUNTIME_REF>/scripts/changelog.mjs`),
    patch its `prevTag` line to a hardcoded tag, run it locally (`node <patched> --version vX.Y.Z`),
    and splice the output over the CI-published notes with `gh release edit <tag> --notes-file <file>`
    — but keep the CI-generated **footer** (the `---` divider onward: install steps, the
    `> 🔧 Built against **DuetWebControl ...**` line, and especially the
    `<!-- dwc-plugin-update {...} -->` machine-readable comment) byte-for-byte from the original
    auto-generated body. That comment is what `dwc-plugin-runtime`'s `extractRequiredDwc()` parses to
    determine DWC compatibility for the self-update check — don't regenerate or hand-edit it.
- **Known gotcha**: `release.yml`'s `files: plugin/FlexibleLayouts-*.zip` glob uploads **both** the
  real zip and the `-srcmap.zip` as release assets, and GitHub does not guarantee their listing
  order (the srcmap has sorted first at least once, since `-` < `.` in ASCII). `src/model/updateCheck.ts`
  pins an explicit `assetPattern` (`PLUGIN_ASSET_PATTERN`) that excludes `-srcmap.zip` — don't remove
  that guard, and extend it if a third zip-like release asset is ever added.
- No `CHANGELOG.md` file in this repo — changelogs live only as GitHub Release notes.

## Known gotchas

- `dwc-plugin-runtime`'s `formatReleaseNotesHtml()` (an external, `node_modules` package) never
  converts `[text](url)` Markdown links into `<a>` tags — they render as literal bracket/paren text.
  `src/util/releaseNotes.ts`'s `linkifyReleaseNotes()` wraps it with a regex fix (safe because the
  formatter's own HTML-escaping never touches `[`]`(`)` characters). Use that wrapper, not
  `formatReleaseNotesHtml` directly, anywhere release notes are rendered to a user.
- Editing `src/i18n/en.json` via the `Edit` tool has intermittently failed ("String to replace not
  found") despite an exact-looking match from `Read`/`grep` — not reproduced every session, root
  cause never diagnosed. If it happens: fall back to a small Python script (read the file, do an
  exact string replace using literal tab characters, write back with `newline=""`), then verify with
  `node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8'))"`.
- **This repo is sometimes worked on from multiple concurrent Claude Code sessions/terminals at
  once** (same author, different windows) — commits and even mid-session file edits from another
  session can appear in the shared working tree without warning. Check `git log`/`git status` before
  assuming you're the only writer, especially before anything destructive; don't treat an unexpected
  upstream commit as a security concern by default, but do mention it if it affects your work.
