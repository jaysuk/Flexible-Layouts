# Maintenance feature expansion — implementation plan

Working document. Derived from a feature audit of [Meltingplot/dwc-vigil](https://github.com/Meltingplot/dwc-vigil)
against FL's existing maintenance feature. Delete once the work is merged.

**Status: Items A-H all implemented** (A/B landed first as a separate change; D-H landed together).
1,218 tests pass, typecheck clean, build clean. See each item's section below for what actually
shipped vs. what was scoped down, and the "verification" section for what is NOT yet confirmed
against real firmware (macros.ts changes only - everything else is ordinary browser code, already
exercised by the test suite same as the rest of this plugin).

---

## 1. Context

Vigil is a DWC usage/maintenance plugin with a **different architecture**: it requires an SBC
(Raspberry Pi), DSF 3.6+, and a **Python daemon** on the Pi that subscribes to the object model and
serves HTTP endpoints.

FL accumulates into `global.flMaint*` from an **RRF macro daemon** (`maintenance-daemon.g`), so it
works on **standalone Duets too**. That reach is a deliberate advantage.

> **Do not port Vigil's architecture.** Every item below must be implemented inside FL's existing
> macro-accumulator model. Anything that can only work on an SBC is out of scope.

---

## 2. Audit: Vigil vs FL

| Capability | Vigil | FL today | Action |
|---|---|---|---|
| Machine hours / power-on time | ✅ | ✅ `flMaintPowerOnSec` | — |
| Print time | ✅ | ✅ `flMaintPrintSec` | — |
| Spindle hours | — | ✅ `flMaintSpindleSec` | FL ahead |
| Filament used | ✅ per-extruder, excl. retracts | ✅ `flMaintFilamentMm` (single) | **Item C** (optional) |
| Tool changes | — | ✅ `flMaintToolChanges` | FL ahead |
| Jobs started/finished/cancelled | ✅ + pie chart | ✅ counters, no chart | **Item G** (low priority) |
| Filament errors | — | ✅ `flMaintFilamentErrors` | FL ahead |
| Reboot handling | ✅ detection | ✅ already clamps `state.upTime` | — |
| Pause/resume of tracking | — | ✅ `flMaintEnabled` | FL ahead |
| **Per-axis travel distance** | ✅ w/ homing grace | ❌ | **Item A** |
| **Per-fan runtime** | ✅ | ❌ | **Item B** |
| **Per-heater on-time + full-load** | ✅ 95%+ duty | ❌ | **Item B** |
| **Per-counter service reset** | ✅ audit trail | ❌ (all-or-nothing baseline) | **Item D** |
| **CSV export** | ✅ | ❌ (JSON on SD only) | **Item E** |
| **Log write integrity** | ✅ SHA-256 + parity | ❌ best-effort | **Item F** |
| 30-day daily snapshots + charts | ✅ | ❌ | **Item G** |
| Pause duration / heater warmup time | ✅ | ❌ | **Item G** (low value) |
| Board MCU temp / Vin min-max | ✅ daily min/max | ❌ | Skip — RRF already exposes `boards[0].vIn.min/max`; that's a read-only widget, not tracking |
| SBC CPU temp/load/memory, free storage | ✅ | ❌ | **Skip — SBC only** |
| **Service-interval reminders / "due" alerts** | ❌ | ❌ | **Item H — gap in BOTH, highest user value** |

---

## 3. Architectural constraints — read before writing code

1. **Bump `MAINTENANCE_MACRO_SET_VERSION`** in `src/model/maintenance/macros.ts` (currently `7`) for
   any macro text change. `extractMaintenanceMacroVersion()` uses it to detect stale deployed macros
   and prompt a redeploy. Update the version-history comment above it too.
2. **Every new global needs its OWN `if !exists(...)` guard.** There is a comment in `macros.ts`
   explaining why a single shared guard is wrong: an older deployed file may already have some
   globals but not newer ones, and a shared guard would skip creating the new ones.
3. **Daemon cost is a real constraint.** This macro runs continuously on the Duet's interpreter.
   Items A and B add per-axis / per-fan / per-heater loops. Keep loops bounded by the actual array
   lengths (`#move.axes`, `#fans`, `#heat.heaters`), do not add nested loops, and prefer a single
   pass. If measured cost is material, gate the new tracking behind a `global.flMaintTrackDetail`
   flag defaulting **off**, exposed in the setup dialog.
4. **SD writes** happen via the flush macro roughly every 10 minutes; more counters just mean a
   slightly larger state file at the same cadence. Do not increase flush frequency.
5. **Schema additivity.** New fields on `MaintenanceEntry` (`src/model/maintenance/log.ts`) must be
   **optional**, matching the existing `printSecondsAtEntry?` precedent, so `LOG_SCHEMA` stays `1`.
   Only bump it if a field's *meaning* changes.
6. **i18n**: all keys in `src/i18n/en.json`, flat namespace under `plugins.flexibleLayouts.*`.
   Known gotcha: the `Edit` tool intermittently fails on this file — fall back to a small Python
   script doing an exact string replace, then validate with
   `node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json','utf8'))"`.
7. **Preserve the subtraction model.** FL computes "since last service" as *live value − stored
   baseline* and never mutates or resets the live counters (see the doc comment at the top of
   `log.ts`). This is better than Vigil's resettable "service tier" because it cannot lose history.
   Item D must extend this model, **not** replace it with resettable counters.

---

## 4. Work items

Do them in this order. A and B share one macro edit — land them together.

### Item A — Per-axis travel distance  *(highest value)*

Wear on rails, screws and belts is a function of **distance**, not hours. This is the most
maintenance-relevant metric FL is missing, especially on a toolchanger.

- **Macro** (`macros.ts`, daemon): add `global.flMaintAxisMm` (array, one entry per axis) and
  `global.flMaintLastAxisPos`. Each poll, for `i` in `0..#move.axes-1`, add
  `abs(move.axes[i].machinePosition - global.flMaintLastAxisPos[i])`, then store the new position.
- **Homing grace period** (Vigil does this, and it matters): a homing move teleports the reported
  position and would otherwise register as a huge bogus distance. Skip accumulation for an axis when
  `!move.axes[i].homed`, and also skip the first poll after `homed` flips false→true (store the
  position without accumulating). Same shape as the existing `flMaintLastExtruderPos` handling.
- Also skip when the position delta exceeds a sanity bound (e.g. > axis `max - min`), which catches
  workplace-offset jumps.
- **Flush macro**: persist the new globals.
- **UI**: show per-axis distance on `MaintenancePage.vue`, and as an option in `MaintenanceWidget`.
- **Tests**: extend `src/__tests__/maintenance.macros.test.ts` — assert the new globals appear in
  both macros and that the version bumped.

### Item B — Per-fan runtime and per-heater on-time

- **Macro**: `global.flMaintFanSec` (array over `#fans`) — add `dt` where `fans[i].actualValue > 0`.
  `global.flMaintHeaterSec` (array over `#heat.heaters`) — add `dt` where the heater is on; plus
  `global.flMaintHeaterFullSec` where `heat.heaters[i].avgPwm >= 0.95` (Vigil's "full-load" metric —
  a good proxy for thermal stress).
- Same guard/flush/UI/test treatment as Item A.

### Item C — Per-extruder filament *(optional, low priority)*

**Already verified: FL is not buggy here.** The daemon does `if var.deltaE > 0` before accumulating,
so retraction is already excluded — the same rule Vigil uses. No fix needed.

The only real difference: FL sums `rawPosition` across **all** extruders into one total and takes the
delta of that sum, so within a single poll one extruder retracting partially cancels another
extruding. Harmless on single-extruder machines and negligible on most multi-extruder ones. Splitting
into a per-extruder array (mirroring Item A's per-axis array) would remove that and give per-tool
consumption figures. Only worth doing on a multi-extruder machine — treat as optional.

### Item D — Per-counter service baselines

Today one log entry snapshots *all* counters, so "changed the collet" silently rebaselines spindle
hours too.

- Add an optional `services?: Array<string>` field to `MaintenanceEntry` listing which counter keys
  that entry services (e.g. `["spindleSeconds"]`).
- `secondsSince()` and friends should find the most recent entry **that services that counter**,
  falling back to current behaviour (any entry) when `services` is absent — so existing logs keep
  working unchanged.
- UI: checkboxes in the "log entry" form to pick which counters are being reset.

### Item E — CSV export

`MaintenancePage.vue` can already read the JSON log. Add a "Export CSV" button producing one row per
entry with columns for timestamp, category, note, and each counter's value + delta-since-previous.
Reuse `downloadBlob` from `dwc-plugin-runtime` (already used in `TlsSetupDialog.vue`).

### Item F — Log write integrity

`log.ts` is best-effort, yet its own doc comment says the log "must never silently discard old
entries". A truncated SD write would do exactly that.

- Write to a temp path then rename, or write-then-read-back-and-verify before considering the save
  successful. Add a `checksum` field (a simple hash over the serialised entries is enough — Vigil's
  SHA-256 + XOR parity is more than FL needs).
- On load, if the checksum mismatches, surface a warning and **do not overwrite** the file.

### Item G — Nice-to-haves (only if A–F land cleanly)

- 30-day daily snapshot ring on SD + trend chart. FL already has `ChartWidget` and `chartSampler`,
  so only the rollup storage is new.
- Job-outcome pie chart (data already exists in the counters).
- Pause duration / heater warmup time.

### Item H — Service-interval reminders  *(gap in both products)*

Neither FL nor Vigil has this, and it is arguably the entire point of tracking hours: knowing when
service is **due**.

- Per-category interval config (e.g. "grease ways every 50 spindle hours", "replace nozzle every
  200 print hours" / "every 5 km of X travel" once Item A exists).
- Compute "due / overdue" from the existing live-minus-baseline value.
- Surface as a badge on `MaintenanceWidget` and a one-click toast, following the **existing nudge
  pattern** in `src/model/tlsSetup/certExpiryNudge.ts` and
  `src/model/configBackup/autoBackupNudges.ts` — install/uninstall lifecycle wired from `index.ts`,
  one toast per connect, never automatic action.

---

## 5. Verification

```bash
npm test                                              # full suite
npx vitest run src/__tests__/maintenance.macros.test.ts   # single file
DWC_DIR=<path-to-DuetWebControl> npm run typecheck
DWC_DIR=<path-to-DuetWebControl> npm run verify-build
```

- `test/widgets.smoke.test.ts` mounts every registered widget — it will catch a broken
  `MaintenanceWidget` template automatically.
- Any new `v-dialog`-based component needs an `attach?: boolean | string` prop passed through to
  `v-dialog` for testability (see `GcodeFilePickerDialog.vue` for the pattern).
- Macro changes cannot be unit-tested against real firmware. At minimum assert the generated macro
  text contains each new global and that the version constant bumped, and **have the macro reviewed
  by hand** before release — a bad daemon macro runs continuously on the printer.

## 6. Out of scope

- Vigil's Python/DSF daemon architecture.
- SBC CPU temperature, load, memory, free storage (SBC-only; would break standalone support).
- Board voltage/MCU-temp min-max tracking — RRF already exposes these directly; if wanted, it is a
  read-only widget, not part of maintenance tracking.
