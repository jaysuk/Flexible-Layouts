/**
 * Machine-usage tracking: accumulates several counters entirely on the controller, so totals are
 * correct whenever DWC happens to reconnect, not just for the time it was watching. Originally
 * spindle-on-hours only (CNC/laser); extended to also cover FFF machines (print hours, filament used,
 * tool-change count), then further extended with power-on time and a filament-runout/jam/slippage
 * count (both machine-type-agnostic), then again with per-axis travel distance, per-fan runtime and
 * per-heater on-time/full-load time (v8, also machine-type-agnostic) - see the doc comments on each
 * accumulator below for why each needs the same careful treatment spindle-hours already had, not a
 * naive running read of a live OM value. Job-start counting does NOT live here - it's derived by
 * re-parsing RRF's own SD event log (see eventLog.ts), the same source finished/cancelled counts
 * already came from.
 *
 * RRF's `global.xxx` variables are RAM-only (confirmed against RRF source - no flash/SD backing), so a
 * counter needs its own persistence: `maintenance-daemon.g` accumulates into `global.flMaint*` every
 * time it runs, and periodically calls `maintenance-flush.g` to write those values out to
 * `0:/sys/flexible-layouts.maintenance-state.g` using the Duet3D wiki's documented "persistentGlobal.g"
 * pattern (`echo >`/`echo >>` writing `set`/`global` statements) - restored by `config.g` calling
 * `M98 P"0:/sys/flexible-layouts.maintenance-state.g"` early at boot (see configPatch.ts).
 *
 * These two macros are deployed to their own folder, the same way util/xyzProbe.ts deploys its probe
 * macros - NEVER as FL's own daemon.g outright, since daemon.g is a single file with no
 * multi-contribution mechanism and clobbering a user's own daemon.g customization would repeat
 * exactly the mistake xyzProbe.ts's own macros already had fixed for them. The setup wizard instead
 * detects/offers to add one M98 line to the user's own daemon.g (see configPatch.ts).
 *
 * Which spindle to track (`global.flMaintSpindleIndex`) lives in the SAME persisted-state file as the
 * accumulated seconds, restored together - so changing the tracked spindle is just a setup-wizard
 * re-run, never a macro redeploy. The daemon macro itself is static content, indexing `spindles[]`
 * dynamically by that persisted value. On a machine with no spindle configured at that index at all
 * (any FFF machine, or a CNC/laser machine before its first spindle is set up), `#spindles >
 * global.flMaintSpindleIndex` guards the spindle block so indexing a nonexistent array element never
 * aborts the rest of the macro (RRF meta-gcode has no bounds-checked/optional indexing - an
 * out-of-range access is a hard error for that whole daemon.g invocation).
 */
import type { MachineIO } from "dwc-config-backup-core";

export const MAINTENANCE_MACRO_FOLDER = "0:/macros/FlexibleLayouts";
export const MAINTENANCE_DAEMON_FILE = "maintenance-daemon.g";
export const MAINTENANCE_FLUSH_FILE = "maintenance-flush.g";
export const MAINTENANCE_STATE_PATH = "0:/sys/flexible-layouts.maintenance-state.g";

