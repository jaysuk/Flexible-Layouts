# Widget reference

Add widgets with **Add widget** while editing. Every widget can additionally be given
[conditions](#conditions-any-widget), colours, typography and scale-to-fit in its ⚙ dialog.

## Containers & panels

| Widget | What it is |
|--------|------------|
| **Built-in DWC panel** | Any of DWC's own panels (Status, Tools, Movement, Extrude, Fans, Job…) reused on any page. |
| **Plugin page / tab** | A page, settings tab or job-view tab registered by another plugin, embedded inline. Records that plugin as a dependency. |
| **Custom panel (group)** | A titled container with its own mini-grid of widgets — a reusable sub-layout you can back up and share on its own. |

## Freeform widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Command button** | Sends G-code / runs a macro, makes an HTTP GET, or opens a URL. | code/URL, label, icon, colour, confirm-before-run, action type |
| **Jog control** | Pronterface-style movement pad: concentric step rings for two planar axes + a Z bar. | axis letters, XY/Z step rings (right-click a ring to change it), feedrates, home buttons, motors-off, per-axis invert, title |
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

## Display & dashboard widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Progress bar** | Horizontal bar for an OM fraction (value, or value ÷ a max path). Print progress, heater-to-target, etc. | value path, max path, min/max/scale, show %, colour |
| **Status indicator** | A coloured dot + label/icon chosen by the first matching rule against an OM value. At-a-glance machine state. | value path, states (operator/value → colour/label/icon), defaults |
| **Alert banner** | A banner shown **only while** an OM condition holds (filament out, fault, door open…). Visible in edit mode for setup. | condition (path/operator/value), severity, message, icon |
| **Webcam / snapshot** | An image or stream, optionally refreshed on a timer, click-to-enlarge. | URL, refresh ms (0 = stream), fit, click-to-enlarge |
| **Macro grid** | A button per `.g` file in a macros folder; runs `M98 P"…"`. | folder, columns, colour |
| **Mini console** | Send a command and see the last few replies, without leaving the page. | replies kept, placeholder |
| **Heater control** | Compact tile: live current/active/state + target presets and off (command-templated). | heater path, set/off commands, presets, colour |
| **Clock / timer** | Wall clock, uptime, print time, or time-left. | mode, 12/24h |
| **Value table** | A tidy label → value table for several OM paths in one tile. | rows (label/path/unit/decimals) |

## Machine control widgets

| Widget | What it does | Key options |
|--------|--------------|-------------|
| **Extruder** | Extrude / retract by a chosen amount + feedrate (`M83` + `G1 E…`), optional tool select. | amounts, feedrate, tool |
| **Work offsets (CNC)** | Select G54–G59 and zero the current WCS for chosen axes (`G10 L20`). | axes, colour |
| **Tool selector** | A button per tool (`T<n>`); active tool highlighted. | label, colour |
| **Fan slider** | Single-fan slider with live % + RPM (`M106 P<n> S…`). | fan #, colour |
| **Job control** | Pause / resume / cancel (`M25`/`M24`/`M0`) with progress. | show progress, colour |
| **File picker** | A button per gcode file in a folder; starts it (`M32`-templated). | folder, columns, start command |
| **Position (DRO)** | Axis positions with machine/work toggle and per-axis homed indicators. | axes, work/machine, decimals |
| **Spindle / laser** | Forward/reverse/stop (`M3`/`M4`/`M5`) + RPM slider, reads `spindles[n]`. | spindle #, min/max RPM, colour |
| **Message box (M291)** | Surfaces a firmware message box inline and acknowledges it (`M292`) — OK/Cancel, choices, or value input. | — |
| **Profile switcher** | Switch the active FL layout profile from the page. | dropdown vs buttons |
| **Theme toggle** | Flip the DWC light/dark theme. | switch vs button |

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
