# Widget reference

Add widgets with **Add widget** while editing. Every widget can additionally be given
[conditions](#conditions-any-widget), colours, typography and scale-to-fit in its ⚙ dialog.

## Containers & panels

| Widget | What it is |
|--------|------------|
| **Built-in DWC panel** | Any of DWC's own panels (Status, Tools, Movement, Extrude, Fans, Job…) reused on any page. |
| **Plugin page / tab** | A page, settings tab or job-view tab registered by another plugin, embedded inline. Records that plugin as a dependency. |
| **Custom panel (group)** | A titled container with its own mini-grid of widgets — a reusable sub-layout you can back up and share on its own. Switch a group to **free mode** to position its children precisely (drag / resize / rotate, free overlap, z-order) — this is the canvas for nestled and shaped layouts. |

## Freeform widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Command button** | Sends G-code / runs a macro, makes an HTTP GET, or opens a URL. Render it as a **shape** — rectangle, rounded/pill, circle/ellipse, polygon (hexagon…), star, wedge, chevron/arrow, diamond, trapezoid or a custom path. A shaped button only reacts within the shape itself, so buttons can **overlap and nestle**. | code/URL, label, icon, colour, **shape + stroke / fill-opacity / rotation / z-order**, confirm-before-run, action type |
| **Jog control (Pronterface)** | Movement pad with concentric step rings for two planar axes + a Z bar. | axis letters, XY/Z step rings (right-click a ring to change it), feedrates, home buttons, motors-off, per-axis invert, title |
| **CNC / Octopus jog** | EstlCam-style 8-way pad: 4 cardinal + 4 diagonal arms (diagonals move both axes at once), concentric rings = jog distances with a colour-keyed distance legend, a centre **Home-all** hub + per-axis home row, a Z bar, and an optional position (DRO) header. | axis letters / invert, XY/Z distance rings, feedrates, toggles for diagonals / distance legend / DRO / Z / homing / feedrate / motors-off, title |
| **Input field** | Runs a command template with the entered value (`{value}`), or sets an RRF `global` variable. | mode, command template / global name, number vs text, default |
| **Slider** | Sends a command template (`{value}`) as you drag, and optionally tracks a live OM value. Fan %, speed/flow factor, brightness, RPM… | live value path (+scale/offset), min/max/step, command, unit, send-while-dragging, colour |
| **Toggle / switch** | Stateful on/off bound to an OM value, sending separate on/off commands. ATX power (`M80`/`M81`), pins (`M42`), a `global` bool… | state path, on/off commands, switch vs button, colour |
| **Stepper (+/−)** | Buttons that nudge a value by a step. Relative sends `±step` each press; absolute sends the new total. Babystep, target temp, factors… | mode, live value path, step/min/max, decimals, command, unit, colour |
| **Value read-out** | Shows one object-model value as a number, label or gauge. | OM path, display mode, unit, precision, gauge bounds, scale/offset, on/off text, value→text map |
| **Live chart** | Plots one or more OM values over time, with CSV download. | series (OM paths), window seconds, interval, Y bounds, axis titles |
| **Text / image** | A heading, paragraph, image (by URL) or spacer. | variant, content, alignment, colour |
| **LED strip (NeoPixel)** | Control NeoPixel/DotStar strips via `M150`: colour picker, master brightness, all-off, and optional per-LED painting (pick a colour, click pips to paint them). RGBW strips get a white channel. | which strip (first detected / choose / fixed), LED count, per-LED painting on/off, editable count on/off, colour |
| **Globals editor** | View and edit RRF `global.*` variables inline — booleans toggle live, numbers/strings/arrays edit + Set. | show all vs a chosen list of variables, filter box, allow-edit (read-only) |
| **Web page** | Embeds an external page / local web service in an iframe. | URL |

### Presets & nestling

The palette includes ready-made **preset groups** you drop in and then edit — e.g. a **Hex Pad** (a
honeycomb of hexagon command buttons). A preset is just a normal **free-mode group**, so you can
re-wire or restyle every button in it.

To build your own nestled controls (custom pads, dials, clusters), drop shaped command buttons into a
**free-mode group** and use **Arrange…** — in the group editor, or the page toolbar for a multi-selection
— to lay them out in a **ring** (centre, radius, count, start angle, face-outward) or a **hex** grid.
**Bring-to-front / send-to-back** set the overlap order, and each item has its own rotate handle. (For a
ready-made jog dial, the **CNC / Octopus jog** widget above is usually the better choice.)

## Display & dashboard widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Progress bar** | Horizontal bar for an OM fraction (value, or value ÷ a max path). Print progress, heater-to-target, etc. | value path, max path, min/max/scale, show %, colour |
| **Status indicator** | A coloured dot + label/icon chosen by the first matching rule against an OM value. At-a-glance machine state. | value path, states (operator/value → colour/label/icon), defaults |
| **Alert banner** | A banner shown **only while** an OM condition holds (filament out, fault, door open…). Visible in edit mode for setup. | condition (path/operator/value), severity, message, icon |
| **Webcam / snapshot** | An image or stream, optionally refreshed on a timer, click-to-enlarge. | URL, refresh ms (0 = stream), fit, click-to-enlarge |
| **Job thumbnail** | Shows the running job's (or a chosen file's) slicer-embedded thumbnail image. | source (job/file), file path, fit, title |
| **Macro grid** | A button per `.g` file in a macros folder; runs `M98 P"…"`. | folder, columns, colour |
| **Mini console** | Send a command and see the last few replies, without leaving the page. | replies kept, placeholder |
| **Heater control** | Compact tile: live current/active/state + target presets and off (command-templated). | heater path, set/off commands, presets, colour |
| **Clock / timer** | Wall clock, uptime, print time, or time-left. | mode, 12/24h |
| **Value table** | A tidy label → value table for several OM paths in one tile. | rows (label/path/unit/decimals) |

