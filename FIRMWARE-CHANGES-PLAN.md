# Firmware-change notifications — plan

Status update (2026-10-01, after the line-by-line read of the 293 by-note commits and M669's per-kinematics letters): **D3 is finished and E6's `M669` item is done.** Every by-note commit was read as a
diff against the RRF clone and compared against the 3.6.3 and rc.2 trees; `docs/rrf-triage/d3-line-by-line.md` in core says what was read in full and what only surface-scanned (the motion-maths files, vendored lwIP,
one TMC51xx table builder), so a purely numerical change there is still invisible. It found real misses: a **bare `M116` waits for every tool** now and the colon-list `P` was pinned a build late from the wiki;
**`M221`** can rescale already-queued moves (rc.1); **`M950 J`** accepts `fmN.switch|motion` and `probeN` virtual inputs; `boards[0].firmwareDate` carries the time; `M552 T1` on WiFi moves the cert/key from the SD into the module and
deletes the SD copies; `M906` over-limit currents are reported as errors (dictionary only: the maximum is per driver); and a set of object-model dates the mirror had wrong (eleven deprecations dated 3.6.3 so they could never fire, `gCommandNumber`,
`boards[].timeout`, `move.currentMove.filePosition`, the load-cell, `filamentPresent`, `agc` and `drivers[].config` paths; `move.motionSystems[].currentMove.filePosition` is not served by RRF at all and is gone). **Schema:** `selectorVariants` on a command, and
`whenCompanion`, `whenElements`, `alsoAbsent` and a `*` prefix for `whenValue` on event targets; M669 `K6` (Hangprinter) and `K9` (five-bar SCARA) letters are enumerated with their events. Core suite green (55 files, 2438 tests), `npm run typecheck` clean, release audit
0 DIFFs on 145 citations. **Not done / still true**: value-level changes need a hand-written event and a commit can still hide one in a shared helper; `widening` and per-board hardware changes are recorded, not evented; core 1.33.0 / editor 0.15.0 are not published and nothing is committed in any repo.
FL side: only `CLAUDE.md` (the "still partial" note).

Status update (2026-09-30, after the hand reads of the last 24): **282 of 282 commands `historyChecked` - E7 is finished.** Each of `M665/M666/M669`, `G0-G3`, `G68`, `M109`, `M122`,
`M150`, `M309`, `M567`, `M568`, `M571`, `M585`, `M675`, `M569.2`, `M569.9` and `M573/M650/M651/M900/T` was read at rc.2 and its parameter-reading lines hashed at all 18 tracked
builds (a moved hash was read as a diff). That found **real misses** and fixed them in core (uncommitted): `G2`/`G3` `S`+`P`, `M567 E` (every real M567 line was flagged), `M568 F`+`A`,
`M665 D`, `M669 S`/`T`, and `M122`'s `S C A R V T W`; and two wrong facts: `M568` does not take per-axis offsets (`G10` only) and `M669` flagged every Core-kinematics axis row
(`X1:1:0 Y1:-1:0`), now a documented catch-all. **One new event**, `m569-2-bare-reports-waveform` (rc.1): the required-ness change that had kept `M569.2` unchecked - a bare
`M569.2 P<driver>` was an error at 3.6.3 and on a TMC51xx/TMC2240 driver now reports the waveform corrections (fixture added). `M569.9` is fork-only and absent from Duet3D's
firmware at all 18 builds, so it is checked for the Duet3D window with no `since`/`until`. **What "282/282" does not mean**: `M669`'s per-kinematics letters (Hangprinter `F`/`B`/`P` from
beta.2, five-bar SCARA `D` 2-or-4 values) are not enumerated or evented (E6); value-level changes still need hand-written events; the ~250 by-note triage commits were skimmed, not read line
by line (the one D3 item left). Core suite green (50 files, 2373 tests), typecheck clean, `HISTORY_CHECKED_FLOOR` 282. FL side: only the count in CLAUDE.md. Still needs you: publishing
core 1.33.0 / editor 0.15.0 (so `DWC_DIR=... npm run typecheck`/`verify-build` mean anything), and committing - nothing is committed in any repo.

Status update (2026-09-30, after the second fractional-code pass, with Duet3Expansion and CANlib cloned): **258 of 282 commands `historyChecked`** (was 227 of 281;
`M576.1` entered). Cloned beside the RRF checkout for this: `../Duet3Expansion` (tags 3.6.3 ... 3.7.0-rc.1) and `../CANlib` (tags 3.6.3, 3.7.0-beta.3, rc.1, rc.2) - the
closed-loop letters are CANlib's `M569PointNParams` tables plus the expansion's parsers, neither of which RRF contains. Real misses fixed: **`M970.3` had no `since`** - it is
new in rc.1 (RRF `6544cc727`, 2026-08-21; `ConfigureStepMode` at 3.6.3 has only fractions -1/1/2), so a scan said nothing about it on 3.6.3, and it listed only `P`
where `S`/`J`/`O` are read; **`M569.1 B`** (standstill deadband) is new in rc.1 (Duet3Expansion `7f7fb7f7` + CANlib `b51d61e`); **`M576.1`** is dated alpha.4 (the
previous note said beta.1). Wrong descriptions fixed: `M569.3`/`M569.8` are Hangprinter-only ODrive calls over the secondary CAN interface (`DUAL_CAN` builds), not closed-loop
board commands, and `M260.3`'s Nordson branch does use the shared `B`/`S` data; letters the shared `M260`/`M261` prologue reads were missing (`S` on `.1/.3/.4`, `B` on `.3`, `V` on
`M260.4`/`M261.1`/`M261.2`; `M569.3 S`, `M569.4 V`). Confirmed unchanged by hashing the parameter-reading lines at all 18 tracked builds: `M260.2`, `G38.2-.5`, `G59.1-.3`,
`M201.1`, `M505.1`, `M586.4`, `M36.1/.2`, `M970/.1/.2`, `M569.5-.7`, `M73`. **Still unchecked (24)**: `M569.2` (required-ness of `R` changed, E6), `M569.9` (gloomyandy fork only),
and the handlers the tools cannot follow (`G0-G3`, `G68`, `M109`, `M122`, `M150`, `M309`, `M567`, `M568`, `M571`, `M585`, `M665`, `M666`, `M669`, `M675`) plus the no-dispatch entries
(`M573`, `M650`, `M651`, `M900`, `T`). Core suite green (50 files, 2366 tests), typecheck clean; two new boundary tests and the new floor are mutation-checked. The two new generated
event ids (`dict-M569.1-B-added`, `dict-M970.3-added`) are not in `test/fixtures/event-ids.json` on purpose: that file lists ids a PUBLISHED core has shipped (1.32.0). FL side
untouched (only this note and the count in CLAUDE.md). Not done, and needs you: publishing core 1.33.0/editor 0.15.0 (so `DWC_DIR=... npm run typecheck`/`verify-build` can mean anything),
and committing any of it (nothing is committed in any repo). Next data work if you want it: the `M665/M666/M669` kinematics handlers and `M150/M309/M571/M585/M675`, each a hand read.

