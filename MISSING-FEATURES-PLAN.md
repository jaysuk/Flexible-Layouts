# Missing-features plan — scheduled backups (what is really left) + the "nobody asked yet" list

Status: **proposed, not started.** Same convention as `CAM-LASER-PLAN.md` and the `*-PLAN.md` files in the sibling
`dwc-config-backup-core` repo: grounded in the code as it is today, phased, each phase shippable on its own.

Origin: a feature audit of FL against stock DuetWebControl (see the git history around this file). The four
regressions it found (imperial display units, German locale, slider lock / numeric-entry settings, native-app
"back to device list" + drawer hints) are already fixed; this document covers everything else.

## §0 A correction to the audit, before anything else

The audit listed "scheduled config backup is not built" from a header comment in
`src/model/configBackup/runBackup.ts` ("a future automatic trigger (Phase 3, not built yet)"). **That comment is
stale.** Phases 1-3 of `dwc-config-backup-core/SCHEDULED-BACKUPS-PLAN.md` are done and live in FL:

| Shipped | Where |
| --- | --- |
| Headless `collectForBackup()` / `runBackup()` (never prompts, returns `needsInput`) | `src/model/configBackup/runBackup.ts` |
| Opt-in **auto-run when overdue**: enabled + eligible destination + strictly idle + overdue → runs a real backup | `autoBackupNudges.ts` `checkOnConnect()` |
| Re-check on every reconnect, at most hourly (`OVERDUE_RECHECK_COOLDOWN_MS`) | same |
| Failure tracking, error toast, escalation after repeated failures | `setLastBackupAttempt`, `reportAutoRunFailure` |
| Settings UI: checkbox, eligible-destination picker, encryption-conflict warning | `CloudPanel.vue` |
| Tests: 13 cases (must-not-fire ×5, fires ×5, reconnect ×3) | `test/configBackup.autoRun.test.ts` |

So what the request really lacks is small and specific — Part A below. The one thing that cannot be fixed inside a
browser plugin is *true* unattended scheduling; §A5 proposes the honest workaround.

## §1 Ground rules for every phase

- **New widget fields are optional and additive** (`CLAUDE.md`): no `migrateDocument()` step unless a field's meaning
  changes. The one exception in this plan is the `tabs` widget type (§B3), which is a *new type* — an older FL renders
  its "unsupported widget" placeholder, and `io.ts`'s newer-version warning already covers imports.
- **Every new string ships in `en.json` and `de.json` in the same change** — `test/i18n.test.ts` fails otherwise.
- **Anything that can send a command goes through the same gates as a click**: access lock (`accessLockedFor`), print
  lock (`effectiveLockForItem`), confirm dialogs, debounce, conditions-disable. Hotkeys (§B2) and audio cues (§B1) must
  not become a side door around them.
- **Per-device things live in the browser, not in the shared document.** DWC settings are stored on the board by
  default, so anything in `plugins.flexibleLayouts` is shared by every browser that opens the machine. Sound volume,
  kiosk mode, "which profile this device is showing" belong in `localStorage` (try/catch, like `collapsedNavCategories`).
- **Test where the risk is:** pure logic gets pure tests; each new widget/setting gets a mount test in the style of
  `test/lockableSlider.test.ts`; anything registered gets covered by `widgets.smoke.test.ts`.
- **Plain HTTP is the common case.** DWC is usually served over `http://` on a LAN, which is *not* a secure context:
  `navigator.clipboard`, `navigator.wakeLock` and crypto APIs are absent there. Each feature below says how it degrades.

---

# Part A — Scheduled config backup: what is actually left

## §A0 Fix the docs and the stale comment (S, do first)

- `docs/config-backup.md` § "Reminders and reliability" says reminders are "**never** a silent upload or download". The
  opt-in auto-run contradicts it and is not documented anywhere. Add an "Automatic backups" section: how to enable, the
  eligibility table (duet / github / dropbox / webdav yes; local / drive never; encryption blocks it), the idle gate, that
  it only runs while a DWC tab is open, and where failures show.
- Rewrite the header of `runBackup.ts`, which still calls Phase 3 "not built yet". (`CLAUDE.md` has no config-backup notes
  to correct.)

## §A1 Run when the printer *becomes* idle, not only on reconnect (S–M)