## Machine control widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Extruder** | Extrude / retract by a chosen amount + feedrate (`M83` + `G1 E…`), optional tool select. | amounts, feedrate, tool |
| **Work offsets (CNC)** | Select **G54–G59.3**, show each axis's work (and machine) position, **zero a single axis or all** in the active WCS (`G10 L20`), and **go to work XY zero** (`G0 X0 Y0`, Z left alone). | axes, show-machine, go-to button, precision, colour |
| **WCS table (CNC)** | All six WCS offsets (**G54–G59.3**) per axis in one table, edited inline (`G10 L2`), with work-rotation (`G68`/`G69`) and copy-offsets-between-WCS. | axes shown, precision, show copy, show rotation, colour |
| **Touch probe (CNC)** | Buttons for **Z / X / Y / corner / centre** probing; each runs a **configurable command/macro** (defaults call your `…/macros/Probe/*.g`) with `{dia}` / `{corner}` placeholders from the on-panel endmill-Ø and corner inputs, behind a confirm. Drives *your* vetted probe routines — geometry is machine-specific. | operations, endmill Ø, per-op command templates, confirm, colour |
| **Bed mesh** | Load, edit and (re-)probe a heightmap CSV as a colour-coded grid — save/discard, full re-probe, or edit/re-probe a single cell. | heightmap file, probe command, probe index, confirm-before-probe, label |
| **Bed tram** | Runs a bed-tramming/auto-calibration command (`G32` by default) and shows the mean/deviation result. | command, confirm-before-run, label, colour |
| **XYZ probe** | Touch-probes a corner or single axis against a reference plate (`G38.2`-based); deploys its own macros to the SD card on first use — no macro-writing required. | endmill Ø, corner, plate width/height/thickness, X/Y offset, feedrate, search margin, probe index, macro folder, confirm |
| **Probe routines** | Raw-touch-probe routines beyond a single axis: tool-length offset, XY skew/rotation, bore/boss centre-finding, and single-edge work-offset — built from probes assigned to roles. | mode, feed fast/slow, search distance, backoff, probe role assignments |
| **Surfacing wizard (CNC)** | Generates and runs a facing/surfacing G-code program from area, tool and pass parameters. | width/height, tool Ø, stepover %, depth per pass, total depth, clearance, feed, direction, spindle RPM, confirm |
| **Tool alignment** | Camera-crosshair alignment: jog each tool onto a fixed camera position, capture XY(+Z) per tool, then compute and apply `G10` offsets relative to a reference tool. | camera URL/overlay, reference tool, enable Z, jog step/feed, camera/start/finish/save commands, invert offsets |
| **Tool selector** | A button per tool (`T<n>`); active tool highlighted. | label, colour |
| **Fan slider** | Single-fan slider with live % + RPM (`M106 P<n> S…`). | fan #, colour |
| **Job control** | Pause / resume / cancel (`M25`/`M24`/`M0`) with progress. | show progress, colour |
| **File picker** | A button per gcode file in a folder; starts it (`M32`-templated). | folder, columns, start command |
| **Position (DRO)** | Axis positions with machine/work toggle and per-axis homed indicators. | axes, work/machine, decimals |
| **Spindle / laser** | Forward/reverse/stop (`M3`/`M4`/`M5`) + RPM slider, reads `spindles[n]`. | spindle #, min/max RPM, colour |
| **Message box (M291)** | Surfaces a firmware message box inline and acknowledges it (`M292`) — OK/Cancel, choices, or value input. | — |
| **Profile switcher** | Switch the active FL layout profile from the page. | dropdown vs buttons |
| **Theme toggle** | Flip the DWC light/dark theme. | switch vs button |
| **Preflight checks** | Loads a G-code file and runs static sanity checks against it — travel bounds, unhomed axes, rapid rates, unknown tool references. | default file, rapid rate, tool table |
| **Toolpath** | Loads a G-code file and draws its 2D XY toolpath, colouring already-cut vs remaining moves live against the running job's file position. | default file, colour |
| **Machine health** | Read-only tile of board voltages / MCU temp, free RAM, uptime, network interfaces and probe readings, plus a button for a full `M122` diagnostics dump. | title, which sections shown (power/RAM/uptime/network/probes) |
| **Maintenance** | Summary tile of tracked usage — print/spindle hours, filament used, tool changes, job counts, power-on hours — with a link through to the full Maintenance page. | label, colour |
| **Firmware update** | Browses firmware releases (Duet3D / gloomyandy fork / DWC) matched per board, then hands files to DWC's own upload flow (or triggers an SBC `M997 S2` package update). | source, include prereleases, DSF update feed |