Status update (2026-09-30, after the first fractional-code family batch): **227 of 281 commands `historyChecked`** (was 219) and one real catalogue
miss fixed. Fractional codes need their own read because they share the integer code's `case` (the param-history tool's evidence for them is COARSE, and
says so). Two signals did the work: `HandleMcode`'s fractional allow-list (`GCodes2.cpp:730-750`, which decides whether `Mx.y` is a command or a macro
lookup) per release, and a per-release hash of the fraction's handler function (an unchanged hash means the fraction cannot have changed). Result: the
**M558.1-.4** and **M587.1/.2** entries are confirmed; **M581.1 was wrong** - it had no `since`, but 581 is not in the allow-list at 3.6.3, so it ran a
macro file there and is new in 3.7.0-alpha.2 (RRF `489a47c43`); it now has `since` and a generated event `dict-M581.1-added`. `M581` and `M581.1` were also
missing `R` (the enable condition), and `M581` is now checked. Boundary tests and mutation checks are in core's `diagnostics.test.ts`/`releases.test.ts`;
core suite green (50 files, 2359 tests), FL suite green (170 files, 2370 tests; an earlier all-171-files failure was FL's suite running while core's did,
not a code fault). **Found, not entered:** `M576.1` (USB SBC mode, beta.1) has no dictionary entry; `M970`'s fractional gate gains
`SUPPORT_CAN_EXPANSION` at rc.2. **M569.x, partly:** `M569.2`'s `S`/`J`/`O` are dated rc.1 (they were undated), and `M569.4` turned out to be torque mode with an undocumented `T` (its
summary said "target position"); both have tests that fail under mutation. The rest of the closed-loop family (`M569.1/.3-.9`) cannot be settled from the RRF clone: the
letters live in Duet3Expansion's `ClosedLoop` and CANlib's `M569Point4Params`, **neither is cloned on this machine** - clone them (or say where they are) before those are
marked. **Still to do in this family pass (handler hash moves, so each is a diff read):** `M260.x`/`M261.x`, `G38.x`, `M201.1`, `M505.1`, `M586.4`, `M36.x`, `M970.x`, `G59.x`. Method and open list are in core's CHANGELOG "Unreleased".
FL side untouched. Not done, and needs you: publishing core 1.33.0/editor 0.15.0 (and so `DWC_DIR=... npm run typecheck`/`verify-build`, which cannot be meaningful
until the DWC checkout can install `dwc-gcode-core` 1.33.0). Nothing is committed in any repo.

Status update (2026-09-30, after D3 step 3): **the wiki `Gcodes.md` pass is done and found a real break the scanner could not see.** Every wiki phrase
naming 3.6.3-or-later/3.7 (81 lines) was set against `CHANGES` and the dictionary's `since`/`until`; the misses were all one kind, a change to which VALUE of an
existing parameter is accepted. `M558 P3` (the "alternate analog" probe) is an error since rc.1 (RRF `b28569a1d`) and 3.6.3 accepted it; the dictionary's P
description said so but no event did, so a scan reported nothing. Core (uncommitted) now has `whenValue` on `parameter` targets (`schema.ts`, `impact.ts`:
numeric/quoted-text literal compare, never an expression) and four events: `m558-p3-removed` (rc.1), `m558-p12-load-cell` (beta.3), `m574-s5-encoder-endstop`
(rc.1), `m308-bme68x-added` (alpha.3); mutation-checked, real-file fixtures added, core suite green (50 files, 2357 tests). Also recorded in
`docs/wiki-discrepancies.md`: the wiki's "P2/P5 deprecated from 3.7.0" is not in the firmware (only P3 changed). **FL needs nothing**: a `whenValue` finding is an
ordinary `ImpactFinding` on the parameter's span, and the events are detectable, so the footer count is unchanged; FL picks them up with the next core bump.
A lesson for the pin rule: `git describe --contains` dated the BME68x event to beta.1 but the commit is in the tracked alpha.3 build; the audit
(`audit-releases.mjs --events`, `test/releaseAudit.test.ts`) does catch that, but it reads `dist/`, so it is blind until `npm run build` is re-run (noted in
`d3-second-look.md`; making the test build first is not done). Still not done: the ~250 by-note commits line by line, the fractional codes, the 62 unchecked entries, publishing core/editor (needs your
go-ahead). Nothing is committed in any repo.

