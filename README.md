# Flexible Layouts

A [DuetWebControl](https://github.com/Duet3D/DuetWebControl) (DWC) plugin that gives you complete,
drag-and-drop control over the interface: rearrange panels on a page, build your own pages, add
buttons / live read-outs / charts, recolour everything, make widgets react to the machine, keep
multiple switchable interfaces, and share it all as a file.

> **Compatibility:** requires the **Vue 3 / Vuetify 4 DWC** (3.7-alpha or later). It will **not**
> load on the older Vue 2 DWC (3.5 / 3.6) bundled with current RepRapFirmware.

## Install

1. Download the latest `FlexibleLayouts-*.zip` from the [Releases](../../releases) page (or build it
   yourself — see [Building](#building)).
2. In DWC: **Settings → Plugins → Install plugin**, pick the ZIP, then click the plugin row to
   **Start** it.
3. Activate the custom shell: **Settings → Flexible Layouts → Switch to Flexible Layouts** (or
   **Settings → Display**). The top bar gains an **Edit** button. *(On first install you'll also get a
   one-time notification pointing you here.)*
4. Escape hatch at any time: visit **`/BuiltInLayout`** to return to stock DWC.

## What you can do

- **Editable pages** — the Dashboard and any pages you create are drag-and-drop grids. Built-in DWC
  pages (Console, Settings, File Explorer, Job…) are intentionally left as-is.
- **Page management** — create / rename / hide / reorder / delete pages, set per-page grid size and
  background, and show a page only when an object-model condition is true.
- **Widgets** — built-in DWC panels, pages/tabs from other plugins, custom-panel groups, command
  buttons (G-code / macros / HTTP / open-URL) **in many shapes (circle, hexagon, star, wedge,
  chevron…) that can overlap and nestle**, a Pronterface-style **jog** control **and a CNC 'octopus'
  jog** (8-way with diagonals), a **NeoPixel/LED-strip** controller, a **`global.*` variables editor**, input fields, **sliders**,
  **toggles/switches** and **+/- steppers** (all command-driven, optionally OM-bound), live value
  read-outs, live charts (with CSV download), **progress bars**, **status indicators**, **alert
  banners**, **webcam/snapshot**, **macro grids**, a **mini console**, **heater tiles**, a
  **clock/timer**, **value tables**, text / images, and web embeds.
- **Smart behaviour** — per-widget object-model **conditions** (recolour / hide / disable), **value
  formatting** (units, on/off, value→text maps), **colours**, **font size & family**, and
  **scale-to-fit**.
- **CNC & machine tools** — bed mesh (view/edit/re-probe a heightmap), bed tramming, a **WCS table**
  (edit all six work offsets at once), a built-in **XYZ corner probe** with no macros to write, raw
  **probe routines** (tool-length, XY skew, bore/boss centring, edge-finding), a **surfacing wizard**,
  camera-based **tool alignment**, **preflight checks** (bounds/homing/tool sanity on a G-code file
  before you run it), a live **toolpath viewer**, **machine health** + **maintenance tracking**
  (usage hours, tool changes, job counts), and **firmware update** browsing across mixed board rigs.
  See [docs/widgets.md](docs/widgets.md) for the full list.
- **Shapes & nestling** — give command buttons non-rectangular shapes that react only within the
  shape, drop them into a **free-mode group** (drag / resize / rotate / overlap with z-order), and use
  **Arrange…** to lay them out in a ring or hex grid. Ready-made **presets** (e.g. a Hex Pad) get you
  started.
- **Responsive** — a separate layout per screen size (desktop / tablet / phone).
- **Editing aids** — undo/redo (Ctrl+Z / Ctrl+Y), duplicate, lock, and an object-model **path
  picker** so you never have to type paths.
- **Layout profiles** — several complete interfaces (e.g. FFF / CNC) you switch between from the top
  bar.
- **Backup & share** — export the whole layout (`.dwclayout.json`), a single page (`.dwcpage.json`)
  or a single panel (`.dwcpanel.json`); imports warn about any plugins you're missing (and if the layout
was made with a newer Flexible Layouts than you have installed).
- **Header** — pin mini widgets into the top bar and restyle it (colour / title / logo).
- **Optional password lock** — a soft kiosk lock that gates editing and the escape-to-built-in
  switch behind a password (see [docs/usage.md](docs/usage.md#password-lock) for its limits).
- **Config backup & restore** — back up the whole machine (`sys`/`macros`/`filaments`, object model,
  M122 diagnostics) to your PC, GitHub, Google Drive or the Duet backup service, with optional
  redaction of WiFi/passwords and cross-machine restore. See
  [docs/config-backup.md](docs/config-backup.md).
- **TLS / HTTPS setup** — a step-by-step helper for RepRapFirmware 3.7's TLS support (serving DWC/FTP/
  Telnet encrypted from the printer itself): checks your board/firmware can do it, walks you through
  generating a certificate, uploads it, enables TLS, and patches `config.g` so it survives a reboot.
  See [docs/tls-setup.md](docs/tls-setup.md).
- **Cut from drawing** — turn an SVG/DXF outline into a G-code profile cut: load a file, pick which
  paths to cut and which side of the line, set depth/passes/tabs, preview the toolpath, then run it or
  download the file. See [docs/vector-import.md](docs/vector-import.md).

See **[docs/usage.md](docs/usage.md)** for a full tour and **[docs/widgets.md](docs/widgets.md)** for
the widget reference.

## Data & persistence

Everything is stored per-profile under DWC's settings (`plugins.flexibleLayouts`). By default DWC
saves settings **on the board** (`0:/sys/dwc-settings.json`), so a layout follows the **machine**: it
loads the same from any PC, and survives the board's IP/hostname changing. The exception is DWC's
**Settings → General → "Store settings in this browser"** (`settingsStorageLocal`): with that on, the
layout lives only in that browser's `localStorage`, keyed by origin — it won't appear on another PC,
and an IP/hostname change orphans it. Leave it off for portability. Large layouts increase settings
size; keep images as URLs rather than data URIs.

## Building

The plugin is built against a local checkout of the Vue 3 DWC source.

```bash
# one-time, in this repo (pulls in grid-layout-plus, which is bundled into the plugin)
npm install

# build the installable ZIP — run from your DWC checkout
npm run build-plugin-pkg -- /path/to/Flexible-Layouts
```

On Windows, edit `DWC_DIR` at the top of **`build.bat`** to point at your DWC checkout and run it —
it builds and drops `FlexibleLayouts-<version>.zip` in this folder. The ZIP is gitignored; attach it
to a GitHub Release for distribution.

Run the unit tests with `npm test`.

More detail — architecture, the externalised-import model, and the gotchas of building an external
DWC plugin — is in **[docs/development.md](docs/development.md)**.

## License

GPL-3.0-or-later