/** Bumped whenever a change to these macro templates matters enough that an already-deployed copy
 *  should be flagged as outdated - see {@link maintenanceMacrosOutdated}. v2: added print-hours,
 *  filament-used and tool-change tracking for FFF machines (previously spindle-hours only). v3: fixed
 *  a real bug where the v2 counters could end up NEVER seeded on a machine that already had an older
 *  daemon macro running (global.flMaintLastPollTime already existed from before, so the one shared
 *  exists-guard around all four seed variables never ran again - each now has its own guard); also
 *  added the flMaintEnabled pause/resume flag and simplified the filament-summing loop to use RRF's
 *  own `iterations` loop counter instead of a hand-rolled index variable. v4: added power-on time
 *  (unconditional accumulation) and a filament-runout/jam/slippage error count (edge-triggered off
 *  extruder 0's filament monitor status). v5: fixed a real bug in the flush macro - it terminated
 *  each `if !exists(...) / else` block with an `echo`-written "endif" line, but RRF meta-gcode has no
 *  such keyword at all (blocks are closed purely by dedenting, confirmed against RRF's own
 *  persistentGlobal.g reference example on the wiki) - every machine that ever flushed produced a
 *  state file RRF then failed to load at the next boot ("Bad command: endif"), silently losing all
 *  tracked totals. v6: removed tool-change counting from the daemon's poll loop - comparing
 *  `state.currentTool` between polls only sees the LATEST tool at each poll, so a rapid multi-tool
 *  sequence between two polls (or the daemon simply not polling often enough) silently undercounted.
 *  Tool changes are now counted by a direct increment appended into RRF's own tpost#.g/tpost.g macros
 *  (see toolChangePatch.ts), which RRF guarantees runs exactly once per genuine tool change - so
 *  `global.flMaintLastTool` is no longer read or written anywhere in this file. v7: added
 *  flMaintJobsStarted/flMaintJobsFinished/flMaintJobsCancelled to the flush macro and
 *  seedMaintenanceState - these are incremented by start.g/stop.g/cancel.g (see jobTrackingPatch.ts),
 *  not by anything in this file, replacing the old approach of pattern-matching "started"/"finished"/
 *  "cancelled" text in RRF's WARN-level event log (eventLog.ts), which had no way to scope "started" to
 *  actually being about a print - any warn-level line merely containing that word counted. v8: added
 *  per-axis travel distance (flMaintAxisMm), per-fan runtime (flMaintFanSec) and per-heater on-time /
 *  full-load time (flMaintHeaterSec / flMaintHeaterFullSec) - all FIXED-SIZE arrays (see
 *  MAINTENANCE_MAX_TRACKED_* below), never dynamically resized, so seeding them is a plain array
 *  literal rather than a build-with-a-loop - deliberately the lowest-risk array shape available in
 *  RRF meta-gcode. Axis tracking has a homing grace period (an axis's reported position jumps
 *  arbitrarily during a homing move, which would otherwise register as bogus travel) and a sanity
 *  bound (skip a delta bigger than the axis's own min-max range, which catches a WCS/offset jump).
 *  v9: gated the v8 axis/fan/heater loops behind a new flMaintTrackDetail flag, OFF by default -
 *  they were previously unconditional (always running once flMaintEnabled was on), with no way to
 *  keep the base counters (spindle/print/filament/etc.) while skipping the extra per-axis/fan/heater
 *  overhead specifically. v10: split that one flMaintTrackDetail flag into three independent ones -
 *  flMaintTrackAxes, flMaintTrackFans, flMaintTrackHeaters - each gating only its own loop, so a user
 *  who only cares about (say) heater on-time isn't forced to also pay for axis-travel and fan-runtime
 *  polling to get it, and vice versa. All three still default to false. */
export const MAINTENANCE_MACRO_SET_VERSION = 10;

/** Fixed capacities for the per-axis/fan/heater arrays below. Real machines never come close to these
 *  (even an exotic multi-gantry toolchanger has well under 12 axes) - the caps exist only so the
 *  arrays can be seeded as a plain literal instead of built with a loop (see the v8 note above), and
 *  each tracking block is skipped outright (not a hard error) on the vanishingly unlikely machine
 *  that exceeds its cap, via the `#move.axes <= ...` style guards below. Keep all three in sync with
 *  {@link zeroArrayLiteral}'s call sites and with seedMaintenanceState's padding logic if ever changed. */
export const MAINTENANCE_MAX_TRACKED_AXES = 12;
export const MAINTENANCE_MAX_TRACKED_FANS = 12;
export const MAINTENANCE_MAX_TRACKED_HEATERS = 12;

/** A `{0,0,0,...}` (or `{false,false,...}`) RRF array literal of exactly `length` elements - used to
 *  seed the fixed-size tracking arrays so the element count can never drift from a hand-typed literal. */
function zeroArrayLiteral(length: number, value: "0" | "false" = "0"): string {
	return `{${Array(length).fill(value).join(",")}}`;
}

const VERSION_MARKER_RE = /;\s*FL-MAINTENANCE-MACRO-VERSION:\s*(\d+)/;

export function extractMaintenanceMacroVersion(text: string): number {
	const m = text.match(VERSION_MARKER_RE);
	return m ? parseInt(m[1], 10) : 0;
}

function macroHeader(title: string): string {
	return `; ${title}
; FL-MAINTENANCE-MACRO-VERSION: ${MAINTENANCE_MACRO_SET_VERSION}
; Part of Flexible Layouts' machine maintenance tracking.
;
; This file is yours to customize. Just leave the global.flMaint* variables alone - they're what
; Flexible Layouts reads back to compute spindle-on hours, print hours, filament used, tool changes,
; power-on time, filament-error counts, per-axis travel distance, per-fan runtime and per-heater
; on-time/full-load time.

`;
}