Status update (2026-09-30, after D2/D3): **D2 is done and D3 step 2 found real misses.** `scripts/split-triage.mjs` re-slices the two closed range documents into `docs/rrf-triage/per-release/` (777 items, 17 releases, closure carried by SHA) and `--check` confirms no event is pinned earlier than its commit's release (0 DIFFs); `rrf-triage.mjs --per-release` starts a future range that way. The second look at the ~293 commits closed only by a section note (method and limits in `dwc-gcode-core/docs/rrf-triage/d3-second-look.md`; about 25 read as diffs, the rest filtered or skimmed, **not** line by line) found changes a config/macro file would notice and the catalogue did not have: on a Duet 3 main board `M575 P1` is now the SECOND USB channel and the PanelDue UART moved to `P2` (same for `M260.1-.4`/`M261.1-.2`, events `m575-p-channel-numbering`, `aux-port-numbering-*`, alpha.2); an absolute G0/G1 beyond the M208 limits now errors on a 3D printer where 3.6.3 clamped it (`axis-limit-absolute-moves-error`, informational and not detectable, alpha.2); `m574-k-range-checked` (rc.1); `g68-bare-reports-rotation` (beta.3). The reviewed `M564 R` description was nearly backwards and is fixed. Core suite green (49 files, 2328 tests). FL side untouched this round; FL's 'undetectable' footer now counts one more event. Still not done: the other ~250 by-note commits line by line, D3 step 3 (a full wiki `Gcodes.md` pass), the fractional codes, the 62 unchecked entries, and publishing core/editor (needs your go-ahead). Nothing is committed in any repo.

Status update (2026-09-30, after batch 3): **219 of 281 commands `historyChecked`** (was 210); core suite green (2313), `HISTORY_CHECKED_FLOOR` raised
to 219. Seven of the "left unchecked" entries were settled by reading the source: **M36, M600, M601, M997** were false positives (M36's `P`/`S` belong to
M36.1/.2, which list them; M600/M601's `P` is read only for code 226; M997's `A` sits under `ALLOW_ARBITRARY_PANELDUE_PORT`, which defaults to 0 and is
never enabled, so it is dead code in every release); **M588** reads only `S` (the rest belong to the shared `HandleWiFiCode` cases); **M25** and
**M673** were genuinely incomplete and gained `P` (`M25 P0` -> deferred `M226 P0`, present from 3.6.3) and `S` (correction factor, present from 3.6.3); and **M260/M261**
gained `V` (the result-variable name, read through `GetResultVariable`, which the letter tool cannot follow - checked by hand at 3.6.3, alpha.2, beta.1..rc.2, and
introduced before 3.6.3 by `86388be1c`; their `P`/`R`/`F` are the Modbus fractions, which have their own entries). **Still unchecked on purpose (62):** M122 (the
extra letters belong to `DiagnosticTest`'s developer-only P values, a value-dependent set the dictionary cannot express - E6), M665/M666 (kinematics-dependent
letters), the handlers the tools cannot follow, the fractional codes and the no-dispatch entries listed below. M260.4/M261.1 do not yet list `V`. Not done: D2, D3,
the fractional codes, publishing core/editor (needs your go-ahead). FL side untouched this round; `DWC_DIR=../DuetWebControl npm run typecheck` still cannot run
meaningfully because that checkout has `dwc-gcode-core` 1.32.0 and 1.33.0 is not published to npm.