Today the only trigger is a connection edge, then an hourly re-check on *reconnect*. If a backup is overdue, the printer
is mid-print (so it falls back to the plain nudge) and the print finishes while you watch, nothing happens until the next
reconnect. Add a second trigger to `autoBackupNudges.ts`: watch `machineStore.model.state.status`; on a transition *into*
`idle` from a busy state, run the same overdue → eligible → idle decision, under the **same** hourly cooldown and the
same `autoRunInFlight` guard so the two triggers can never overlap. Decision to record (SCHEDULED-BACKUPS-PLAN §9 Q3):
keep **strictly `idle`** — do not treat `paused` as eligible.

Tests: idle-edge fires once; busy→busy does not; cooldown shared with the connect trigger; disabled/ineligible/not-overdue
still never fire.

## §A2 Back up shortly after `config.g` is saved (M, needs a core change)

SCHEDULED-BACKUPS-PLAN §9 Q4. The `fileUploaded` handler already detects a `config.g` save and raises a nudge. Add an
opt-in `autoRunOnConfigSave` (default **off**): after the *last* `config.g` save in a burst settles (debounce ≥ 10 minutes
from the final save — the existing 5-minute `CONFIG_SAVE_COOLDOWN_MS` is a nudge rate-limit, not a debounce), run the
auto-run if the destination is eligible and the machine idle, otherwise leave the nudge.

- Needs a new field on `AutoBackupNudgeSettings` in **`dwc-config-backup-core`** (merge-over-defaults means existing
  users get `false` with no migration), then a version bump and pin here.
- Risk: a half-edited config is backed up. Mitigation: the debounce, and the backup is additive history (destinations keep
  prior versions), so a bad one is superseded by the next.

## §A3 Manual-backup failure alert — decision only (XS)

SCHEDULED-BACKUPS-PLAN §9 Q2. `runBackup()` already records `setLastBackupAttempt()` for manual and automatic runs, and
the Create tab shows the last-attempt state. Confirm the toast stays automatic-only (the user is looking at the screen
during a manual run) and close the question in the plan. No code.

## §A4 More than one destination per run (L — defer unless asked)

`autoRunDestination` is a single id. Two destinations means per-destination `lastBackupAt` (core has one), a definition of
"overdue" when one succeeded and one failed, and per-destination failure streaks. Recommendation: **do not build** until
someone asks; if they do, define overdue as "any selected destination is stale" and make the failure streak per
destination. Needs core changes first.

## §A5 Genuinely unattended backups: a generated script (M, optional, needs a product decision)

The ceiling stated in SCHEDULED-BACKUPS-PLAN §1 stands: a browser plugin cannot run while no tab is open, and RRF macros
cannot make outbound HTTP calls. What FL *can* do is remove the toil of setting up the real answer (cron / Task Scheduler
on any always-on machine):

- A **"Set up an unattended backup" helper** in the Cloud/Configuration tab that generates a single self-contained
  `duet-backup.mjs` (Node ≥ 18, no dependencies) with the machine's address baked in. It walks `0:/sys`, `0:/macros`,
  `0:/filaments` through `rr_filelist` / `rr_download` (standalone) or `/machine/directory` / `/machine/file` (SBC, detected
  from the object model FL already has), writes a dated folder tree, keeps the newest N, and prints a non-zero exit code on
  failure so the scheduler notices.
- Alongside it, ready-to-paste scheduler snippets: a crontab line, a Windows `schtasks` command, and a systemd timer pair.
- **What it does not do, and the UI must say so:** no redaction (WiFi/machine passwords are in the files, so the target
  folder must be private), no encryption, no cloud upload, no restore path (restore stays in the plugin). A board password
  is read from an environment variable, never embedded.