/** Polls the tracked spindle's state (CNC/laser) and the print/filament/tool state (FFF) and
 *  accumulates all of them - a single daemon macro covers every machine type rather than needing the
 *  operator to know which one applies, and costs nothing extra on a machine type that doesn't use a
 *  given counter (its accumulator just never moves). Bails out immediately (M99, "return from macro")
 *  if the persisted state hasn't been restored yet - config.g hasn't run maintenance-state.g, or setup
 *  hasn't completed - rather than accumulating against undeclared globals. Amount-based (not
 *  interval-based) flush trigger bounds SD writes to roughly once per 10 minutes of continuous
 *  spindle-on/printing time, regardless of how often this macro itself gets polled. */
export const MAINTENANCE_DAEMON_MACRO = macroHeader("maintenance-daemon.g - usage accumulator") + `if !exists(global.flMaintSpindleIndex)
	M99

; Each of these gets its OWN exists-guard, deliberately not one combined check - global.* variables
; survive a macro-file redeploy (they only clear on an actual reboot), so a machine already running
; an older version of this file may already have flMaintLastPollTime declared while a newer variable
; introduced later (e.g. flMaintLastExtruderPos) is not. A single shared guard would then skip
; seeding the new variable forever, since its guard condition is already false - "unknown variable"
; on every poll, permanently, until the next reboot. Per-variable guards seed each one exactly once,
; whichever poll first finds it missing, regardless of what else already exists.
if !exists(global.flMaintLastPollTime)
	global flMaintLastPollTime = state.upTime
if !exists(global.flMaintUnflushedSec)
	global flMaintUnflushedSec = 0
; Last-seen extruder position is pure poll-to-poll comparison state, not part of the reported totals
; itself - re-seeding it fresh (rather than persisting it) is correct, since move.extruders[].
; rawPosition itself resets to 0 on every boot too.
if !exists(global.flMaintLastExtruderPos)
	global flMaintLastExtruderPos = 0
if !exists(global.flMaintEnabled)
	global flMaintEnabled = true
if !exists(global.flMaintPowerOnSec)
	global flMaintPowerOnSec = 0
; Seeded to the CURRENT status, not "ok" or "noMonitor" - seeding a fixed guess would falsely count
; the very first poll as a transition into (or out of) an error state if the monitor already happened
; to be in one when tracking was set up.
if !exists(global.flMaintLastFilamentStatus) && #sensors.filamentMonitors > 0
	global flMaintLastFilamentStatus = sensors.filamentMonitors[0].status
; Per-axis/fan/heater tracking (v8) - fixed-size arrays, see MAINTENANCE_MAX_TRACKED_* above. Each is
; its own guard for the same reason as every other seed variable above. flMaintLastAxisPos/
; flMaintLastAxisHomed are pure poll-to-poll comparison state (like flMaintLastExtruderPos), not part
; of the reported totals - re-seeding them fresh on every "first sight" is correct.
if !exists(global.flMaintAxisMm)
	global flMaintAxisMm = ${zeroArrayLiteral(MAINTENANCE_MAX_TRACKED_AXES)}
if !exists(global.flMaintLastAxisPos)
	global flMaintLastAxisPos = ${zeroArrayLiteral(MAINTENANCE_MAX_TRACKED_AXES)}
if !exists(global.flMaintLastAxisHomed)
	global flMaintLastAxisHomed = ${zeroArrayLiteral(MAINTENANCE_MAX_TRACKED_AXES, "false")}
if !exists(global.flMaintFanSec)
	global flMaintFanSec = ${zeroArrayLiteral(MAINTENANCE_MAX_TRACKED_FANS)}
if !exists(global.flMaintHeaterSec)
	global flMaintHeaterSec = ${zeroArrayLiteral(MAINTENANCE_MAX_TRACKED_HEATERS)}
if !exists(global.flMaintHeaterFullSec)
	global flMaintHeaterFullSec = ${zeroArrayLiteral(MAINTENANCE_MAX_TRACKED_HEATERS)}
; Gates the three loops below - OFF by default (unlike flMaintEnabled itself, which defaults on), and
; INDEPENDENTLY of each other (v10) - each is its own switch, separate from the master pause/resume and
; from one another, in the setup dialog and next to its own data on the Maintenance page, since it's
; real extra controller overhead most users won't look at the detail for.
if !exists(global.flMaintTrackAxes)
	global flMaintTrackAxes = false
if !exists(global.flMaintTrackFans)
	global flMaintTrackFans = false
if !exists(global.flMaintTrackHeaters)
	global flMaintTrackHeaters = false

var dt = state.upTime - global.flMaintLastPollTime
; state.upTime resets to 0 on reboot - without this clamp, a reboot between two polls would show as
; a large negative delta and corrupt the accumulator instead of just losing that one interval.
if var.dt < 0
	set var.dt = 0
set global.flMaintLastPollTime = state.upTime

; Tracking can be paused without undeploying anything - flMaintLastPollTime (above) is kept current
; regardless, so re-enabling later doesn't count the paused interval as a sudden burst of activity.
if !global.flMaintEnabled
	M99

; Power-on time - unlike every other counter below, this is unconditional: it accumulates whenever
; the daemon polls at all (state.upTime itself is "time since boot", not "time since power applied",
; but the two are the same thing on a controller with no sleep/standby state).
set global.flMaintPowerOnSec = global.flMaintPowerOnSec + var.dt
set global.flMaintUnflushedSec = global.flMaintUnflushedSec + var.dt

; Spindle-on hours (CNC/laser). Guarded by #spindles so a machine with no spindle at this index -
; every FFF machine, or a CNC/laser machine before its first spindle is configured - never indexes
; a nonexistent array element (a hard RRF meta-gcode error, which would also abort the FFF tracking
; below since it's the same macro invocation).
if #spindles > global.flMaintSpindleIndex
	var spindleState = spindles[global.flMaintSpindleIndex].state
	if var.spindleState == "forward" || var.spindleState == "reverse"
		set global.flMaintSpindleSec = global.flMaintSpindleSec + var.dt
		set global.flMaintUnflushedSec = global.flMaintUnflushedSec + var.dt

; Print hours (FFF) - accumulated independently of spindle-on time, not derived from the M929 event
; log, so it still works even if the operator declined to enable event logging during setup.
if state.status == "processing"
	set global.flMaintPrintSec = global.flMaintPrintSec + var.dt
	set global.flMaintUnflushedSec = global.flMaintUnflushedSec + var.dt

; Filament used (FFF) - summed across every extruder. rawPosition is the slicer-commanded axis
; position, which G92 E0 resets constantly (virtually every layer/segment in common slicer output) -
; reading it as a running total would be wrong. Instead this diffs consecutive polls and clamps a
; negative delta (a reset happened) to nothing, the exact same defensive technique as the state.upTime
; reboot-clamp above, so a reset only ever loses that one interval rather than corrupting the total.
var totalExtruderPos = 0
; "iterations" is RRF's own built-in loop counter (0-based, auto-incremented on every "continue"
; back to the while-condition) - no need for a hand-rolled index variable.
while iterations < #move.extruders
	set var.totalExtruderPos = var.totalExtruderPos + move.extruders[iterations].rawPosition
var deltaE = var.totalExtruderPos - global.flMaintLastExtruderPos
if var.deltaE > 0
	set global.flMaintFilamentMm = global.flMaintFilamentMm + var.deltaE
set global.flMaintLastExtruderPos = var.totalExtruderPos

; Tool changes are NOT counted here - see MAINTENANCE_MACRO_SET_VERSION's v6 note. They're counted by
; a direct increment appended into RRF's own tpost#.g/tpost.g macros instead (toolChangePatch.ts),
; which RRF guarantees runs exactly once per genuine tool change - polling state.currentTool here can
; only ever see the latest tool at each poll, silently undercounting rapid tool-change sequences.

; Filament runout/jam/slippage count (extruder 0's monitor only, for now - mirrors the single-spindle
; simplification above). Counts a TRANSITION into a problem status, not every poll spent in one, so a
; sensor sitting in noFilament for several polls while the operator notices and fixes it still counts
; as exactly one event. noDataReceived is deliberately excluded from "problem" - it's the sensor's
; normal pre-extrusion state (no pulses seen yet), not a fault; noMonitor/ok are the two non-problem
; states RRF actually reports.
if #sensors.filamentMonitors > 0
	var fmStatus = sensors.filamentMonitors[0].status
	var fmWasProblem = global.flMaintLastFilamentStatus == "noFilament" || global.flMaintLastFilamentStatus == "tooLittleMovement" || global.flMaintLastFilamentStatus == "tooMuchMovement" || global.flMaintLastFilamentStatus == "sensorError"
	var fmIsProblem = var.fmStatus == "noFilament" || var.fmStatus == "tooLittleMovement" || var.fmStatus == "tooMuchMovement" || var.fmStatus == "sensorError"
	if var.fmIsProblem && !var.fmWasProblem
		set global.flMaintFilamentErrors = global.flMaintFilamentErrors + 1
	set global.flMaintLastFilamentStatus = var.fmStatus

; Per-axis/fan/heater detail tracking - each block independently gated (v10), OFF by default (see the
; seed comment above): each is its own extra array loop every poll, real if modest controller overhead
; for detail most users won't look at, so each is opt-in on its own rather than always-on like
; everything above, and none of the three forces paying for the other two.
if global.flMaintTrackAxes
	; Per-axis travel distance (v8). Guarded by the fixed array capacity so an exotic machine with more
	; axes than we provision for is simply skipped, not a hard indexing error. Two defences against
	; bogus readings: a homing move teleports the reported position (skip the poll a HOMED axis just
	; became homed on - only start diffing from the NEXT poll), and a delta bigger than the axis's own
	; min-max range is dropped outright (catches a workspace-offset jump rather than real travel).
	if #move.axes <= ${MAINTENANCE_MAX_TRACKED_AXES}
		while iterations < #move.axes
			var axisHomed = move.axes[iterations].homed
			var axisWasHomed = global.flMaintLastAxisHomed[iterations]
			if var.axisHomed
				if var.axisWasHomed
					var axisDelta = abs(move.axes[iterations].machinePosition - global.flMaintLastAxisPos[iterations])
					var axisRange = move.axes[iterations].max - move.axes[iterations].min
					if var.axisDelta <= var.axisRange
						set global.flMaintAxisMm[iterations] = global.flMaintAxisMm[iterations] + var.axisDelta
				set global.flMaintLastAxisPos[iterations] = move.axes[iterations].machinePosition
			set global.flMaintLastAxisHomed[iterations] = var.axisHomed

if global.flMaintTrackFans
	; Per-fan runtime (v8). fans[] can have null entries for an unconfigured slot (same as
	; heaters/tools), hence the null guard - reading a field on a null array element is a hard RRF error.
	if #fans <= ${MAINTENANCE_MAX_TRACKED_FANS}
		while iterations < #fans
			if fans[iterations] != null && fans[iterations].actualValue > 0
				set global.flMaintFanSec[iterations] = global.flMaintFanSec[iterations] + var.dt

if global.flMaintTrackHeaters
	; Per-heater on-time and full-load time (v8, machine-type-agnostic - a bed/chamber heater on an FFF
	; machine and a heated element on any other machine both count). "On" is state != "off" (covers
	; both "active" and "standby", matching what an operator would consider "the heater is doing
	; something"), not "avgPwm > 0" (a heater can report a positive average duty over its polling
	; window while at "off" moments within it). "Full load" tracks avgPwm >= 0.95 as a proxy for
	; sustained thermal stress.
	if #heat.heaters <= ${MAINTENANCE_MAX_TRACKED_HEATERS}
		while iterations < #heat.heaters
			if heat.heaters[iterations] != null && heat.heaters[iterations].state != "off"
				set global.flMaintHeaterSec[iterations] = global.flMaintHeaterSec[iterations] + var.dt
				if heat.heaters[iterations].avgPwm >= 0.95
					set global.flMaintHeaterFullSec[iterations] = global.flMaintHeaterFullSec[iterations] + var.dt

if global.flMaintUnflushedSec >= 600
	M98 P"${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_FLUSH_FILE}"
	set global.flMaintUnflushedSec = 0
`;

