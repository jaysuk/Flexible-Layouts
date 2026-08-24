# Cut from drawing (SVG/DXF)

Turns a 2D SVG or DXF outline into a G-code profile-cutting program: load a drawing, choose which
paths to cut and which side of the line the tool rides on, set depth/passes/tabs, then run it or
download the file. Reachable from the **Plugins** nav entry **"Cut from drawing"**, or from
**Settings → Flexible Layouts → Cut from drawing**. Viewing and previewing need no permission at all
(an Operator can load a file, preview it and download the G-code); only the **Cut it** button gates on
the `runJobs` capability.

This is a straight **profile/contour cutter** — it follows an outline, offset for the tool, at depth.
It is not a CAM package: no pocketing, no drilling, no engraving toolpaths beyond cutting exactly on
the line. See [What this doesn't do](#what-this-doesnt-do).

## Loading a drawing

Drag an `.svg`/`.dxf` onto the drop zone, or click it to pick a file.

- **DXF** entities read: `LINE`, `CIRCLE`, `ARC`, `ELLIPSE`, `LWPOLYLINE`, `POLYLINE` (+`VERTEX`),
  `SPLINE`. Anything else is skipped and counted in a warning.
- **SVG** elements read: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`. Text,
  images and `<use>` references are ignored — convert text to paths before exporting.
- Curves (beziers, arcs, splines, ellipses) are flattened to straight-line polylines immediately on
  import, at the **Curve tolerance** below — nothing downstream (offsetting, tabs, the preview) needs
  to understand curve types at all, only how finely this one was flattened.

**Units.** DXF units come from the file's `$INSUNITS` header; SVG units come from the root
`width`/`height` attributes (viewBox-aware — millimetres per user unit *after* the viewBox scale, not
per raw pixel). A bare number with no unit suffix is CSS px by the SVG spec's own default (96px = 1in),
which is a rendering convention, not a statement of physical size. If the file genuinely doesn't say —
DXF with `$INSUNITS` unset or 0, SVG with no physical width/height — the size readout is shown as an
honest **"unknown units, read as millimetres"** warning rather than a silent guess, with a one-click
**×25.4** shortcut if the numbers were actually inches.

## Preview and choosing what to cut

The canvas shows the loaded drawing in grey and the computed tool path in orange, with an arrowhead
marking cut direction. **Click a path in the drawing** to leave it out of the cut (click again to put
it back) — excluded paths are dimmed and drawn dashed. A small origin marker appears when the drawing
sits near machine X0/Y0.

The legend line above the canvas keeps count: how many of the drawing's paths are currently included,
and which side of the line the tool path represents.

## Placement

| Field | What it does |
|---|---|
| **Scale** | Millimetres per source unit. Seeded from the file's own stated units on load; edit freely — the size readout updates live. Applied uniformly to both axes (no independent X/Y stretch). |
| **Make it wide** | Type the finished part's width and the scale is back-computed from it — usually easier than knowing what the file's units actually meant. |
| **Place** | **Bottom-left at origin**, **Centred on origin**, or **As drawn** (no repositioning). |
| **Mirror Y** | On by default for SVG (its Y axis grows downward; the machine's grows up) and off by default for DXF (usually already Y-up) — always overridable; turn it on if the preview looks upside-down. |
| **Origin X / Origin Y** | Added after scale and anchoring, in mm. |
| **Curve tolerance** | How far a flattened curve may stray from the true one, mm. Changing it **re-imports the file** (it's consumed at flattening time, not a downstream parameter) and clears any path exclusions, since re-flattening renumbers the path list. |
| **Join gap** | Segment endpoints this close together are treated as joined into one loop — a DXF rectangle is four separate `LINE` entities and needs this to become a single closed path. Changing it also renumbers paths and clears exclusions. |

## Side and tool

**Side** decides cutter compensation:

- **Outside the line** / **Inside the line** — offsets the profile by the tool radius (+ any
  allowance) using proper polygon offsetting (Clipper), so holes growing while their outer wall
  shrinks, self-intersecting offsets on narrow slots collapsing correctly, and reflex-corner joins are
  all handled properly rather than approximated. Only **closed** paths have an inside/outside; any open
  path is skipped with a warning under these two sides. If the tool is too large to fit inside a given
  profile, that profile disappears from the cut with a warning rather than cutting the wrong thing.
- **On the line** — no compensation; the tool centre follows the drawing exactly. This is the only
  side that accepts **open** paths, which makes it the way to engrave/score a line rather than cut a
  closed profile.

**Climb milling** sets travel direction. The plugin works out per-loop which direction is actually
climb — cutting outside a profile keeps the material inside the loop, but cutting inside one is an
aperture where the material is on the *other* side, so the correct travel direction inverts between
the two. Getting this backwards is an easy mistake to make by hand; it's derived here instead of
asked for directly.

Other fields: **Tool ⌀** and **Tool number** (a bare `T<n>` tool change before cutting — leave blank to
use whatever's already loaded; a blank field is treated as "don't know", never as tool 0), **Leave
stock** (allowance, mm — only shown for Inside/Outside; positive moves the cut away from the part on
both sides for a later finishing pass), **Z top**, **Depth**, **Per pass** (the cut is automatically
split into that many depth levels), **Ramp** (descend over this much travel along the path instead of
plunging straight down — 0 plunges, which needs a centre-cutting tool), **Feed**, **Plunge** feed,
**RPM**, **Safe Z**, **Spindle dwell** (seconds after the spindle starts, before it moves), and
**Tabs** — count (0 disables), width and height: short uncut bridges left in the wall so a fully-cut
part doesn't come loose and get thrown by the last pass.

## Running the cut

Before the buttons light up, check the warnings panel — it surfaces anything about the current
geometry/parameters worth knowing (a tool too large for a profile, open paths that will only be
skipped, tabs taller than the cut depth so they were ignored, no ramp so the tool will plunge). A
part with any geometry below machine X0/Y0 gets an explicit extra warning, since that's very likely
off the front or side of the bed and otherwise invisible until the cutter gets there.

- **Download G-code** — always available once a program has been built; saves the `.gcode` file
  locally.
- **Cut it** — uploads the program to `0:/gcodes/<drawing name>.gcode` and starts it (`M32`). Blocked
  while any of X/Y/Z is unhomed, while a job is already running, or without `runJobs` permission — each
  reason is shown next to the button. A confirmation dialog first summarises the bounding box, loop
  count, cut side and direction, depth, and the same warnings, so the last thing you see before
  committing is what's actually about to run.

Cut order is holes/smaller loops first, then the outer profile — cutting a hole after its container is
already free would mean cutting a part held on only by tabs. Any open (engraved) paths are cut before
all of that, since engraving a part that's already been profiled out defeats the point of the tabs
holding it.

The generated program is plain RS-274 — `G21 G90 G17 G94`, `G0`/`G1` moves, a bare `T<n>` for a tool
change (RepRapFirmware's own tool-change macros run around it; no `M6`), `M3`/`M4 S<rpm>` + a dwell,
`M5`, and `M2` to end — no RRF expressions or macro calls, so it's inspectable and can be reloaded into
FL's own **Toolpath** widget afterwards to see exactly what will run.

## What this doesn't do

- **No pocketing or drilling.** Profile (contour) cuts only, at the chosen side/depth/tabs — clearing
  out the inside of a shape, or a dedicated peck-drill cycle, aren't operations this page offers.
- **No G-code simulation.** The 2D preview shows the toolpath in plan view; it does not simulate the
  cut, check for collisions, or verify feeds/speeds against your tooling. Read the warnings and the
  confirm dialog, and check the result against the real material before trusting an unfamiliar
  drawing.
- **Doesn't set up work coordinates.** The cut runs in whatever work coordinate system (WCS) is
  currently active — set your origin/zero (see the **Work offsets (CNC)** or **WCS table (CNC)**
  widgets) before running, not after.
- Scale is uniform — the same factor applies to both axes; there's no independent X/Y stretch.