- Why a script and not a service: it keeps the trust boundary obvious (user-owned code on the user's machine), and it is
  the same advice the forum answer would give anyway.
- Tests: golden-text tests of the generated script and snippets; run the generated script in Node against
  `e2e/mock-duet` for both firmware flavours and assert the tree.

Open question: does an unattended-script generator belong in a *layout* plugin at all, or in `duet-config-backup-plugin`?
Recommendation: build it in `dwc-config-backup-core` (pure string generation) and surface it from FL.

## §A6 Port to the standalone plugins (tracking item, out of this repo)

Phase 4 of SCHEDULED-BACKUPS-PLAN: `duet-config-backup-plugin` and the Vue 2 / DWC 3.6 plugin. The shared core already
carries the settings fields and predicates. Listed so it is not forgotten; not scheduled here.

**Part A order:** A0 → A1 → (decide A3) → A2 → A5 → A4 on demand.

---

# Part B — The "nobody asked yet" features

Each entry: what exists today, the design, the data model, safety, degradation, tests, size. Sizes: S ≈ a day, M ≈ a few
days, L ≈ a week+.

## §B1 Audio and haptic cues (M)

**Today.** Nothing widget-level. DWC itself plays M300 beeps (`stores/machine.ts` → `utils/beep.ts`), but creates a new
`AudioContext` per beep and isn't part of the plugin API, so FL can't reuse it.

**Design.**
1. `util/sound.ts`: one lazily created shared `AudioContext`, resumed on the first user gesture (browsers block audio
   until then — the module listens for the first `pointerdown`/`keydown` once); `playCue(name, volume)` with a small set of
   named cues built from oscillators (`chime`, `double`, `alarm`, `error`). No audio files, so nothing to bundle or fetch.
2. **Per-device settings** (localStorage, *not* the shared document): master mute, volume, and a **Test sound** button, in
   Settings > Flexible Layouts. A device that should be silent (a workshop tablet) is silent without touching anyone else.
3. **Global event cues** (work on any page, like `autoBackupNudges.ts`, installed once and torn down on
   `dwcPluginUnloaded`): job finished, job cancelled/halted, pause requested by the firmware, filament error, heater fault,
   `M291` message box appears. Each is a checkbox with a cue picker. Implemented as edge detectors over
   `state.status` / `sensors.filamentMonitors` / `heat.heaters[].state` / `state.messageBox` — **rising edge only**, never
   level-triggered.
4. **Per-widget cues:** add an optional `sound` effect to `ConditionRule` (alongside colour / hide / disable) and to the
   alert widget: fires when the rule *becomes* true, with an optional "repeat every N s while true" (default off, capped).
5. **Haptics:** `navigator.vibrate` where it exists (Android Chrome/Firefox; not iOS Safari). Optional per-button "haptic
   tap" and a haptic pattern for the same global events. Feature-detected; the switch is hidden, not broken, elsewhere.

**Safety / degradation.** Cues never send commands. A hidden tab still receives model updates (DWC polls), so job-finished
still fires, subject to the browser's timer throttling; state this in the help text rather than promising real-time.
`AudioContext` still suspended (no gesture yet) → the settings page shows "click anywhere once to enable sound".

**Tests.** Stub `AudioContext` and `navigator.vibrate`; unit-test the edge detectors (no re-fire on steady state, fires once
per transition); test mute/volume; test the condition `sound` effect fires once per rising edge.

## §B2 Keyboard shortcuts on buttons (M)

**Today.** The only global handler is `FlexPage.vue`'s Ctrl+Z / Ctrl+Y in edit mode; console inputs handle their own keys.

**Design.**
- `hotkey?: string` on the command button and toggle widgets (canonical form, `Mod` = Ctrl on Windows/Linux, ⌘ on macOS,
  e.g. `Mod+Shift+H`, `F7`).
- One dispatcher, `model/hotkeys.ts`, installed by `FlexShell` (a single `keydown` listener). Widgets **register on mount and
  unregister on unmount**, so only widgets on the visible page (plus header widgets) respond — no stale bindings from other
  pages.
- **Activation reuses the widget's own click path** (`defineExpose({ activate })` or an `activate` callback registered with
  the dispatcher) so confirm dialogs, debounce, print lock, access lock and `disabled` conditions all apply unchanged. A
  hotkey on a locked widget is a no-op with a brief "locked" toast, never a bypass.
- **Never fire when:** focus is in an input/textarea/select/contenteditable or a CodeMirror/Monaco editor; a dialog/overlay is
  open (`.v-overlay--active`); the event is a key-repeat; or edit mode is on (configurable — default off while editing).
- **Recorder field** in `PropertiesDialog.vue` (focus it, press the combo). Requires a modifier or an F-key, and rejects
  browser/OS-reserved combos (Ctrl+W/T/N/R/L/Tab, F5, F11, F12, Alt+F4, ⌘Q…). Duplicate combos on one page are flagged in
  the dialog. An optional small key badge on the button in view mode.
- **Deliberately not in v1:** binding the emergency-stop widget. The e-stop must stay a deliberate, visible action; revisit
  only on request.