/** Builds the meta-gcode lines that persist one FIXED-SIZE array-valued global to the flush file. The
 *  `{a,b,c,...}` literal text is built manually, one live element at a time via a loop + string
 *  concatenation, rather than relying on any built-in array-to-string conversion - that conversion's
 *  exact output format isn't verified against real firmware, and any silent mismatch there (e.g. no
 *  surrounding braces) would produce a state file RRF can't reload, losing every tracked total the
 *  same way the v5 "endif" bug did (see the version-history comment above). `varName` only needs to
 *  be unique within the flush macro - each array gets its own so redeclaring one `var` twice (an RRF
 *  error) never happens. */
function flushArrayGlobal(globalName: string, varName: string): string {
	return `var ${varName} = "{"
while iterations < #global.${globalName}
	if iterations > 0
		set var.${varName} = var.${varName} ^ ","
	set var.${varName} = var.${varName} ^ global.${globalName}[iterations]
set var.${varName} = var.${varName} ^ "}"
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.${globalName})"
echo >>"${MAINTENANCE_STATE_PATH}" "  global ${globalName} = " ^ var.${varName}
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.${globalName} = " ^ var.${varName}
`;
}

/** Writes the accumulated counters to a small persistent-globals file (the Duet3D wiki's documented
 *  pattern for surviving a reboot, since global.* itself doesn't) - restored by config.g at boot. */