## More display widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Gauge cluster** | Several radial gauges in one tile. | gauges (label/path/min/max/unit/colour) |
| **Indicator grid** | Grid of truthiness-driven status icons (endstops, sensors, flags). | items (label/path/on+off colour/icon), columns |
| **Sparkline** | Tiny multi-series trend line sampled from the OM. | series (path/colour), window, interval |
| **Note (Markdown)** | Formatted text/instructions from a minimal Markdown subset. | content |
| **Image hotspots** | An image with clickable regions that each send a command (machine schematic, etc.). | image URL, regions (x/y/w/h %, command, label) |
| **HTTP / REST value** | Polls an HTTP endpoint and shows the response (optionally a JSON field). | URL, poll ms, JSON path, prefix/suffix |
| **Console log** | Live tail of console messages and command replies (via the plugin event bus). | replies kept |

> Use the 🌳 **browse** button anywhere a path is needed to pick object-model values without typing.

## Conditions (any widget)

In a widget's ⚙ dialog you can add **conditions** — rules evaluated against the live object model
that **recolour**, **hide** or **disable** the widget. Each rule is an OM path, an operator
(`= ≠ > < ≥ ≤`, contains, truthy, falsy) and a value, plus the effect to apply when it matches.

## Value formatting (value widget)

- **scale / offset** — `displayed = value × scale + offset`
- **on/off text** — render booleans (or 0/1) as words
- **value → text map** — map exact values (e.g. status codes) to labels, checked before numeric
  formatting
- **unit / precision** and gauge **min / max**

## Header widgets

While editing, mini widgets (command buttons, read-outs) can be pinned into the **top app bar** for
always-visible controls; the bar's colour, title and logo are set in **Theme & colours**.

Four widgets are purpose-built for the header, though — like any other widget — they can also be
dropped onto an ordinary page grid instead:

| Widget | What it does |
|--------|--------------|
| **G-code entry (top bar)** | Pins DWC's own G-code entry box. |
| **Edit-mode button (top bar)** | Pins the shell's Edit/Done button — the way in and out of edit mode itself. |
| **Upload button (top bar)** | Pins DWC's own file/job upload button. |
| **Access-level chip (top bar)** | Shows the current access level (Observer/Operator/Admin); click to log in or lock back down. Only appears once the [password lock](usage.md#password-lock) is enabled. |
