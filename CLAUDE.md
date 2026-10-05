# Flexible Layouts — working notes

Vue 3 + Vuetify plugin for DuetWebControl (drag-and-drop layout customisation for 3D printers/CNC).

## Commands

- **Tests**: `npm test` — runs the full vitest suite. Bare `npx vitest run` (no file argument) fails
  with a runner-detection error unrelated to code; always use the `npm test` script for a full run.
  A single file works fine directly: `npx vitest run path/to/file.test.ts`. Do not run it alongside another heavy
  job (e.g. `dwc-gcode-core`'s suite): under that load all 171 files fail with the same "vitest is imported directly"
  error and `happy-dom` AbortErrors, and a rerun on its own is green.
- **Typecheck**: needs a local DuetWebControl checkout — `DWC_DIR=<path-to-DuetWebControl> npm run typecheck`.
  Bare `npm run typecheck` fails without `DWC_DIR` set. The check resolves `dwc-gcode-core` (and other shared packages) from
  **that checkout's** `node_modules`, not this repo's - a stale copy there (e.g. 1.31.0 while this repo needs 1.32.0) shows up as
  "has no exported member" errors in the stepper files that are not real; `npm install` in the DWC checkout first.
- **Testing against an unpublished `dwc-gcode-core`**: `npm pack` in the core repo, then
  `npm install --no-save "$(cygpath -w /tmp/dwc-gcode-core-X.Y.Z.tgz)"` here (a bash `/tmp` path is not a Windows path to npm), run `npm test`, and only
  after `npm publish` set the real `^X.Y.Z` in `package.json` and `npm install` so the lockfile resolves from the registry (poll `npm view
  dwc-gcode-core@X.Y.Z version --prefer-online` first). A full run takes a few minutes and prints a stream of happy-dom `AbortError` stack traces
  at teardown that are noise; read the `Test Files`/`Tests` summary line.
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
- **i18n**: `src/i18n/en.json` + `de.json`, one flat namespace, all keys under `plugins.flexibleLayouts.*`. `test/i18n.test.ts`
  fails if `de.json` and `en.json` differ in keys, `{placeholders}` or plural `|` separators, so every new English string needs a
  German one in the same change. Missing locales fall back to English.
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
  `dwc-gcode-editor`'s `menuFile.ts` (needs editor >= v0.11.0), no G-code completion/F4/Run/stepper. The STM32 `board.txt` opens there too
  (`isBoard`, `shouldUseNewGcodeEditor` says yes for `FileKind: "board-config"`): `boardTxtLanguage`/`boardTxtCompletion`/`boardTxtLiveLinter`, the same
  stripped toolbar. Every G-code-only feature (F4, Run, check, stepper, comment tools, the text-banner button, impact squiggles) hangs off
  `isGcode = !isMenu && !isBoard` - a new file kind means a new flag there, not another `!isMenu`. The banner button
  (`AsciiArtDialog.vue` -> `insertAsciiArt`) writes `;` comment lines, so it is G-code only. Its font drop-down
  (`model/bannerFonts.ts`) lists the ~215 ASCII-only FIGlet fonts that `scripts/build-banner-fonts.mjs` (a `preverify-build` step, like the
  parse worker) packs into ONE asset, `dwc/js/flexible-layouts-banner-fonts.json` (~1.9 MB), fetched on first open and parsed per font on pick;
  figlet's 9.7 MB full set cannot go in the 3.6 MB IIFE bundle. Fonts over 30 KB and non-ASCII (box-drawing, TOIlet) fonts are left out on purpose.
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
  `feature/runtime-layout-routes` (not pushed, no PR; the `typed-router.d.ts` path mismatch is filed as
  Duet3D/DuetWebControl#520).
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
- **Side drawer categories are collapsible** (`FlexShell.vue`), like stock DWC's `builtin.vue`: one `v-list-group` per
  `useNavGroups()` category with a clickable icon+caption activator. The state is the *collapsed* set, not the open one
  (`openedCategories` is a computed over it), so every category - including one a plugin registers later - starts open, and
  it is persisted in `localStorage` (`flexibleLayouts.collapsedNavCategories`, try/catch like the drawer width). The setter
  keeps a fold on a category that is temporarily not listed. Also ported from stock: single-child category flattening (only when
  the category label equals the page's, like Settings > Settings), the `main-menu-category`/`main-menu-route` theme colours
  (`menu-category-item`/`menu-route-item` classes), per-page badges, DWC's **icon menu** setting (`railMode`: desktop only and
  never while editing; a rail hides nested groups, so it lists leaf pages flat, as stock does) and **large buttons**
  (`isLargeButtons`: the sm breakpoint only, so it never touches the md+ header widgets). The phone hub is unaffected (it lists
  tiles, not groups).
- **DWC settings FL reads**: `showStatusPanel`, `showEmergencyStop`, `iconMenu`, `largeButtons`, `dashboardMode` (via
  `util/machineMode.ts`'s `wantsCncLayout`, used by the page seeders in `builtinPages.ts` - the Vector Import gate stays on the
  machine's real mode on purpose). `behaviour.switchToJobOnPrintStart` is handled by DWC's own `App.vue`; FL's `jobStartPath`
  jump is a second `router.push` in the same tick, which vue-router resolves as last-wins, so FL's explicit choice wins
  without a second history entry.
- **Job pages are editable**: `/Job/Status` (`JobStatusFallback`, seed `jobStatusSeed`) and `/Job/Webcam`, both
  `lockWhilePrinting: false` (pause/babystep/factors must work mid-print; individual widgets still lock by type). Stock's
  `JobViewPanel` (3D preview / layer chart / G-code stream + plugin job-view tabs) and `JobProgress` are catalogue panels.
- **Explorer split view (two files side by side)** (`model/explorerPanes.ts`, `ExplorerPanel.vue`). The state machine is
  `dwc-gcode-editor`'s `workspace.ts` (`splitRight`/`moveTab`/`collapseEmptyGroup`, needs editor > 0.12.0); `explorerPanes.ts` builds a
  `WorkspaceState` around the session's OWN tab objects (so `dirty`/`draft` stay live), applies one op and writes `groupId`,
  `groups`, `focusedGroup`, `splitRatio` back. **Every tab's content is rendered flat in one CSS grid, in id order, placed by
  `grid-column` - never nested in a per-pane element**: Vue cannot re-parent a component, so a per-pane `v-for`/`v-window` remounts
  the editor on every drag/split/collapse and loses unsaved edits (why Duet3D/DuetWebControl#517 was sent back). Do not "tidy" it into
  per-pane containers; `explorerSplit.test.ts` fails if you do. `session.activeTab` is the FOCUSED pane's showing tab (what the URL
  follows); write it only through `activateTab`. An editor is mounted while its pane is showing it or it is dirty, so two files
  mean two live editors. The URL is path-based, so a deep link to a file open in the other pane focuses it.
- **Explorer state outlives the panel** (`model/explorerSession.ts`). Neither a plugin route (`registerRoute` takes only
  `pageFill`/`scrollToBottom`, so no `meta.keepAlive`) nor an overridden page (renders through `RouteOverrideDispatcher`,
  which hides the component name from `keep-alive`; `DwcRouterView` also reads its include list once at setup) can be
  kept alive, so `ExplorerPanel`'s tabs live in a module-level reactive session keyed per placement (`page:/Explorer`, or
  the grid item id from `SETTINGS_SCOPE_KEY`; no key = not remembered). An editor that unmounts dirty emits `stash` with its
  text; the tab keeps it as `draft` and hands it back on remount (`GcodeCmEditor`'s `draft` prop: file loaded, then the draft
  put over it so undo reaches the card). Cursor/scroll come from `editorViewState.ts` (one in-memory `ViewStateStore`). In
  `ExplorerFallback` the URL follows the active tab (`explorerUrl`, DWC's own `/Explorer/edit/<file>` form) - `target` is
  `undefined` once the route is off Explorer, because on the way out `route.params` is already the next page's and would read
  as "browse the root". A bare `/Explorer` on a *return* visit keeps the session and the first `location` report `replace`s
  the URL. Only a dirty **Monaco** tab is "lossy" (`dirty-change`), everything in the new editor is stashed. Memory only: a
  browser reload drops sessions (unsaved text is deliberately not written to storage).
- **Custom page ids are readable** (`model/pageSlug.ts`): `/p/<slug of the title>` (`-2`, `-3` on a clash), fixed at creation
  so a rename never moves the URL. A document that still has UUID ids is re-keyed on `registerExistingCustomPages()` (which
  every document swap already calls) by `migrateOpaquePageIds`: deterministic (document order), idempotent, rewrites
  `nav.order`/`nav.hidden`/`startupPath`/`jobStartPath`, and records the old path in `PageLayout.legacyPaths`. Each legacy
  path is registered as a hidden route (`CustomPageAlias`, condition false + menu item removed) that `router.replace`s to the
  current page and renders NOTHING - a built-in panel derives its saved-settings id from the route path it first mounts under.
  Those ids (`<route path>::<panel>` in DWC's `componentSettings`) are moved to the new path by `moveLegacyComponentSettings`,
  re-run by a watch because DWC loads settings after plugins. `mergeImported` gives an imported page whose slug collides with
  a different-titled local page a new address (same slug + same title = the page coming back, overwrites). The importers
  (`io.ts`, `btncmd.ts`) still mint UUIDs on purpose; the migration slugs them once merged.
- **Maintenance rules, user counters and the machine-side action** (`model/maintenance/counters.ts`, `customCounters.ts`, `rulesMacro.ts`,
  `rulesSync.ts`, `model/reminders/rulesStore.ts`, `ruleAction.ts`, `maintenance/useMaintenanceRules.ts`). A counter is a **key string**
  (`spindleSeconds`, `axisMm:2`, `custom:c1`) parsed in `counters.ts` - the one place that maps a key to its `global.flMaint*`
  expression/unit/label; rules, log `services`, `baselines`, the due badge and the generated macro all use it. A log entry's
  `*AtEntry` fields cover only the original four counters; everything else is in the optional `baselines` record. **Rules live on the
  SD card** (`0:/sys/flexible-layouts.maintenance-rules.json`, checksummed, read-modify-write via `updateMaintenanceRules`), not in
  `localStorage` any more (that is now the offline copy and the migration source): an unreadable file is NOT an absent one, and a file is
  only created when the directory listing positively says it is missing - writing over an unreadable file would delete everyone's
  rules. **The machine runs rule actions and user counters itself** from a GENERATED `maintenance-custom.g` (+ `-flush.g`); the static
  daemon (v11) calls it only while `global.flMaintCustomOn` (derived from that file existing - nothing to persist) and AFTER its flush
  check, so an expression RRF rejects (which aborts the macro it is in) can never stop the base counters being written. Each rule's due
  value (`baseline + interval`) is baked into that file as a literal, so **anything that moves a baseline must call `resync()`** (logging a
  service does; so does every rules/counter change and the setup wizard). The "already fired" marker stores the due value that fired, so
  a new baseline re-arms without a reset step. A rule with no baseline is deliberately NOT armed (it would fire at once on a machine that
  has simply been running). User conditions are checked with `dwc-gcode-core`'s `parseExpression` and then evaluated on the machine with
  `echo` before they can be saved; actions must be one G/M/T line, run idle-only by default. The macro TEXT is unit-tested (every
  expression in it is parsed with the core's parser) and was checked against RRF's source (`fileexists`, M98 on a missing file only
  warns, daemon cadence, `M291 S1` non-blocking) but has **not been run on real firmware** - have a changed generator reviewed by hand.
  The Duet3D Maintenance Timers plugin interop (`pluginTimers.ts`) only reads `plugins.MaintenanceTimers.data.timers` and calls its
  `PUT machine/MaintenanceTimers/Reset`; it accepts camelCase or PascalCase keys because the plugin's serialiser casing is unverified.
- **Display units and slider preferences follow DWC's settings.** `util/units.ts` (`useLengthUnits`) turns DWC's `displayUnits` into
  inches for the DRO, WCS, WCS table, Octopus DRO and a value widget flagged `lengthMm` - display only: the firmware and every
  command stay in millimetres, so typed inches are converted back before they reach G-code. `widgets/LockableSlider.vue` wraps
  `v-slider` with DWC's `lockableSliders` lock button and `numericInputs` number field (Slider, Fan and Spindle widgets use it).
  Jog step rings are configured in mm and stay mm; only their tooltips add the inch equivalent.
- **Per-device state never goes in the shared document.** DWC stores `plugins.flexibleLayouts` on the board, so every browser
  that opens the machine shares it. Anything that is "how THIS browser looks" lives in `localStorage` (try/catch, like the drawer
  width): sound/vibration (`util/sound.ts`), hotkey switches (`model/hotkeys.ts`), fullscreen/kiosk/keep-awake
  (`model/screenState.ts`), which tab is showing and whether a panel is folded (`model/containerState.ts`, keyed by the placed
  item's id via `ITEM_ID_KEY`), the "showing profile" override (`deviceProfileOverride` in `store.ts`; `getActiveProfileId()` is
  what THIS device shows, `getSharedActiveProfileId()` is the shared default and what a backup records; a manual switch writes
  the shared pointer and clears the override, an automatic one - `model/autoProfile.ts`, edge-triggered, first match wins - only
  sets the override). The tests assert the document is untouched.
- **Container walkers go through `childItemLists` / `mapChildItemLists` / `forEachItemWidget` (`model/document.ts`)** - the one place
  that knows which widget types nest items (`group`, `tabs`). Visiting, id regeneration (`reidItem`, which also renews a tabs
  widget's tab ids), runtime-field stripping, dependency capture and Explorer-session pruning all use them; a new container type
  only has to be taught there. Do not add another `type === "group"` special case.
- **A hotkey, a paste or a cue must never be a side door.** `model/hotkeys.ts` registers a widget's own `activate()` (via
  `composables/useHotkey.ts`) so print lock, access lock, confirm and debounce still apply; it stands down while typing, with a
  dialog open, on repeat, and (by default) while editing. `model/widgetClipboard.ts` uses the DOM `copy`/`cut`/`paste` events, not
  `navigator.clipboard` (absent over the plain HTTP DWC is usually served on); a paste is ONE `commit()`. Audio cues
  (`composables/useCueOnRise.ts`, `model/soundCues.ts`) fire on a RISING EDGE only, baseline on mount, and go through `playCue`
  (mute/volume); browsers keep the `AudioContext` suspended until a gesture.
- **Accessibility is enforced by tests, not goodwill.** `test/a11y/a11y.test.ts` runs axe-core over every registered widget and
  its Properties dialog (colour-contrast is off in happy-dom); `A11Y_ALLOWLIST` may only shrink and a stale entry fails.
  `scripts/check-icon-buttons.mjs` (also run by a test) fails on an icon-only `<v-btn>` with no `aria-label`/`title`/text. Under
  the test kit `attachTo` renders nothing into the host, so audit `wrapper.html()` re-parented into a real element (and guard
  against a vacuous pass). Click targets that are not `<button>`s (jog sectors, shaped buttons, shaped hotspots) use
  `v-svg-button` (`util/svgButton.ts`): role, name, tab stop, Enter/Space firing the element's OWN click handler; jog pads are one
  tab stop with `ringNavigation` arrows. Panel headers are keyboard "grab handles" (Enter, arrows, Shift+arrows) that
  `FlexPage` applies as one undo step and announces in an `aria-live` region.
- **Firmware-change notifications** (`model/firmware/change*.ts`, `impactRange.ts`, `firmwareChanges/`; plan in `FIRMWARE-CHANGES-PLAN.md`).
  `dwc-gcode-core` (>= 1.33.0; >= 1.38.0 for 3.7.0 stable - read at the 3.7-dev head and tracked as a provisional untagged build until the tag exists, so a board on `3.7.0` is inside the catalogue) owns the catalogue and the matching (`scanImpact`/`scanFile`/`buildImpactReport`, `impactToDiagnostics`,
  `RELEASES`); this repo only lists and reads the files and shows the result. **State lives beside the document, not in it**:
  `plugins.flexibleLayouts.firmwareChanges` (`changeState.ts`: `enabled`, `editorWarnings`, `baseline`, `acknowledged`, `lastScan`,
  `notifiedKey`), machine-shared like the profiles but outside them, so layout export, profiles and undo never see it (a test
  asserts the profiles JSON is unchanged). **Event ids are a contract with core** - `acknowledged` stores them, and core's
  `test/fixtures/event-ids.json` fails if one disappears. `decideCheck`: no baseline -> `record-baseline`, which the nudge turns into a scan from `initialBaseline(running)` (core's
  `OLDEST_TRACKED_RELEASE`, 3.6.3; a machine already there just records itself), same version -> nothing, any
  other version (up or down) -> scan. Only `boards[0]` counts. **The scan is idle-only** (`changeCheck.ts`'s `shouldContinue`: connected
  and `state.status === "idle"`), reads `sys` + `macros` only (never `gcodes/`, files over 1 MB, non-G-code names), 3 downloads at a time,
  cached in memory by `path|size|lastModified` (`changeScan.ts`), parsing yields every 8 files. `changeNudges.ts` is the toast: once per
  `baseline->running` pair machine-wide (`notifiedKey`), zero findings advance the baseline silently, a busy machine waits for the idle
  edge, `CHECK_COOLDOWN_MS` guards a flapping link. The toast route is `/Settings/flexibleLayouts` (the settings-tab key); a route can
  only name a page, so `requestFirmwareReport()` leaves a 2-minute flag that `FirmwareChangesCard` turns into an open dialog.
  **"Open at line N"** cannot ride the Explorer URL: `requestReveal(path, line)` (`explorerSession.ts`, 10 s TTL) is claimed by
  `ExplorerPanel`'s `tryReveal` when the file's editor binds, and `GcodeCmEditor.revealLine` waits for the load. **The firmware-update
  widget's pre-flight** (`FirmwareUpdateWidget.vue`) scans running -> selected release with `quiet: true` (never overwrites the shared
  report), never touches the baseline, and sets `preflightTarget` so `currentImpactRange()` (what the editor's `gcodeImpactCheck` is drawn
  for) follows the selection. Wording is "known changes", never "your files are safe"; the report footer counts what cannot be checked.
  Editor squiggles need `dwc-gcode-editor` >= 0.15.0 and share the CM lint set with the other linters (see that package's notes on
  `setDiagnostics`). **Catalogue accuracy is core's job and still partial**: every command in core's dictionary now has `historyChecked`, i.e.
  its existence and the parameters the entry LISTS were confirmed against RRF source at all 18 tracked builds (282 of 282 as of 2026-09-30; progress is
  `dictionary/coverage.json`'s `versionHistory`, status in `FIRMWARE-CHANGES-PLAN.md`). That is not "the catalogue is complete": value-level and
  required-ness changes need a hand-written event (a value-level pass on 2026-10-01 read every changed range check, `MustSee`, rejecting reply and default, and found one miss -
  `M563 H`/`M140 H`/`M141 H` refusing a heater that already has another job - see core's `d3-line-by-line.md`; it shipped in core 1.35.0), and the motion-maths files: the default (S-curve off) path was
  compared line by line on 2026-10-01 (a handful of sub-step differences, one event for input-shaping start gaps), but the third-order planner has no 3.6.3 counterpart to diff and nothing was measured on a machine, so a purely numerical change there is invisible to the catalogue.
  The same pass found HTTP no longer enabled by default (`network-http-not-enabled-by-default`) and the `M472 R1` nested-delete fix; both shipped in core 1.35.0. The 293 commits the triage closed with a section note were read as diffs on 2026-10-01 (`docs/rrf-triage/d3-line-by-line.md` in core) and `M669`'s per-kinematics
  letters (Hangprinter, five-bar SCARA) are enumerated. So the UI's "known changes" wording and the undetectable count are load-bearing. A mistake found there is fixed in core and arrives via a
  `dwc-gcode-core` bump, never patched in FL.
  **The report lists what needs changing, not what the scan matched** (core >= 1.36.0, `releases/actions.ts`; FL half `model/firmware/changePlan.ts`).
  `scanImpact` matches every line that touches a changed command/parameter/path - mostly noise (an ADDED command cannot hurt on an upgrade; `M140 P0 H0`
  is fine until the heater is also on a tool). `planActions(report, files)` is the second pass: `severityOf` (breaks/differs/info by kind and direction,
  with an override table), per-event RULES that may read every file (the two-jobs heater conflict is reported once, not once per matching line), and a
  `fix` of plain `FileEdit`s (`previewEdits` / `applyFileEdits`). The dialog shows `problems` per file with a diff and Apply, `worthALook` collapsed,
  and everything else (versions, citations, undetectable list, ignored) under Details; the nudge toast, the Settings card's counts, the pre-flight notice
  and the editor squiggles (`squiggleWanted`) follow the same rule, so a file with only "differs" findings advances the baseline silently. A report's
  plan needs the text it was made from: `runFirmwareScan` registers it (`rememberReportFiles`, keyed by `toRaw(report)` - a prop or a deep `ref` hands over a
  reactive Proxy, a different WeakMap key), and a test that builds a report with `scanImpact` must register it too. **A fix rule must be safe to apply to a
  file that was already migrated** (a scan cannot tell): `M955` without `P` -> add `P0` is; `M575 P1` -> `P2` is not, so it is advice only. A choice (which
  of two jobs keeps a heater) offers each side and picks neither; `Apply all` takes only `safe` single-option fixes. **`applyFix` is the only place FL
  writes a config file**: connected and idle, every file re-downloaded and compared with the scanned text, the original kept as `<file>.bak` once per page
  session, a failed write rolls back, `Undo` refuses over a later edit. Not applied in the pre-flight (the files are right for the running version).
  Files the plugin generates (`macros/FlexibleLayouts/*`, `sys/flexible-layouts.*`) are never scanned (`isOwnFile`). Core's fix text is English only (like the
  event descriptions); the dialog's own strings are in `firmwareChanges.*` in both locales. Not yet run against a real board's SD card.
- **Starter layouts are a registry** (`model/starterLayouts.ts`): one entry per page, built from `createDefaultWidget` so schema
  changes flow in; always a NEW page (optionally its own profile), never a change to an existing one. `test/starterLayouts.test.ts`
  checks every entry against the widget catalogue, the 12-column grid and `migrateDocument`.
- **The unattended-backup script** (`model/configBackup/unattendedScript.ts`) is pure string generation with no FL/DWC imports, so
  it can move into `dwc-config-backup-core`. `test/unattendedScript.test.ts` actually RUNS the generated script in Node against
  `test/fixtures/fakeDuet.ts` for both firmware flavours (the kit's mock Duet serves no files). The board password is read from an
  environment variable and must never appear in the script. `autoRunOnConfigSave` is a typed optional field of the core's `AutoBackupNudgeSettings` (0.2.1+); a stored blob that predates it reads as off.
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

- **Never script-edit source files with Python's default `open()` on Windows.** It is cp1252, so a `§`, `—` or `…` you insert is
  written as a lone Latin-1 byte and the file stops being valid UTF-8 (this happened once, in `autoBackupNudges.ts`). Read and write
  bytes and decode/encode as UTF-8, or use the Edit tool. `git ls-files -m -o --exclude-standard` + a UTF-8 decode check finds any
  damage.
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
