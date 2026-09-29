# Using Flexible Layouts

This is a tour of everything the plugin can do once it's installed and started. For installation see
the [README](../README.md); for a per-widget reference see [widgets.md](widgets.md).

## Activating & leaving the custom shell

- **Activate:** *Settings → Flexible Layouts → Switch to Flexible Layouts*, or *Settings → Display*.
  The top app bar gains an **Edit** button.
- **Leave:** click **Switch to default** in the same place, or visit **`/BuiltInLayout`** in the
  address bar at any time. This always works, even if a custom page has a problem.

Activating only changes *your* view — installing or starting the plugin changes nothing until you opt
in.

## Editing

Click **Edit** in the top bar to start; **Done** to finish.

- **Move** a panel by dragging its **header**; **resize** from a **corner**.
- Each panel has header buttons to **configure** (⚙), **duplicate** (⧉), **lock** (🔒), **back up**
  (💾), **edit contents** (for groups) and **delete** (🗑).
- **Undo / redo** with **Ctrl+Z / Ctrl+Y**.
- **Add widget** opens the palette: filter by **category** chips (Controls, Machine, Read-outs,
  Dashboard, Layout, Built-in panels, Plugin pages) or **search**, then click a tile to add it
  (see [widgets.md](widgets.md)).
- **Change a panel's icon** in its ⚙ properties (handy when the same panel appears several times).
- Built-in DWC pages that aren't overridden (Settings, Job…) can't take widgets — you'll see an amber
  note on those while editing. The File Explorer is one of them unless you opt into the replacement
  (see [Explorer & G-code editor](#explorer--g-code-editor)).

The **Dashboard** and any page you create are editable grids. On a built-in page's first edit you're
offered *Use current layout* (seed it from the stock content) or *Start blank*.

## Shaped buttons & nestling

Command buttons aren't limited to rectangles. In a button's **properties → Shape**, pick a circle,
hexagon (or any polygon), star, wedge, chevron/arrow, diamond, trapezoid or a custom path, and set its
stroke, fill opacity and rotation. A shaped button only reacts **within the shape**, so buttons can
overlap and **nestle** together. (The properties **preview** is look-only — it shows exactly what the
button will look like on the page and never triggers the command.)

To assemble nestled controls precisely, put shaped buttons in a **group** and switch the group to
**free mode** (the toggle in *edit contents*). In free mode you drag, **resize**, **rotate** (the
handle above a selected item) and overlap children freely, with **bring-to-front / send-to-back** for
z-order. **Arrange…** lays the children out automatically in a **ring** (centre, radius, count, start
angle, optionally rotating each to face outward) or a **hex** grid. The same Arrange tool is on the
page edit toolbar for a multi-selection.

Ready-made **presets** in the palette (e.g. a **Hex Pad**) are just free-mode groups you can edit. For
a movement dial, prefer the dedicated **CNC / Octopus jog** widget.

## Pages

Open **Manage pages** (the edit toolbar, the drawer, or *Settings → Flexible Layouts*) to:

- **Create / rename / delete** pages, and pick an icon and menu section.
- **Hide / reorder** pages in the navigation.
- Set a page-level **grid size** (columns / row height) and **background**.
- Make a page **conditional** — only shown when an object-model rule is true (e.g. a CNC page only in
  CNC mode).
- Turn on **Full page** (edit toolbar → *Page & background*) to fill the screen below the top bar and
  open the page scrolled down so the status bar is out of the way, like DWC's own Explorer. It follows
  DWC's *Settings → Behaviour* auto-scroll (off = no scrolling).
- **Lock while printing** — per widget, or for the whole page. The stock Console and Temperatures
  pages are never locked; Dashboard and Macros are, until you customise them.

## Explorer & G-code editor

*Settings → Flexible Layouts → G-code editor*:

- **Use the new G-code editor** opens G-code files and 12864 menu files (`0:/menu/…`) in a CodeMirror
  editor with real syntax highlighting and error checking (other file types still use DWC's editor).
- **Also replace the Explorer page** swaps DWC's Explorer for a full-page Flexible Layouts one that uses
  it. Links from notifications and macro lists still work. It needs a page reload to apply, and unlike
  the stock page it isn't kept alive when you leave, so you're asked before leaving with unsaved edits.
- **12864 display preview** — open a menu file (`0:/menu/…`) in that Explorer and toggle the preview: an
  emulated 12864 (ST7920) display, pixel-accurate to RepRapFirmware, driven by your printer's real
  menu files and live values. Click a button on the screen or use the knob; commands are only listed,
  never sent. With the new editor on, it **follows your unsaved edits** as you type (a "Live" badge shows
  it, and an edit to another open menu file shows up too); menu files opened in DWC's own editor show the
  saved file and refresh when you save. It lists every problem in the menu (RepRapFirmware stops loading a
  menu at the first one), and the editor underlines the same problems in the text.

## Phones

Below tablet width the top bar gets a **status bar toggle** and, while printing, a **progress ring**
(tap it for the job page). *Settings → Flexible Layouts → Phone navigation* (per device) switches to DWC's
own phone navigation: the home screen becomes a grid of page tiles with a back arrow instead of the side
menu (editing still uses the side menu).

## Responsive layouts

While editing, a **desktop / tablet / phone** toggle lets each page hold a separate layout per screen
size. Smaller sizes inherit the larger layout until you change them; *Reset* clears a breakpoint back
to inheriting.

## Profiles

**Layout profiles** keep several complete interfaces (e.g. one for FFF, one for CNC) that you switch
between from the top bar (a quick switcher appears once you have more than one). Manage them from
**Layout profiles** in the settings tab. Importing and single-document operations act on the
**active** profile.

## Backup & share

From **Backup & share** (settings tab) or the per-item / per-page buttons you can export:

- the **whole layout** as `.dwclayout.json`,
- a single **page** as `.dwcpage.json`,
- a single **panel** as `.dwcpanel.json`.

Exports record which plugins a layout depends on **and the Flexible Layouts version** that produced
them; importing shows a **dependency diff** and warns about anything you don't have installed — and if
the file was made with a **newer Flexible Layouts** than you're running (update for full
compatibility) — before it replaces/merges. There's also an **Add sample CNC
page** preset to see a worked example.

## Theming

**Theme & colours** (settings tab) sets a global palette/theme and the top-bar styling (colour,
title, logo). Individual panels can override their background / header / text colours, font size and
family in the panel's ⚙ dialog.

## Password lock

An optional **soft kiosk lock** (settings tab → Lock). When enabled it requires a password to:

- enter **edit mode**, and
- **leave** the custom layout (it catches the Settings switch and the `/BuiltInLayout` URL).

While locked, the **Plugins** page is hidden so the plugin can't be casually stopped.

> **It is a deterrent, not security.** It's enforced in the browser, so anyone with dev tools, who
> stops the plugin from another session, or who clears settings can bypass it. The password is stored
> only as a salted hash. The lock's enabled state + hash live in board settings (so they travel with
> the machine); the per-session *unlock* resets on reload by design.

## If something goes wrong

- Visit **`/BuiltInLayout`** to return to stock DWC.
- A page that errors shows a recovery panel with a **Retry** and a **return to built-in** button
  rather than blanking the screen.