export const MAINTENANCE_FLUSH_MACRO = macroHeader("maintenance-flush.g - persists the usage counters") + `echo >"${MAINTENANCE_STATE_PATH}" "; Auto-generated by Flexible Layouts - do not edit by hand"
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintSpindleIndex)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintSpindleIndex = " ^ global.flMaintSpindleIndex
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintSpindleIndex = " ^ global.flMaintSpindleIndex
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintSpindleSec)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintSpindleSec = " ^ global.flMaintSpindleSec
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintSpindleSec = " ^ global.flMaintSpindleSec
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintPrintSec)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintPrintSec = " ^ global.flMaintPrintSec
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintPrintSec = " ^ global.flMaintPrintSec
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintFilamentMm)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintFilamentMm = " ^ global.flMaintFilamentMm
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintFilamentMm = " ^ global.flMaintFilamentMm
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintToolChanges)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintToolChanges = " ^ global.flMaintToolChanges
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintToolChanges = " ^ global.flMaintToolChanges
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintPowerOnSec)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintPowerOnSec = " ^ global.flMaintPowerOnSec
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintPowerOnSec = " ^ global.flMaintPowerOnSec
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintFilamentErrors)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintFilamentErrors = " ^ global.flMaintFilamentErrors
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintFilamentErrors = " ^ global.flMaintFilamentErrors
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintJobsStarted)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintJobsStarted = " ^ global.flMaintJobsStarted
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintJobsStarted = " ^ global.flMaintJobsStarted
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintJobsFinished)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintJobsFinished = " ^ global.flMaintJobsFinished
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintJobsFinished = " ^ global.flMaintJobsFinished
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintJobsCancelled)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintJobsCancelled = " ^ global.flMaintJobsCancelled
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintJobsCancelled = " ^ global.flMaintJobsCancelled
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintEnabled)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintEnabled = " ^ global.flMaintEnabled
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintEnabled = " ^ global.flMaintEnabled
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintTrackAxes)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintTrackAxes = " ^ global.flMaintTrackAxes
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintTrackAxes = " ^ global.flMaintTrackAxes
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintTrackFans)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintTrackFans = " ^ global.flMaintTrackFans
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintTrackFans = " ^ global.flMaintTrackFans
echo >>"${MAINTENANCE_STATE_PATH}" "if !exists(global.flMaintTrackHeaters)"
echo >>"${MAINTENANCE_STATE_PATH}" "  global flMaintTrackHeaters = " ^ global.flMaintTrackHeaters
echo >>"${MAINTENANCE_STATE_PATH}" "else"
echo >>"${MAINTENANCE_STATE_PATH}" "  set global.flMaintTrackHeaters = " ^ global.flMaintTrackHeaters
${flushArrayGlobal("flMaintAxisMm", "axisMmText")}${flushArrayGlobal("flMaintFanSec", "fanSecText")}${flushArrayGlobal("flMaintHeaterSec", "heaterSecText")}${flushArrayGlobal("flMaintHeaterFullSec", "heaterFullSecText")}`;

