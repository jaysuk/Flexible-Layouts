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
