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
  buttons (G-code / macros / HTTP / open-URL), a Pronterface-style **jog** control, a
  **NeoPixel/LED-strip** controller, a **`global.*` variables editor**, input fields, **sliders**,
  **toggles/switches** and **+/- steppers** (all command-driven, optionally OM-bound), live value
  read-outs, live charts (with CSV download), text / images, and web embeds.
- **Smart behaviour** — per-widget object-model **conditions** (recolour / hide / disable), **value
  formatting** (units, on/off, value→text maps), **colours**, **font size & family**, and
  **scale-to-fit**.
- **Responsive** — a separate layout per screen size (desktop / tablet / phone).
- **Editing aids** — undo/redo (Ctrl+Z / Ctrl+Y), duplicate, lock, and an object-model **path
  picker** so you never have to type paths.
- **Layout profiles** — several complete interfaces (e.g. FFF / CNC) you switch between from the top
  bar.
- **Backup & share** — export the whole layout (`.dwclayout.json`), a single page (`.dwcpage.json`)
  or a single panel (`.dwcpanel.json`); imports warn about any plugins you're missing.
- **Header** — pin mini widgets into the top bar and restyle it (colour / title / logo).
- **Optional password lock** — a soft kiosk lock that gates editing and the escape-to-built-in
  switch behind a password (see [docs/usage.md](docs/usage.md#password-lock) for its limits).

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