export const MAINTENANCE_MACROS: Record<string, string> = {
	[MAINTENANCE_DAEMON_FILE]: MAINTENANCE_DAEMON_MACRO,
	[MAINTENANCE_FLUSH_FILE]: MAINTENANCE_FLUSH_MACRO,
};

/** Upload both macro files (unconditionally - used for both first-time deploy and "Redeploy macros"). */
export async function deployMaintenanceMacros(io: Pick<MachineIO, "upload">): Promise<boolean> {
	try {
		for (const [name, content] of Object.entries(MAINTENANCE_MACROS)) {
			await io.upload(`${MAINTENANCE_MACRO_FOLDER}/${name}`, new Blob([content], { type: "text/plain" }));
		}
		return true;
	} catch {
		return false;
	}
}

/** Whether the daemon macro needs deploying at all (checked via a download attempt). */
export async function maintenanceMacrosMissing(io: Pick<MachineIO, "downloadText">): Promise<boolean> {
	try {
		await io.downloadText(`${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`);
		return false;
	} catch {
		return true;
	}
}

/** Present-but-stale detection, same "never silently overwrite, only flag" contract as
 *  xyzProbe.ts's xyzProbeMacrosOutdated - only meaningful once the file is known to exist. A
 *  download failure is ambiguous (offline vs. genuinely fine), so it resolves to false. */
