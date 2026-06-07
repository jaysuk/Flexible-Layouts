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
