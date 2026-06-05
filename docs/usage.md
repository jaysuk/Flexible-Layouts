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
- **Add widget** opens the palette (see [widgets.md](widgets.md)).
- Built-in DWC pages (Console, Settings, File Explorer, Job…) can't take widgets — you'll see an
  amber note on those while editing.

The **Dashboard** and any page you create are editable grids. On a built-in page's first edit you're
offered *Use current layout* (seed it from the stock content) or *Start blank*.

## Pages

Open **Manage pages** (the edit toolbar, the drawer, or *Settings → Flexible Layouts*) to:

- **Create / rename / delete** pages, and pick an icon and menu section.
- **Hide / reorder** pages in the navigation.
- Set a page-level **grid size** (columns / row height) and **background**.
- Make a page **conditional** — only shown when an object-model rule is true (e.g. a CNC page only in
  CNC mode).

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

Exports record which plugins a layout depends on; importing shows a **dependency diff** and warns
about anything you don't have installed before it replaces/merges. There's also an **Add sample CNC
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