export async function maintenanceMacrosOutdated(io: Pick<MachineIO, "downloadText">): Promise<boolean> {
	try {
		const text = await io.downloadText(`${MAINTENANCE_MACRO_FOLDER}/${MAINTENANCE_DAEMON_FILE}`);
		return extractMaintenanceMacroVersion(text) < MAINTENANCE_MACRO_SET_VERSION;
	} catch {
		return false;
	}
}

export interface MaintenanceExtraCounters {
	printSeconds?: number;
	filamentMm?: number;
	toolChanges?: number;
	powerOnSeconds?: number;
	filamentErrors?: number;
	jobsStarted?: number;
	jobsFinished?: number;
	jobsCancelled?: number;
	/** Per-axis accumulated travel (mm), in `move.axes[]` order. Padded/truncated to
	 *  {@link MAINTENANCE_MAX_TRACKED_AXES} - see {@link toFixedArrayLiteral}. */
	axisMm?: Array<number>;
	/** Per-fan runtime (seconds), in `fans[]` order. */
	fanSec?: Array<number>;
	/** Per-heater on-time (seconds), in `heat.heaters[]` order. */
	heaterSec?: Array<number>;
	/** Per-heater full-load (avgPwm >= 0.95) time (seconds), in `heat.heaters[]` order. */
	heaterFullSec?: Array<number>;
}

/** Which of the three independent detail-tracking loops (v10) are on. Each defaults to false when
 *  omitted, same as `enabled`'s own default - a bag of three, rather than three more positional
 *  parameters on {@link seedMaintenanceState}, since they're always read/passed together as a group by
 *  every caller (the setup dialog, and the Maintenance page's own per-category toggles). */
export interface MaintenanceTrackingFlags {
	axes?: boolean;
	fans?: boolean;
	heaters?: boolean;
}

/** A `{a,b,c,...}` RRF array literal of exactly `length` elements, built straight from JS (no RRF
 *  string-conversion risk here, unlike flushArrayGlobal() above - this runs in the browser, not on the
 *  controller). Missing values default to 0; anything beyond `length` is dropped - keeps the written
 *  array the same fixed size the daemon macro always expects, even if the caller hands back a live OM
 *  array of some other length (e.g. read before this machine's macros were ever redeployed to v8). */
function toFixedArrayLiteral(values: Array<number> | undefined, length: number): string {
	const padded = Array.from({ length }, (_, i) => values?.[i] ?? 0);
	return `{${padded.join(",")}}`;
}

/** Writes the persisted-state file directly (setup, or re-running setup to change the tracked
 *  spindle - the flush macro can't do this itself, since it only ever writes the CURRENT live values,
 *  and on a true first run nothing has accumulated yet to call it) and reloads it immediately via M98
 *  so tracking starts/updates live, without waiting for a reboot. Uses the same if-exists/else-set
 *  pattern as the flush macro (not a bare `global x = ...`) because this can run again later in the
 *  same boot session, after the daemon macro has already declared these globals once - re-declaring
 *  an existing global with the bare `global` keyword is an error in RRF, only `set global.x = ...` is
 *  safe on an already-existing one. `spindleSeconds`/`extra`/`enabled`/`tracking` let re-running setup
 *  preserve already-accumulated totals and the current pause/detail-tracking state rather than
 *  resetting them. `tracking` is a separate parameter (not folded into `extra`) for the same reason
 *  `enabled` is - these are feature ON/OFF flags, not accumulated counter values. */