**Tests.** Dispatcher pure tests (canonicalisation, reserved-combo rejection, duplicate detection); mount test that a
registered widget activates via the combo, does nothing under print-lock/access-lock/disabled, and unregisters on unmount;
input-focus and dialog-open suppression.

## §B3 Tabbed and collapsible containers (L)

**Today.** The `group` widget is one titled mini-grid (`items`, `cols`, `rowHeight`, `layoutMode: grid|free`), edited by
`GroupEditor.vue` and rendered by `GroupWidget.vue` via a nested `FlexGrid`.

**Design.**
- **Step 0 — a child-walker refactor (prerequisite, S).** `document.ts` currently special-cases `type === "group"` in at
  least three places (child visiting ~1721, child collection ~1752, deep-clone/id-regeneration ~1818), and
  `dependencies.ts`, the access/print-lock walkers and `sanitizeRuntimeFields` follow the same pattern. Introduce one
  `childItemLists(widget)` helper and route them all through it, *first*, with no behaviour change. Otherwise a new
  container type silently breaks export dependency capture, id regeneration on import and lock propagation.
- **New widget type `tabs`** (not an overload of `group`, because group export/import and `.dwcpanel.json` rely on `group.items`
  being a single list):
  `{ type: "tabs"; title?; tabs: Array<{ id; title; icon?; items; showWhen?: ConditionRule }>; cols?; rowHeight?; tabPosition?: "top"|"bottom"|"left" }`.
  Reuse `GroupEditor.vue` per tab (parametrise it to edit one item list). A tab's `showWhen` reuses `ConditionRule`, so a
  "Probing" tab can appear only in CNC mode.
- **Which tab is open is per-device** (localStorage keyed by item id), not saved in the shared document.
- **Collapsible:** additive `collapsible?` on `group` and `tabs`; the header toggles. Collapse is view-only state (per-device)
  and must reflow the panels below the way `autoHeight` already does — investigate `autoHeight`'s reflow path in
  `FlexPage.vue` first; if it can't be reused cleanly, ship tabs first and collapse second.
- Phones: tabs are the natural fix for a crowded phone layout; make the tab bar scroll horizontally.

**Risks.** Nested grids inside tabs multiply the existing FlexGrid ↔ WidgetView ↔ GroupWidget cycle (already broken by
`defineAsyncComponent`); keep the same pattern. Inactive-tab content should not run pollers (chart/webcam) — render lazily
and unmount on hide, with `v-show` only for cheap widgets.

**Tests.** Child-walker equivalence tests on existing group fixtures (must pass before the new type exists); tabs export →
import round-trip regenerates every nested id; `showWhen` hides a tab; smoke test mounts the default `tabs` widget.

## §B4 Copy and paste of widgets across pages (S–M)

**Today.** Multi-select exists (`selectedIds`), `duplicateItem` copies within a page, free-slot placement already drops new
panels into gaps (`FlexPage.vue` ~879), and single panels/pages export to `.dwcpanel.json` / `.dwcpage.json` with plugin
dependency capture (`dependencies.ts`, `io.ts`).

**Design.**
- `model/widgetClipboard.ts`: an in-memory clipboard **plus** a tagged JSON envelope
  `{ flexibleLayouts: "clipboard", version, items: GridItemModel[], requires: [...] }` written to the system clipboard so a
  paste also works across browsers, profiles and machines — and a stray paste into a text box is readable JSON.
- **Use the DOM `copy` / `cut` / `paste` events** (`e.clipboardData.setData/getData`), not the async Clipboard API: they
  work without a permission prompt **and over plain HTTP**, where `navigator.clipboard` does not exist. Ctrl+C/X/V (and Ctrl+D
  for the existing duplicate) act in edit mode only and never when focus is in an input.
- Toolbar **Copy / Cut / Paste** buttons for touch devices (no keyboard), plus a "Paste from text…" fallback dialog.
- Paste regenerates every id (deep — groups and `tabs` after §B3 Step 0), keeps the relative layout of a multi-selection,
  places it in the first free slot, selects the pasted items, and lands as **one undo step** (`commit()`).
- Copying from a breakpoint variant copies that variant's geometry; pasting into another breakpoint uses the destination's
  own placement. Missing plugin dependencies use the existing "missing plugins" import warning.
- Stretch: "Move/copy to page…" in the item menu, using the same paste path.

