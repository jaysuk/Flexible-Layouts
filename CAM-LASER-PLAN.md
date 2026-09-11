# Laser support for Vector Import ("Cut from Drawing") — Phase 2 & 3 plan

Status: **proposed, not started.** Written for later reference; no code in this plan has been
written yet. This is the first `*-PLAN.md` in this repo (the family convention comes from the
sibling `dwc-config-backup-core`/`duet-config-backup-plugin` repos' `*-PLAN.md` docs) — investigate
with real evidence, write a grounded plan, implement phase by phase, same as those.

## §1 Context

Vector Import (`src/vectorImport/VectorImportPage.vue`, nav-labelled "Cut from Drawing") generates
router-CAM G-code from an imported SVG/DXF: offset the drawing by a tool radius, order the resulting
loops, cut them at depth with tabs. As of the CNC-mode gating work landed alongside this plan
(`src/util/machineMode.ts`'s `isCncOrLaserMode`), the page's nav entry only appears when
`state.machineMode` is `CNC` or `Laser`, and the "Cut it" button hard-blocks outside that too — so
laser users already reach this page today, into a **router-only** parameter set that doesn't apply to
them (RPM, plunge feed, depth-per-pass make no sense for a laser).

This plan is Phase 2 (laser **vector** cutting - the natural next step, reusing most of the existing
pipeline) and Phase 3 (raster **engraving** - a genuinely separate pipeline). Phase 1 (the CNC-mode
gate) is done.

## §2 What exists today (the reusable 90%)

- **`model/vectorImport/{svg,dxf,geometry,offset,svgSample,svgUnits,types}.ts`** — drawing import,
  simplification, chaining, tool-radius offsetting, cut ordering. None of this cares what's making the
  cut; it produces the same `Polyline[]` regardless of router or laser. **Fully reusable as-is.**
- **`model/cam/format.ts`** — the `Gcode` builder class (`rapid`/`feed`/`toolChange`/`spindleOn`/
  `spindleOff`/`end`) plus `depthLevels()`. This is the one place that's genuinely router-shaped:
  `spindleOn(rpm, dwellSeconds)` emits `M3 S<rpm>` + a dwell, and `depthLevels()` produces incremental
  Z-steps down to full depth. Everything else (`rapid`/`feed`/`toolChange`/`end`, the `n()` finite-number
  guard) is motion-primitive-level and reusable unchanged.
- **`model/cam/tabs.ts`** (`cutLoopWithTabs`, `describeTabs`, `TabSpec`) — ramped entry + tab-hold
  logic for a single loop at a single Z. Reusable unchanged for laser vector cutting (see §3).
- **`model/cam/profile.ts`** (`profile()`, `ProfileParams`) — the router-specific orchestrator: builds
  the header/warnings, calls `depthLevels`/`spindleOn`/`cutLoopWithTabs` in the right order. This is
  the file a laser path needs its own sibling of, not a patch to.
- **`VectorImportPage.vue`** — one flat parameter panel (scale/place/side/router-cut fields) feeding
  `profile()` directly. This needs a process split (§4.1) before laser fields can coexist with it
  sanely.

## §3 RRF laser fundamentals — **verify before writing code**

RRF's laser mode (`M452`) reuses the spindle G-code vocabulary: `M3 S<power>`/`M4 S<power>` turn the
laser on (at a power tied to `M452`'s configured range), `M5` turns it off, `G0`/`G1` move exactly as
for milling. `M4` (vs `M3`) is the standard laser-cutting convention — power scales down with feed
rate so slow moves/corners don't overburn — and is almost certainly what this plan's laser vector-cut
mode should default to. **This needs confirming against RRF's actual current gcode meta reference
before Phase 2 implementation starts**, specifically:
- The exact power range/units `M452` configures S as (0–255 vs 0–1 vs a percentage), so the UI's
  power field and its bounds are right.
- Whether `M3`/`M4` are genuinely both supported and behave as expected on the firmware versions this
  plugin targets.
- For Phase 3 specifically: whether a live per-move power (`G1 X.. S..`, one S per short segment) is
  supported, vs. needing discrete `M3 S..` calls between moves (see §5.3) — this materially changes
  the raster emission strategy, not just a parameter value.

## §4 Phase 2 — Laser vector cutting

### §4.1 A process selector, splitting the parameter panel

Add a "Process" field to `VectorImportPage.vue`: **Router** (today's behaviour, default) or **Laser**.
Default it from the live machine mode (`state.machineMode === "Laser"` → Laser, `"CNC"` → Router) via
the same `isCncOrLaserMode`-adjacent check, rather than making the user pick every time.

Selecting Laser swaps the parameter section (§111-182 of the current template) to laser fields and
hides the router-only ones:

| Router field (kept for Router) | Laser replacement |
|---|---|
| `rpm` | **Power** (0–100%, or whatever unit §3 confirms; stored as a 0–1 or 0–255 internal value, displayed as %) |
| — | **Dynamic power** checkbox (`M4` when on, `M3` when off) — default **on** |
| `depthPerPass` | **Passes** (integer ≥1) — laser doesn't step Z; it repeats the same path N times to cut through |
| `plungeFeed`, `spindleDwell`, `rampLength` | hidden — no physical plunge. A short **lead-in** length (laser fires briefly before reaching full speed, avoiding a burn dot at the start point) may be worth keeping as an optional laser-specific field, but is a nice-to-have, not required for v1 |
| `zTop`, `depth` | hidden — laser Z is a fixed focus height, not a depth target. Replace with a single **Focus height** field |
| `toolDiameter` | kept, relabelled **Kerf width** — same offsetting role, different physical cause |
| `toolNumber` | hidden — a laser has no tool change |
| Tabs (`tabCount`/`tabWidth`/`tabHeight`) | kept, but default `tabCount` to a smaller value (or 0) - laser kerf is much thinner than a router bit, so the existing router defaults would look odd; the *mechanism* (§4.3) carries over unchanged |

### §4.2 `Gcode` gains laser primitives

In `format.ts`, alongside `spindleOn`/`spindleOff`:

```ts
laserOn(power: number, dynamic: boolean): this {
  this.raw(`${dynamic ? "M4" : "M3"} S${Math.round(requireFinite(power, "laser power"))}`);
  return this;
}
laserOff(): this {
  return this.raw("M5");
}
```

No dwell (unlike `spindleOn` — a laser doesn't need to spin up). Exact `S` scaling depends on §3's
answer; keep the power-to-S conversion in one place (probably here) so a firmware-range surprise is a
one-function fix.

### §4.3 A `laserProfile()` sibling to `profile()`

New function in `model/cam/profile.ts` (or a new `model/cam/laserProfile.ts` if it diverges enough to
warrant its own file — decide once it's actually written, per this repo's own "extract once a second
consumer needs it" convention rather than pre-emptively). Same shape as `profile()`, but:
- No `depthLevels()` — one Z (focus height) for every pass.
- The `for (const z of levels)` loop in `profile()` becomes `for (let pass = 0; pass < p.passes; pass++)`
  at the same fixed Z.
- `g.spindleOn(p.rpm, p.spindleDwell)` → `g.laserOn(p.power, p.dynamicPower)`; `g.spindleOff()` →
  `g.laserOff()`.
- `cutLoopWithTabs` is reused as-is (tabs are a geometry/Z concept, indifferent to what's cutting) -
  pass `rampLength: 0` unless the optional lead-in from §4.1 is implemented.
- `g.toolChange(...)` is dropped entirely (no tool concept for a laser).

### §4.4 Testing

Mirrors `test/vectorImport*.test.ts`'s existing coverage style for `profile()`: golden-ish assertions
on emitted G-code lines for a simple square/circle loop, at 1 and N passes, dynamic vs constant power,
and the "nothing survived offsetting" empty-input path. Add `format.test.ts` cases for `laserOn`/
`laserOff` mirroring the existing `spindleOn`/`spindleOff` ones (including the `requireFinite` guard on
a non-finite power, same reasoning as the existing RPM guard).

## §5 Phase 3 — Raster engraving

A genuinely separate pipeline from the vector-offset one above, not an extension of it.

### §5.1 Input

Two possible sources, either of which is a legitimate v1 scope on its own:
- **(a) An embedded raster image** inside the SVG (`<image>` element, base64 or linked) — sample it
  directly to grayscale.
- **(b) Filled vector shapes treated as solid regions** ("fill" engraving) rather than only their
  outline — needs a scanline-fill algorithm over the existing `Polyline[]`, no image decoding.

Recommend starting with (a) alone: it's the more commonly-requested "engrave a photo/logo" use case,
and (b) can follow once (a)'s scan/power-mapping/UI machinery exists, reusing most of it.

### §5.2 New module: `model/cam/raster.ts`

Kept separate from `offset.ts`/`geometry.ts` (per this repo's stated convention: shared logic is
extracted once a second consumer needs it, and image sampling has nothing in common with polyline
offsetting). Responsibilities:
- Sample the source image to a grayscale grid at a configurable resolution (line spacing, i.e. an
  engraving "DPI" equivalent — mm/line, not dots-per-inch, to stay consistent with this plugin's
  mm-only convention elsewhere).
- Generate scan lines: boustrophedon (alternating left-to-right / right-to-left per row) across the
  artwork's bounding box, each row a list of `(x, power)` samples.
- Power mapping: linear luminance→power by default, with an **invert** toggle (some source images
  are authored dark-on-light, others the reverse) and room for a **dithering** option later (not v1 -
  ordered/error-diffusion dithering meaningfully improves perceived quality on grayscale engraves but
  adds real complexity; ship flat threshold/linear mapping first).

### §5.3 G-code emission — blocked on §3's answer

Two candidate strategies, and which one is buildable depends entirely on confirming RRF's actual
per-move laser power support:
- **Inline per-move power** (`G1 X.. S..`, changing S on (almost) every segment along a scan line) -
  the efficient approach if RRF supports it: one G1 per pixel/segment, power baked into the same move.
- **Discrete on/off runs** (`M3 S<power>` / `M5` bracketing each contiguous run of similar-power
  pixels along a row) - works everywhere, but produces far more lines for a smooth gradient and reads
  worse as "the same primitive is doing two different jobs" against `Gcode`'s existing `spindleOn`/
  `laserOn` meaning "get to speed/on for the whole operation," not "toggle every few mm."

Whichever it is, add the primitive to `Gcode` in `format.ts` (`laserMove(x, power)` or similar) rather
than hand-rolling raw strings in `raster.ts` — same separation of concerns as every other emission
path in this file.

### §5.4 File size

A modest engrave (say 100mm × 100mm at a 0.1mm line spacing) is 1000 scan lines; at even a
conservative few points per mm of scan, that's plausibly hundreds of thousands of G-code lines - one
to three orders of magnitude past anything the router path or the rest of this plugin produces today.
Needs, before this ships:
- A generated-size estimate shown to the user before committing to "Cut it" (this plugin already has
  a size-awareness precedent worth reusing the *idea* from, if not the code: the config-backup
  feature's Duet-cloud 2MB preflight check).
- Confirm DWC's upload path and RRF's SD card/streaming handling are comfortable with a file that
  size - this is a real open question, not an assumption to build on top of.

### §5.5 UI

A new mode within Vector Import (or a genuinely separate page/tab if it turns out raster's workflow
doesn't fit the existing "load a drawing, tweak params, cut" shape - decide once §5.1's image-loading
UX is actually mocked up): line spacing, power curve (min/max, invert), engrave speed (typically much
faster than a vector cut - it's not removing material), and a live preview. The existing
`<canvas ref="canvasRef">` preview infrastructure in `VectorImportPage.vue` is reusable for rendering
the sampled/thresholded image before committing to a full G-code generation pass.

## §6 Phasing recommendation

1. **Phase 2a** — process selector + laser vector cutting (§4). Delivers real value on its own
   (anyone with a laser can already cut vectors with this plugin, just not sensibly today) without
   touching anything raster-shaped.
2. **Phase 2b** — the optional lead-in field, if wanted after Phase 2a ships and gets used.
3. **Phase 3a** — raster engraving from an embedded image (§5.1a) + whichever emission strategy §3/§5.3
   turns out to be right, at a fixed line spacing with linear power mapping only (no dithering).
4. **Phase 3b** — fill-region engraving (§5.1b) once 3a's scan/power/UI machinery exists to reuse.
5. **Phase 3c** — dithering, if image quality on real engraves warrants it.

Don't start Phase 3 implementation before §3's RRF G-code questions are actually confirmed - it
changes the emission strategy, not just a detail within one.

## §7 Open questions

1. **RRF's exact laser G-code dialect** (§3) - blocks Phase 2's power-scaling correctness and
   entirely determines Phase 3's emission strategy (§5.3). Spike this first.
2. **Tabs for laser-cut parts** - keep the mechanism (§4.1) but is a *default* of "on" still right, or
   should laser default to no tabs given how much thinner a laser kerf is and how differently a
   laser-cut part behaves (it doesn't experience the lateral force a spinning bit does)? Needs a
   decision once someone's actually laser-cut a test part with this.
3. **Raster input scope** (§5.1) - confirm image-based (a) is the right v1 target over fill-region (b)
   before investing in the sampling/UI work; either is defensible, but they're not the same effort.
4. **Dithering** (§5.2/§6 item 5) - explicitly deferred past v1; revisit once real engraves show
   whether flat linear mapping is good enough.