Status update (2026-09-30, latest of all): **E7 batch 3 done for everything two independent signals agree on - 210 of 281 commands are
`historyChecked`** (was 51). How: `dictionary-param-history.mjs` (listed letters read at each of 18 tracked releases; its extra-letter check was
also fixed - it had been switched off for any command with `axisParameters`, which hid M557's missing `P`/`S`/`R`), the new
`dictionary-handler-drift.mjs` (parameter-reading lines compared at every release), and a read of all 294 parameter-reading lines that changed
between 3.6.3 and rc.2 (`git diff -U0`), each assigned to a command; a command touched by that diff was settled by hand or left out. Data changes:
`G29 P`, `M400 S` and `M557 P/S/R` added (M557's axis range also no longer claims a "spacing" third value); `M26 C` since beta.2; `M572 L` since alpha.4;
`M576 B/D` since alpha.4 and `F` until beta.3 (removed by RRF `ff4192015`); `M953` since alpha.5 (it was a stub returning `errorNotSupported`) with `K` added
and `U`/`K` corrected to optional; `M301/M304/M408` verified against their `until`. `M666` and `M673` were marked then unmarked: they read letters the entry does not
list. **Left unchecked on purpose (71):** entries missing letters the handler reads (M122, M260, M261, M25, M36, M588, M600, M601, M665, M666, M673, M997: go through
`docs/dictionary-param-history/remainder.md` "Read by the handler but not in the dictionary"); handlers the tools cannot follow (G0-G3, G68, M109, M150, M309, M567,
M568, M571, M585, M669, M675); fractional codes and the fractional additions the integer case hides (`M576.1`, `M581.1`, `M970.3`; M581 and M970 themselves are
unmarked for that reason); and the no-dispatch-case entries (M573, M650, M651, M900, T). Earlier marks the stricter extra-letter check still flags, all read
and judged false positives from case bodies shared with another code: G10 F (M568 only), M205 P (M566 only), M913/M917 I/T (M906), M587/M589 (shared `HandleWiFiCode`), M671 (kinematics `Configure`),
M569 (fractional), M572 K (existed only at alpha.4). **M950 D is unverified** - `Platform::ConfigurePort` does not read it, so the tool's source is another function. FL side
unchanged since the last update; core suite green (2313). Still not done: D2, D3, the fractional codes, batch 3's 71 leftovers, publishing core/editor. Nothing is committed in any repo.

Status update (2026-09-30, latest): **E7 batch 2 started - 51 of 281 commands are `historyChecked`** (was 36). Newly confirmed against RRF
source at 3.6.3 and rc.2, letter by letter: G28, G30, G32, G92, M106, M107, M116, M291, M292, M401, M402, M409, M501, M98, M99; none of them
changes existence across the window. Candidate report: `dwc-gcode-core/docs/dictionary-param-history/homing-macro.md`. **Deliberately left
unchecked: G29 and M400** - their handlers read a letter the dictionary does not list (G29 `P`, the height-map file name for S1/S3; M400 `S`),
so the entry is incomplete rather than merely unverified; add the parameters (with citations) first, then mark them. G30 `K` showed as "never
read" in the tool but is read through `SetZProbeNumber(gb, 'K')` in `ExecuteG30` at both releases (the tool cannot follow that helper) - a
reminder that a "never read" flag needs a hand check, not a removal. Still not done: batch 2's leftovers, batch 3 (the rest, about 230), the
fractional codes, D2, D3, and publishing core/editor. FL side: full suite green except 3 load-induced failures (`a11y` wcsTable/probe timeout,
`fullPage`) that pass when those two files are run alone; typecheck and `verify-build` not run (need `DWC_DIR`). Nothing is committed in any repo.

Status update (2026-09-30, later): core 1.33.0 (A) is committed and pushed to `dwc-gcode-core` `main` (not tagged or published). D and E
have a first pass in the same working tree, **uncommitted**, under CHANGELOG "Unreleased": release table and pin rule (D1), object-model
alpha.2 data (D4), detectability classification (D5), per-release fixtures and the partition property (D6), the E1/E2/E3 contracts and tools,
and the first E7 batch (36 of 281 commands `historyChecked`). Not done: D2 (per-release triage documents) and D3 (second look at the "no
effect" triage items), E4/E5 for the remaining 245 commands, and every fractional code (`M569.1`, `M558.x`, ...). The pass corrected several
published facts - see the "Wrong facts removed" entry there (M140 H, M221 F, M574 E, M959). Original status follows.

Status (2026-09-30): **code built, data work not started.** Workstreams A (core 1.33.0), B (editor 0.15.0) and C (FL) are implemented and
tested locally against `npm pack`s of the two libraries; **nothing is committed, tagged or published**, and FL's `package.json` already
names the two unpublished versions (run `npm install` after publishing to refresh the lockfile). Workstreams D (per-release catalogue
accuracy) and E (dictionary `since`/`until`) are **not started**: they need the RRF clone (§3) and human verification against source, and
must not be faked. What the UI can already say honestly is what `undetectable` reports. Departures from the text below: the pre-flight
also sets the editor's squiggle range; `release/*` gained four rule ids (`removed`, `changed`, `deprecated`, `default-changed`) beside
`release/impact`; `impactOf`'s command/parameter spans are now absolute offsets (they were line-relative, a latent bug in the existing
`release/impact` diagnostic); `exists(#x)`/`exists(x[0])` are now detectable. Same convention as `MISSING-FEATURES-PLAN.md` and `CAM-LASER-PLAN.md`: grounded in the code as it
is today, phased, each phase shippable on its own.

**Goal.** When a machine's RepRapFirmware version changes (or is about to), tell the user which lines of *their own* `0:/sys` and
`0:/macros` files use a command, parameter, object-model path or syntax feature whose behaviour changed between the two versions -
in a report, as squiggles in the editor, and as a pre-flight in the firmware-update widget before they upgrade.

**Scope decisions already made (2026-09-30).**

1. The baseline firmware version and the acknowledged event ids are stored **machine-shared** (on the board), not per browser.
2. The plan covers **all three repos** - `dwc-gcode-core`, `dwc-gcode-editor` and FL - not FL only.
3. The plan also covers making the catalogue accurate **per release** from 3.6.3 to 3.7.0-rc.2, and bringing the command dictionary's
   `since`/`until` up to spec.

## 1. What exists today (verified)

| Piece | State |
| --- | --- |
| `dwc-gcode-core` 1.32.0 `releases/changes.ts` | `CHANGES` (160 events: roughly 37 hand-written, 115 generated from the object model, 8 from the dictionary), `changesBetween(from, to)`. Each event has a **stable id**, a `version`, `kind` (added/removed/changed/deprecated) and a `target` (command / parameter / objectModelPath / syntax / behaviour). |
| `releases/impact.ts` | `impactOf(doc, from, to)` → `{event, direction, line, start, end, message}`. Exact for command, parameter (incl. `whenAbsent`) and object-model targets; only two syntax features (`array-literal`, `array-concat`) are detectable; a `behaviour` target matches only if it names a `code`; anything else is silently skipped. |
| `stamp.ts` | Per-file "checked against rrf=X" comment. **Not** used for this feature: writing into `config.g` and macros is invasive and only covers files we saved. |
| `diagnostics/` | Has a `release` rule category and reads `CommandSpec`/`ParamSpec` `since`/`until` (`dictionary/not-available-on-firmware`). |
| `dwc-gcode-editor` 0.14.0 | Nothing calls `impactOf`. `liveCheck.ts`/`diagnostics.ts` pass only the *current* `firmwareVersion` to `diagnoseDocument`. |
| FL | `GcodeCmEditor.vue` passes the firmware version to that lint only. `FirmwareUpdateWidget.vue` knows the running version and the selected release. `model/configBackup/autoBackupNudges.ts` is the pattern for connect/idle-triggered toasts. |
| Catalogue coverage | Two triage passes: `3.6.3..3.7.0-rc.1` (504 items, closed) and `3.7.0-rc.1..3.7.0-rc.2` (64 commits, closed). Tags `rrf-3.7.0-rc.1` / `rrf-3.7.0-rc.2` exist. |
| Dictionary coverage | 280 commands, 628 parameters, all `reviewed`. **0** commands with `since`/`until`, **8** parameters with `since`, **0** with `until`, 16 commands with `deprecated`, 2 with `requiredSince`. |

Findings that shape the plan:

- **The RRF clone is not at the documented path on this machine** (`C:\Users\live\Documents\Github\RRFBuild\RepRapFirmware` does not
  exist). Every data task below needs one, so phase 0 sets it up.
- **`3.7.0-alpha.2` has no object-model data** (`OBJECT_MODEL_VERSIONS[alpha.2].hasData === false`), so 65 object-model events are all
  pinned to `beta.1` even where they arrived in `alpha.2`. Per-release accuracy needs this fixed.
- **Hand-written events are pinned correctly** (`git describe --contains`), but the two big triage passes were closed with section-level
  notes for the "no effect" majority. Nothing verifies that each event's version is a real release.
- **The dictionary cannot tell "checked, unchanged" from "not checked".** An entry with no `since` means "present at 3.6.3", but nothing
  records that anyone verified that. This must be fixed before the `since`/`until` work can be called done.
- **Event ids are a public contract once FL persists acknowledgements.** Anything that regenerates or migrates events must keep ids.

## 2. Architecture

```
dwc-gcode-core   RELEASES list, scanImpact(), impactToDiagnostics(), detectability, id-stability test, data
      ↓
dwc-gcode-editor impactDiagnostics() CM6 extension ("changed since 3.6.3" squiggles)
      ↓
FL               baseline+ack state → scanner → toast → report dialog → editor wiring → firmware-update pre-flight
```

Data work (§6, §7) runs in parallel with the code and ships as core minor/patch releases. **The catalogue is bundled**, so new data
reaches users only when FL bumps `dwc-gcode-core`.

## 3. Phase 0 - groundwork (0.5 day)

- Clone `Duet3D/RepRapFirmware` (full history, tags) somewhere stable; `git fetch --tags`. Update the path in
  `dwc-gcode-core/docs/tasks/README.md` and `scripts/rrf-triage.mjs`'s `DEFAULT_CLONE`, or make it `RRF_CLONE` env-driven.
- `git -C <clone> tag --list '3.6*' '3.7*' --sort=creatordate`: record the exact releases in the window (§6 step 1).
- Confirm with `gh auth status` that the triage script's wiki calls work.
- Find where `store.ts` persists `plugins.flexibleLayouts.document` in DWC's settings, so the new state can be a **sibling key**
  (`plugins.flexibleLayouts.firmwareChanges`), not part of the layout document: it must stay out of layout export, profiles, undo and
  the shared-document tests.

## 4. Workstream A - `dwc-gcode-core` API (release 1.33.0)

All pure, no I/O, `.js` import extensions, no runtime deps (CLAUDE.md rules 3 and 5).

1. **`src/releases/releases.ts`** - `RELEASES`: every release in the window (tag or build-only `+N`), with kind and date. It is the single
   source of truth: `OBJECT_MODEL_VERSIONS` and every `ChangeEvent.version` must be members (test).
2. **`src/releases/scan.ts`** - `scanImpact(files, from, to, options?)`:
   - `files: Array<{ path: string; text: string }>`; classify with `classifyFile` and skip non-G-code kinds (menu, board.txt, CSV, binary,
     print files).
   - Returns `ImpactReport { from, to, direction, byEvent: Array<{ event, occurrences: Array<{ path, line, start, end, snippet }> }>, byFile,
     totals, undetectable }`.
   - `options.acknowledged: ReadonlySet<string>` moves matching events into a separate `acknowledged` bucket instead of dropping them.
   - `undetectable`: events in range that `impactOf` can never match (see 4.4). The UI must show these so the report never reads as "all
     clear".
3. **`src/releases/diagnostics.ts`** - `impactToDiagnostics(findings)` → core `Diagnostic`s reusing the existing `release/*` rule ids.
   Severity tiers: `removed` → warning; `deprecated` → info; `changed`/`added(downgrade)` → info; `whenAbsent` parameter findings → info
   (they fire on every line that omits the letter). `array-concat` keeps its "only if both sides are arrays" wording. Add rule docs
   (`docs/diagnostics.md` is generated from `RULES`).
4. **`isDetectable(event)`** plus an audit script `scripts/audit-detectability.mjs` listing events `impactOf` cannot match, grouped by
   why (syntax feature without a matcher; `behaviour` without `code`). Each becomes either a retarget to a detectable target, a new
   matcher in `impact.ts`, or an explicit "informational" event.
5. **Event-id stability test**: a committed `test/fixtures/event-ids.json` snapshot; the test fails if an id present in a *published*
   version disappears or changes meaning. Adding is fine.
6. **Version-string handling test**: `changesBetween`/`scanImpact` accept a board's `3.7.0-rc.1(CAN0)`, STM32 `+N` builds, and versions
   outside `RELEASES` (e.g. `3.7.1`), ordering by `compareFirmwareVersions`.
7. Docs: README section, `docs/api.md` (`npm run build-api-doc`), CHANGELOG entry. Add the new subpaths to `package.json` `exports` and
   check `test/package.test.ts`'s root-exclusion rule and the `typesVersions` fallback (rule 8).
8. Gates: `npm run typecheck`, `npm test`, `npm run test:packaging`. Every test mutation-checked (rule 6).

## 5. Workstream B - `dwc-gcode-editor` (release 0.15.0)

Depends on A.

- **`src/impactCheck.ts`**: `impactDiagnostics(options)` → CM6 `Extension`.
  - `options: { getRange: () => { from: string; to: string } | null; path: () => string; isAcknowledged?: (eventId: string) => boolean; onFinding?: ... }`.
  - `getRange() === null` (or a non-G-code path) turns it off.
  - Uses `parseDocument` + `impactOf` + core's `impactToDiagnostics`, with `source: "rrf-changes"` so the host can tell these squiggles
    apart from ordinary errors.
  - Runs on load and after `fullDelayMs` like `liveCheck.ts`'s full pass, only up to `fullCheckMaxChars`. It does **not** join the
    single-line pass: `impactOf` is document-wide and a line alone cannot see an `M453` mode switch.
  - Diagnostic hover text: the event description, the version it changed in, and the citation. A hover action "Ignore this change" calls
    `onIgnore(eventId)`.
- Works with `gcodeLintUi()`; it must not clear or be cleared by the other linters (`setDiagnostics` only replaces its own source).
- Tests: on-load, edit-then-recheck, acknowledged filtered, large-file skip, range changes at run time.
- README, CHANGELOG, bump 0.15.0. FL then needs `dwc-gcode-editor` >= 0.15.0 (update CLAUDE.md's version note).

## 6. Workstream C - FL host

Depends on A (and B for C6). All new i18n keys go in `en.json` **and** `de.json` in the same change (`test/i18n.test.ts`). Use the `Edit`
tool carefully on `en.json` (see CLAUDE.md gotchas).

### C1. State - `src/model/firmware/changeState.ts`

- Shape: `{ enabled: boolean; baseline: string | null; acknowledged: string[]; lastScan?: { from; to; at; counts } }`, stored under the sibling
  DWC-settings key from phase 0. Machine-shared by construction.
- Pure `decideCheck(state, running)` → `"record-baseline"` (no baseline yet: store the current version, **stay quiet**), `"none"` (same
  version, or disabled), `"scan"` (differs). Only the **main board's** version counts (`boards[0]`; expansion boards are ignored, as in
  `FirmwareUpdateWidget`'s mixed-rig handling).
- Acknowledging a report sets `baseline := running`. Ignoring one event adds its id to `acknowledged`.

### C2. Scanner - `src/model/firmware/changeScan.ts`

- Lists `0:/sys` and `0:/macros` recursively, downloads text and hands it to core's `scanImpact`. Reuse `configBackup/machineIO.ts` if it
  already lists and downloads; otherwise the machine store's `getFileList`/`download` (remember the test kit does not implement
  `download()`, see CLAUDE.md's Testing section).
- Skips `gcodes/` (print files are not the user's config), files over ~1 MB, and non-G-code kinds.
- Concurrency of about 3, aborts when the connection drops, and runs only while the machine is **strictly idle** (same rule as the backup
  auto-run).
- In-memory cache keyed `path|size|lastModified`; a reconnect rescan re-reads only what changed. Memory only, never persisted.
- Parsing runs on the main thread in chunks that yield (core parses at about 0.01 ms per line, and these are small files). Only move it to
  a worker if measurement says so; `parseWorker.ts` is the unrelated geometry parser, so do not reuse it.

### C3. Trigger and toast - `installFirmwareChangeNudges()`

- Same shape as `installAutoBackupNudges`: install at plugin load, tear down on `dwcPluginUnloaded`, run on first connect **and** every
  reconnect (a firmware update reboots the board), with a cooldown so a flapping connection cannot spam.
- On `scan` with findings: one toast "3.6.3 -> 3.7.0-rc.2 affects N lines in M files", click-through to the report. On zero findings: no
  toast, and the baseline advances silently. The toast text still says "known changes", never "your files are safe".
- A firmware *downgrade* runs the same path with the direction reversed (`impactOf` already supports it).

### C4. Report - `src/firmwareChanges/FirmwareChangesDialog.vue` (+ Settings card)

- `attach` prop passed through to `v-dialog` (testability pattern in CLAUDE.md).
- Grouped by event: description, kind chip, the version it changed in, the citation, then the file:line list. Each line has an **Open**
  that goes to the Explorer at that line. Check what `ExplorerPanel`'s deep link supports; if it cannot take a line, add that as its own
  small change through `explorerSession`/`explorerPanes`, not a per-pane hack (CLAUDE.md's flat-rendering rule).
- Footer: "Checked against N known changes between X and Y (M more cannot be checked automatically)", with the `undetectable` list behind a
  disclosure. This is the honesty requirement from §8.
- Actions: **Mark all as reviewed** (baseline moves), per-event **Ignore**, **Copy report** (Markdown).
- Settings: enable switch, "Show changed-since warnings in the editor" switch, and a manual **Check now against version...** field for when
  no baseline exists or the user upgraded from a build FL never saw.
- Accessibility: the dialog and card go through `test/a11y/a11y.test.ts` patterns; icon-only buttons need `aria-label`
  (`scripts/check-icon-buttons.mjs`).

### C5. Pre-flight in `FirmwareUpdateWidget`

- When `selectRelease(r)` picks a release, run `scanImpact(cachedFiles, runningVersion, r.tag)` and show the result in the release row and
  in the confirm step. **It does not touch the baseline** (nothing has changed yet).
- Normalise release tags (`v3.7.0`, `3.7.0-rc.2`, gloomyandy's naming) to versions `compareFirmwareVersions` can parse; when a tag cannot
  be parsed, show "cannot check" rather than a wrong answer.
- Reuses the scanner cache, so selecting a release is instant after the first scan.

### C6. Editor wiring

- `GcodeCmEditor.vue` passes `impactDiagnostics({ getRange, path, isAcknowledged, onIgnore })`. The range is `baseline -> running` when a
  scan is pending and the setting is on, or the pre-flight range while a release is selected. Menu files and the Monaco path are excluded.

### C7. Tests, docs, release

- `changeState` decisions (first run, same version, upgrade, downgrade, disabled, `(CAN0)` suffix), scanner over `setFiles` fixtures with a
  cache-hit assertion and an abort test, toast wiring against a fake connect/idle sequence, dialog (mount closed, then open), pre-flight
  in `firmwareUpdateWidget.*.test.ts`, and an assertion that **the layout document is untouched**.
- `docs/usage.md` section; a CLAUDE.md architecture paragraph (state lives beside the document, ids are a contract, scan is idle-only).
- FL bump: `dwc-gcode-core ^1.33.0`, `dwc-gcode-editor ^0.15.0`; `DWC_DIR=... npm run typecheck` and `npm run verify-build`.

## 7. Workstream D - catalogue accurate for every release, 3.6.3 -> 3.7.0-rc.2

The goal: for *any* pair of releases in the window, `changesBetween(a, b)` returns exactly the changes that happened between them, and each
event carries the release it really first shipped in. Today's two passes are per-*range*, not per-release.

All work below lives in `dwc-gcode-core`; run it after phase 0.

**D1. Enumerate and pin the releases.** From `git tag --list`, write `RELEASES` (§4.1): expected 3.6.3, 3.7.0-alpha.2, beta.1, beta.2, beta.3,
rc.1, rc.2 plus any other tags found, plus the build-only ids already used (`3.7.0-rc.1+1`, `+2`, `+3`). Document exactly how a `+N` id
maps to a commit (it is not a tag), in `docs/rrf-triage/README.md`, so future builds are pinned the same way.

**D2. Per-release triage documents (re-slice, don't redo).**
- Add `scripts/split-triage.mjs`: reads the existing closed `docs/rrf-triage/*.md`, asks `git describe --tags --contains <sha>` for every
  item, and writes one document per adjacent release pair (`3.6.3..3.7.0-alpha.2.md`, `alpha.2..beta.1.md`, ...), **carrying each item's
  existing closure text over by SHA**. Items with no prior closure are listed open.
- Extend `scripts/rrf-triage.mjs` with `--per-release` so a future range is generated this way from the start.
- Tag `rrf-<release>` as each per-release list closes (existing convention).

**D3. Verify what bulk closure skipped.** For each release document:
1. Every `event added` item's event `version` equals `git describe --contains` of its commit (script-checked, so it is a test rather than a
   review).
2. Second-look the "no effect" items in the subsystems most likely to hide file-visible changes: `Movement`, `Platform`, `Heating`,
   `Endstops`, `Tools`, `Fans`, `Display`. Read as diffs, looking for: a config-command parameter added/removed/re-ranged, a default that
   changed, an object-model key visible to `{...}` expressions, an error that a previously accepted line now triggers. Reply-text and
   stack-size changes stay "no effect".
3. Cross-check the wiki `Gcodes.md` and meta-commands pages for "from RRF 3.x"/"removed"/"deprecated" phrases in the window, using the
   dated wiki commits already in the triage output. Where wiki and source disagree, source wins and it goes in `docs/wiki-discrepancies.md`.

**D4. Fix the object-model gap at `alpha.2`.** Extend `scripts/build-om-schema.mjs` with a `--from-rrf-tag` mode that reads the object-model
tables straight from RRF at a tag (rule 12 already ranks RRF's own `OBJECT_MODEL_TABLE`s first). Use it for `3.7.0-alpha.2`, flip
`hasData` to true, regenerate, and let the 65 `beta.1` events redistribute to the release they truly arrived in. Also check the 16
generated events pinned to `3.6.3` (the query window is `(from, to]`, so an event *at* the baseline can never fire) - they should be
`until` markers or belong to a different version.

**D5. Make events detectable.** Run `audit-detectability.mjs` (§4.4). For each undetectable event either retarget it to a command/parameter/
path, add a matcher to `impact.ts` with a fixture, or leave it informational. Rule when authoring events: two events about the same fact
must share a `target` (the M955 lesson in `schema.ts`'s `targetKey`).

**D6. Tests that hold the catalogue to the standard.**
- Every event `version` is in `RELEASES`.
- **Partition property:** for consecutive releases a < b < c, `changesBetween(a, c)` equals the union of `(a, b]` and `(b, c]` (before
  `impactOf`'s superseded-collapse).
- One **real-file fixture per release** (a config.g/macro snippet using something that changed there) asserting the exact `impactOf`
  findings across each adjacent pair, forward and backward.
- The event-id snapshot (§4.5).

**D7. Keeping it current (recipe for each new RRF release).** `npm run triage -- <baseline> <new> --per-release` -> close the list ->
dictionary/OM updates (§8) -> `scripts/rebase-citations.mjs` -> move `RRF_BASELINE` -> tag `rrf-<new>` -> core release -> bump in the
editor and FL. Optionally a scheduled CI job that compares `git ls-remote --tags` against `RRF_BASELINE` and opens an issue when a new tag
exists, so the catalogue does not silently go stale.

## 8. Workstream E - dictionary `since`/`until` up to spec

**Semantics (already in the schema):** an omitted `since` means "present at 3.6.3", the oldest tracked version, so only things that appear or
disappear **after** 3.6.3 need a value. `deprecated` needs `since` where known. The diagnostics
(`dictionary/not-available-on-firmware`, the per-parameter equivalent) and `changesFromDictionary()` already read these fields, so filling
them in improves both the editor lint and the notifications.

**Current gap:** 0/280 commands and 8/628 parameters have a version verdict; 0 `until`; 16 `deprecated`.

**E1. Add a positive marker: `historyChecked`.** Without one, "no `since`" is ambiguous. Add an optional `historyChecked?: string` (the RRF
version the history was verified up to, e.g. `"3.7.0-rc.2"`) on `CommandSpec`. It is set only when a human has confirmed the command's own
existence **and every parameter's** history across the window. Extend `scripts/audit-dictionary.mjs` and `dictionary/coverage.json` with
`versionHistory: { total, checked }`, and add a test that fails once the checked count regresses. The end state is 280/280.

**E2. Decide the id policy before generating anything.** Several existing hand-written events are command/parameter-shaped (`m408-removed`,
`m301-removed`, `m304-removed`, `m140-h-colon-list`, `m558-4-added`, `m564-r-added`, `m221-f-added`, ...). When the dictionary gains the same
fact, two events would appear. Rule: **the dictionary field is the source of truth; the generator emits the event with the existing id**
(an optional `eventId` on the `since`/`until`/`deprecated` holder, or an id-override map in `changes.ts`), and the hand-written duplicate is
deleted in the same commit. The id-stability test (§4.5) proves nothing was lost.

**E3. Command existence per release - fully automated (`scripts/dictionary-history.mjs`).**
- For every release in `RELEASES`, extract the dispatch labels from `HandleGcode`/`HandleMcode`/`HandleTcode` in `src/GCodes/GCodes*.cpp`:
  each `case N:`, and the fractional forms handled by `code == N` branches.
- Diff across releases to get the exact first/last release for each code, and reconcile with the dictionary's 280 codes. **Dispatch cases
  with no dictionary entry are coverage gaps**, and dictionary entries with no case are either macro-only (`unimplemented`) or wrong.
- Output: a table of proposed `since`/`until` per command, for review.

**E4. Parameter existence per release - candidate generator, human-verified.**
- Each parameter's `sources` cite `RRF <tag> <file> <function>`. For each parameter: resolve that function at rc.2, then for every earlier
  release check whether the letter is read there (`gb.Seen('X')`, `MustSee`, `TryGet*`, `Get*` with that letter), following handlers that
  delegate to another function (CLAUDE.md rule 9) via the entry's cited multi-file sources.
- Emit the earliest release the letter appears in. Unresolvable entries (renamed function, moved file) go on a manual list. Reuse the line
  remapping in `rebase-citations.mjs` to find a function that moved.
- This is a **candidate generator, not an oracle**, like `audit-dictionary.mjs`: every proposed value is confirmed with
  `git show <tag>:<file>` before it is written, and cited `RRF <release>@<sha> <file>:<lines>`.

**E5. Cross-checks (three independent signals per entry).**
1. E3/E4 output. 2. The closed triage checklists' "dictionary updated" lines (some name an entry but no version). 3. The wiki's "Supported
from"/"Added in" wording and `git log -S"'X'" -- <file>` for the outliers. Any disagreement is resolved from source and recorded in
`docs/wiki-discrepancies.md`.

**E6. What `since`/`until` cannot express.** A parameter whose *range, values or required-ness* changed (M955's P) is not an existence change.
Those stay hand-written `changed` events targeting the parameter (as M955 does); collect them in E5's pass as a separate list. A general
`history` array on `ParamSpec` is a possible follow-on if that list turns out long. It is out of scope here.

**E7. Order of work, by what real files contain.** Batches of about 30 commands:
1. Config-time commands: `M950`, `M584`, `M569*`, `M308`, `M558*`, `M574`, `M671`, `M92`, `M906`, `M913`, `M201`, `M203`, `M204`, `M208`, `M140`,
   `M141`, `M143`, `M307`, `M563`, `M550`, `M552`, `M553`, `M554`, `M586`, `M587`, `M589`, `M591`, `M592`, `M593`, `M595`, `M955`, `M956`, `M18`,
   `M17`, `G31`, `G10`.
2. Everything else in homing/macro/slicer-start-code use: `G28`, `G29*`, `G30`, `G32`, `G92`, `M106`, `M107`, `M116`, `M291`, `M292`, `M400`,
   `M401`/`M402`, `M409`, `M501`, `M98`/`M99`.
3. The remainder alphabetically, ending with the 16 `deprecated` entries (fill `since` and `replacement` wherever the source names them).

For each batch: generate (E3/E4) -> verify -> edit `dictionary/draft/<code>.json` (regenerate `commands.json` with
`scripts/build-dictionary.mjs`; confirm that flow before editing) -> set `historyChecked` -> tests.

**E8. Tests.** Each `since`/`until` parses, `since` <= `RRF_BASELINE`, `until` > `since`, both are in `RELEASES`, no duplicate event ids
(E2), and a boundary diagnostic test per batch (a line valid at rc.2 flags at 3.6.3, and vice versa). Watch for **new false positives**:
setting `since` makes `dictionary/not-available-on-firmware` fire against older firmware, so run the existing corpus tests and fix or explain
each new finding.

## 9. Sequencing and releases

| Step | Repo | Output | Depends on |
| --- | --- | --- | --- |
| 0 | all | RRF clone, release list, settings-key location | - |
| 1 | core | **D1, D4, E1, E2, §4.1, §4.5** (tooling and contracts) | 0 |
| 2 | core | **§4.2-4.4, §4.6-4.8** - release **1.33.0** | 1 |
| 3 | editor | §5 - release **0.15.0** | 2 |
| 4 | FL | C1-C4 (state, scanner, toast, report) | 2 |
| 5 | FL | C5, C6, C7 (pre-flight, editor wiring, docs) | 3, 4 |
| 6 | core | D2, D3, D5, D6 - data releases (1.34.x) | 1 (parallel with 2-5) |
| 7 | core | E3-E8 in batches - data releases | 1 (parallel with 2-6) |
| 8 | FL | bump core to the latest data release, release FL | 5, 6, 7 |

Steps 4 and 5 can ship before 6 and 7 finish, because the UI states its coverage honestly. Event quality decides whether users trust the
feature, so start D2/D3/E3 tooling as soon as step 1 lands rather than after the UI. Each data release should update `RRF_BASELINE` only if
the baseline itself moved.

## 10. Risks and mitigations

- **False confidence.** The catalogue is partial by nature. Mitigation: "known changes" wording everywhere, the undetectable count in the
  footer, `historyChecked` progress visible in the core's coverage file.
- **Noise.** `whenAbsent` parameters and `array-concat` fire broadly. Mitigation: severity tiers (§4.3), per-event Ignore, and the
  acknowledged set.
- **Stale catalogue.** Mitigation: D7's recipe and the optional CI check.
- **Id churn breaking acknowledgements.** Mitigation: snapshot test (§4.5) plus E2's id policy.
- **Scan cost on big SD cards.** Mitigation: idle-only, size cap, concurrency cap, mtime cache, no `gcodes/`.
- **Mixed boards / forks.** Only the main board's version drives it; STM32 (`gloomyandy`) versions parse through `parseFirmwareVersion`, and a
  parameter that exists only on the fork keeps its `platforms: ["stm32"]`.
- **Shared state written by two browsers.** Last write wins on a tiny blob; acknowledging is idempotent, so a lost write only re-shows a
  report.

## 11. Open questions (defaults in bold)

1. Toast on by default? **Yes**, like the backup nudges; the toggle lives in Settings.
2. Should a `removed` finding be able to block a firmware update in the widget? **No** - a warning only; the user decides.
3. Where does the report live long-term - Settings card only, or also a page seeded in the starter layouts? **Settings card plus dialog**;
   revisit after use.
4. Should `historyChecked` be a hard release gate for the core? **No**; a visible progress number, not a blocker.