**Tests.** Clipboard round-trip; deep id regeneration; single-undo-step; paste over HTTP path (event-based, no
`navigator.clipboard`); multi-select relative layout preserved.

## §B5 Automatic profile switching (M — needs one decision first)

**Today.** Profiles live in `plugins.flexibleLayouts.profiles` with an `activeProfile` pointer (`model/store.ts`);
`switchProfile()` tears down and re-registers custom-page routes and re-applies the theme; a header quick-switcher and a
profile-switch widget exist; `wantsCncLayout()` already reads machine mode for the seeders.

**The decision.** `activeProfile` is part of the *shared* document, so two browsers on the same board share it, and an
auto-switch would (a) flip every connected client and (b) rewrite the settings file on every change, with two clients able to
ping-pong. Two options:
1. **Recommended:** keep the shared pointer as the *default*, and add a **per-device "showing profile" override**
   (localStorage) that auto-switching writes. Manual quick-switch keeps writing the shared pointer as today.
2. Make manual switching per-device too. Simpler model, but a behaviour change for existing users.

**Design (with option 1).**
- Rules live on the profile: `meta.autoSwitch?: { on: "machineMode"; value: "FFF"|"CNC"|"Laser" } | { on: "printing" } | { on: "condition"; rule: ConditionRule }`
  (reuse `util/conditions.ts`). First matching profile in profile order wins.
- **Edge-triggered, not level-triggered:** evaluate when the machine mode changes or a print starts/ends, so a manual
  switch afterwards sticks until the next edge. Optional "return to previous profile when the print ends".
- Per-device master switch; the profile manager shows which rule is active and a "why did it switch" line.
- Post-switch: if the current route doesn't exist in the target profile, redirect to `startupPath` or `/`.
- Access lock: switching is system-initiated, so it intentionally bypasses the Admin-only manual switch — that is the point
  for kiosk tablets. Say so in `docs/access-levels-design.md`.

**Tests.** Rule matching and first-match order; edge-only firing (no flip-flop); manual switch not overridden until the
next edge; route fallback; no shared-document write in option 1.

## §B6 Fullscreen and kiosk mode (S–M)

**Today.** Nothing. `FlexShell.vue` owns the app bar and drawer and already has an `editModeToggle`-style header widget
pattern.

**Design.**
- **Fullscreen widget** (header or page): `documentElement.requestFullscreen()` from the click (a user gesture is
  required), synced to `fullscreenchange`. Hidden where unsupported (iPhone Safari has no element fullscreen; iPad does).
- **Kiosk mode** (per device): hides the app bar and drawer, leaving a small floating exit control; entered from a widget or a
  `?kiosk=1` query (persisted for the session). **Leaving kiosk honours the access lock** — with Observer/Operator lock
  enabled, exit asks for the password, so a wall display can't be un-kiosked by a passer-by.