export async function seedMaintenanceState(
	io: Pick<MachineIO, "upload" | "sendCode">, spindleIndex: number, spindleSeconds = 0, extra: MaintenanceExtraCounters = {},
	enabled = true, tracking: MaintenanceTrackingFlags = {},
): Promise<boolean> {
	const {
		printSeconds = 0, filamentMm = 0, toolChanges = 0, powerOnSeconds = 0, filamentErrors = 0,
		jobsStarted = 0, jobsFinished = 0, jobsCancelled = 0, axisMm, fanSec, heaterSec, heaterFullSec,
	} = extra;
	const { axes: trackAxes = false, fans: trackFans = false, heaters: trackHeaters = false } = tracking;
	const axisMmLiteral = toFixedArrayLiteral(axisMm, MAINTENANCE_MAX_TRACKED_AXES);
	const fanSecLiteral = toFixedArrayLiteral(fanSec, MAINTENANCE_MAX_TRACKED_FANS);
	const heaterSecLiteral = toFixedArrayLiteral(heaterSec, MAINTENANCE_MAX_TRACKED_HEATERS);
	const heaterFullSecLiteral = toFixedArrayLiteral(heaterFullSec, MAINTENANCE_MAX_TRACKED_HEATERS);
	const content = `; Auto-generated by Flexible Layouts - do not edit by hand
if !exists(global.flMaintSpindleIndex)
	global flMaintSpindleIndex = ${spindleIndex}
else
	set global.flMaintSpindleIndex = ${spindleIndex}
if !exists(global.flMaintSpindleSec)
	global flMaintSpindleSec = ${spindleSeconds}
else
	set global.flMaintSpindleSec = ${spindleSeconds}
if !exists(global.flMaintPrintSec)
	global flMaintPrintSec = ${printSeconds}
else
	set global.flMaintPrintSec = ${printSeconds}
if !exists(global.flMaintFilamentMm)
	global flMaintFilamentMm = ${filamentMm}
else
	set global.flMaintFilamentMm = ${filamentMm}
if !exists(global.flMaintToolChanges)
	global flMaintToolChanges = ${toolChanges}
else
	set global.flMaintToolChanges = ${toolChanges}
if !exists(global.flMaintPowerOnSec)
	global flMaintPowerOnSec = ${powerOnSeconds}
else
	set global.flMaintPowerOnSec = ${powerOnSeconds}
if !exists(global.flMaintFilamentErrors)
	global flMaintFilamentErrors = ${filamentErrors}
else
	set global.flMaintFilamentErrors = ${filamentErrors}
if !exists(global.flMaintJobsStarted)
	global flMaintJobsStarted = ${jobsStarted}
else
	set global.flMaintJobsStarted = ${jobsStarted}
if !exists(global.flMaintJobsFinished)
	global flMaintJobsFinished = ${jobsFinished}
else
	set global.flMaintJobsFinished = ${jobsFinished}
if !exists(global.flMaintJobsCancelled)
	global flMaintJobsCancelled = ${jobsCancelled}
else
	set global.flMaintJobsCancelled = ${jobsCancelled}
if !exists(global.flMaintEnabled)
	global flMaintEnabled = ${enabled}
else
	set global.flMaintEnabled = ${enabled}
if !exists(global.flMaintTrackAxes)
	global flMaintTrackAxes = ${trackAxes}
else
	set global.flMaintTrackAxes = ${trackAxes}
if !exists(global.flMaintTrackFans)
	global flMaintTrackFans = ${trackFans}
else
	set global.flMaintTrackFans = ${trackFans}
if !exists(global.flMaintTrackHeaters)
	global flMaintTrackHeaters = ${trackHeaters}
else
	set global.flMaintTrackHeaters = ${trackHeaters}
if !exists(global.flMaintAxisMm)
	global flMaintAxisMm = ${axisMmLiteral}
else
	set global.flMaintAxisMm = ${axisMmLiteral}
if !exists(global.flMaintFanSec)
	global flMaintFanSec = ${fanSecLiteral}
else
	set global.flMaintFanSec = ${fanSecLiteral}
if !exists(global.flMaintHeaterSec)
	global flMaintHeaterSec = ${heaterSecLiteral}
else
	set global.flMaintHeaterSec = ${heaterSecLiteral}
if !exists(global.flMaintHeaterFullSec)
	global flMaintHeaterFullSec = ${heaterFullSecLiteral}
else
	set global.flMaintHeaterFullSec = ${heaterFullSecLiteral}
`;
	try {
		await io.upload(MAINTENANCE_STATE_PATH, new Blob([content], { type: "text/plain" }));
		await io.sendCode(`M98 P"${MAINTENANCE_STATE_PATH}"`);
		return true;
	} catch {
		return false;
	}
}