- **Keep screen awake:** the Screen Wake Lock API, re-acquired on `visibilitychange` (locks drop when the tab is hidden).
  **It is secure-context only**, so on the usual plain-HTTP DWC it is unavailable — the switch shows a disabled state with the
  reason and a pointer to TLS setup (FL's own TLS helper) rather than silently doing nothing. A hidden-video "NoSleep" hack is
  deliberately rejected (battery cost, brittle).
- Suggest "Add to Home Screen / install as app" in help text for phones, where fullscreen is otherwise unavailable.

**Tests.** Stub `requestFullscreen` / `wakeLock`; assert feature-detected hiding, the exit gate under access lock, wake-lock
re-acquire on visibility, and that kiosk state is per-device (not in the document).

## §B7 Starter layouts (M, mostly content)

**Today.** `model/presets.ts` has one preset (`loadCncPreset`); the page seeders in `builtinPages.ts`
(`dashboardSeed`, `jobStatusSeed`, `statusBarSeed`) already know FFF vs CNC; the import dialog has a "Sample layouts"
section, a "Browse gallery" and a community-gallery link.

**Design.**
- Turn presets into a **registry**: `{ id, titleKey, descKey, icon, mode: "fff"|"cnc"|"laser"|"any", build() }`, with
  `loadCncPreset` becoming one entry.
- Add: **FFF printer dashboard**, **Print monitor** (large progress ring, thumbnail, times, webcam, e-stop — the natural
  companion to §B6 kiosk mode), **Touchscreen simple** (big command buttons for home/preheat/cooldown/fans), **Laser**.
- A picker replacing the single "Add sample CNC page" button, with live previews reusing `useWidgetPreviewFrame`
  (already shared by the palette and What's New); and a **"Start from a starter"** step in the first-run welcome dialog, pre-
  selecting by `wantsCncLayout()`. Optionally "create a profile from this starter".
- Presets create a new page, never modify existing ones (keeping the additive rule the file already states).

**Tests.** A registry test that every widget type used by every preset exists in the catalogue and mounts (extend
`widgets.smoke.test.ts` to iterate presets); each preset builds a valid document (`migrateDocument` no-op); page slug clash
handling still works.

## §B8 Accessibility (L, incremental — start the harness first)

**Today (measured, heuristically).** ~123 icon-only `v-btn`s, ~35 with no `aria-label`/`title` (12 in `PropertiesDialog.vue`);
6 SVG click targets (jog sectors, octopus, shaped buttons, hotspots) with no keyboard access; `role`/`tabindex` in only
`FlexShell.vue` and `Display12864Emulator.vue`; edit-mode drag/resize is pointer-only.

**Design, in order.**
1. **Harness first (S), so everything else and every other feature in this plan is checked.** `axe-core` in Vitest over the
   existing "mount every widget with defaults" smoke test, asserting no critical/serious violations with an **allowlist that
   may only shrink** (the same ratchet idea as the coverage thresholds). happy-dom has no layout, so the colour-contrast rule
   is off there and runs in the Playwright e2e (`@axe-core/playwright` against `e2e/mock-duet`).
2. **Names for icon-only controls (S).** Fix the ~35; add a small script to fail CI on a new icon-only `v-btn` without a name.
3. **Keyboard operability of SVG/shaped targets (M).** `role="button"`, `tabindex="0"`, `aria-label`, Enter/Space, visible
   `:focus-visible` ring; roving tabindex for the jog rings so a pad is one tab stop, arrow keys pick a ring.
4. **Keyboard alternative to drag in edit mode (M).** Select an item with Enter; arrows move by one cell, Shift+arrows resize,
   Esc drops; each step announced via an `aria-live` region. (`grid-layout-plus` is pointer-only, so this drives the same
   item model directly and goes through `commit()` for undo.)
5. **Don't rely on colour alone (S).** The status indicator, indicator grid and heater state must carry text/icon as well as
   colour; alert widgets get `role="alert"` (error/warning) or `role="status"` (info/success); message-box widget likewise.
6. **Contrast guard in the colour picker (S).** Warn when a chosen text/background pair falls under 4.5:1 (extend `util/color`).
7. **Reduced motion and focus return (S).** Audit remaining transitions against `prefers-reduced-motion` (the hub already
   honours it); verify focus returns after dialogs close.
8. **Docs (S).** A keyboard map and an accessibility statement in the help dialog and `docs/usage.md` (which becomes
   more useful once §B2 exists).

**Tests.** The axe harness itself; unit tests for keyboard handlers (Enter/Space activate, arrow roving); a test that the
icon-name script flags a bad fixture.

---

# Suggested order

1. **§A0** (docs/stale comment) and **§B8 step 1** (a11y harness) — small, and they protect everything after.
2. **§B4** copy/paste (S–M) — high daily value, and Step 0 of §B3 can land with it.
3. **§B7** starter layouts, **§B6** fullscreen/kiosk — they pair (a "Print monitor" starter wants kiosk mode).
4. **§B2** hotkeys, **§B1** audio/haptics.
5. **§B3** tabs (after its child-walker refactor is merged and green).
6. **§B5** auto profile switching, once the per-device-override decision is made.
7. **§A1**, **§A2**, then **§A5**; **§A4** only on demand.
8. **§B8 steps 2-8** continuously, alongside the above rather than as a block at the end.

# Open questions

1. §A5 — is an unattended-script generator in scope for a layout plugin, and should it live in `dwc-config-backup-core`?
2. §A1 — confirm strict-`idle` only (recommended), or also `paused`?
3. §B5 — per-device "showing profile" override (recommended) or make manual switching per-device too?
4. §B2 — allow a hotkey on the emergency-stop widget? Recommended no for v1.
5. §B3 — is collapse needed at all once tabs exist, or is tabs alone enough? (Collapse is the riskier half.)
6. §B1 — should global event cues be on by default, or opt-in per event? Recommended opt-in: sound from a machine nobody is
   expecting to make noise is a bad surprise.
