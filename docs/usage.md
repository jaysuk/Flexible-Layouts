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
- **Copy, cut, paste and duplicate** the selected panels (tick the checkbox on each panel's header) with
  **Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D**, or the buttons in the toolbar - pasted panels get new ids, keep their layout
  relative to each other, land in the first free gap and are **one undo step**. The copy is also written to the system
  clipboard as JSON, so you can paste it into another browser, another profile or another machine (or, on a touch device
  with no keyboard, use **Paste from text…**). Panels that embed a plugin you don't have show a warning. The shortcuts only
  act while you are editing, and never while you are typing in a field or a dialog is open.
- **Move and resize from the keyboard:** Tab to a panel's header, press **Enter** to pick it up, then the **arrow keys** move
  it one cell and **Shift + arrows** resize it; **Enter** or **Escape** puts it down. Each step is announced to screen
  readers, and the whole move is one undo step.
- **Add widget** opens the palette: filter by **category** chips (Controls, Machine, Read-outs,
  Dashboard, Layout, Built-in panels, Plugin pages) or **search**, then click a tile to add it
  (see [widgets.md](widgets.md)).
- **Change a panel's icon** in its ⚙ properties (handy when the same panel appears several times).
- Built-in DWC pages that aren't overridden (Settings, the Jobs browser) can't take widgets — you'll see an amber
  note on those while editing. The File Explorer is one of them unless you opt into the replacement
  (see [Explorer & G-code editor](#explorer--g-code-editor)).

The **Dashboard**, **Console**, **Temperatures**, **Macros**, **Job > Status** and **Job > Webcam** pages, and any page you create, are editable grids. On a built-in page's first edit you're
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
- A page's **address** is made from its name when you create it (`…/Plugins/FlexibleLayouts/p/print-farm`;
  a second page of the same name gets `-2`). It doesn't change when you rename the page, so bookmarks
  keep working. Pages made before this had a long random address; they were given readable ones the first
  time the layout loaded, and the old address still opens the page (and sends you on to the new one).
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
  it. Links from notifications and macro lists still work. It applies as soon as you flip the switch on a DWC
  that can change a layout's pages while running (DWC builds with `addLayoutRoutes`); on older builds the
  setting says when a page reload is needed. Unlike the stock page it isn't kept alive when you leave, but it
  remembers what it had open: come back (from another page, or an Explorer panel on a dashboard coming back
  into view) and the same files are open in the same tabs, with your cursor and scroll position, and any
  **unsaved edits** are still there, still unsaved. This lasts until you reload the browser page. The address
  follows the tab you're on (`/Explorer/edit/macros/foo.g`), so Back, refresh and bookmarks work as in DWC's own
  Explorer. Only an unsaved edit in DWC's own editor (not the new one) can't be brought back, so leaving with one
  still asks first.
- **12864 display preview** — open a menu file (`0:/menu/…`) in that Explorer and toggle the preview: an
  emulated 12864 (ST7920) display, pixel-accurate to RepRapFirmware, driven by your printer's real
  menu files and live values. Click a button on the screen or use the knob; commands are only listed,
  never sent. With the new editor on, it **follows your unsaved edits** as you type (a "Live" badge shows
  it, and an edit to another open menu file shows up too); menu files opened in DWC's own editor show the
  saved file and refresh when you save. The **Message box** button puts up a sample `M291` box (OK, OK and
  Cancel, Close, or with X/Y/Z jog values) so you can see how one looks on the display - a preview has no
  live `M291` - and its OK / Cancel buttons list the `M292` they would send and take the box down. It lists every problem in the menu (RepRapFirmware stops loading a
  menu at the first one), and the editor underlines the same problems in the text.

## Starter layouts

**Add widget → …** is not the only way to begin: *Layout & sharing → Browse starter layouts…* (and the first-run
welcome) offers ready-made pages - **Printer dashboard**, **Print monitor** (big progress, thumbnail, times, temperatures,
webcam, pause / resume / cancel and an emergency stop - made for a wall display), **Touchscreen simple** (a few large
buttons), **Laser** and **CNC**. The ones that fit your machine (by its mode, or DWC's *Dashboard mode* setting) are listed
first. A starter is always added as a **new page** (optionally in its own new profile) and never changes an existing one;
everything on it can be edited afterwards.

## Keyboard shortcuts on buttons

A **command button** or **toggle** can have a keyboard shortcut - open its ⚙ properties and click the **Keyboard shortcut**
field, then press the keys. It needs **Ctrl** (⌘ on a Mac) or **Alt**, or can be an **F-key**; combinations the browser or
common editing already uses (Ctrl+W, Ctrl+C, F5, F12…) are refused, and a shortcut already used by another widget on the page
is flagged. A small key badge on the button is optional.

A shortcut does exactly what a click does: the **print lock**, the **access lock**, a **condition that disables** the widget,
a **confirm** dialog and the **debounce** all still apply (a locked widget just says it is locked). Shortcuts are bound only
while their widget is on screen - a widget on another page, or hidden by a condition, does not respond - and they stand down
while you are typing, while a dialog is open, on key repeat and (unless you turn that on) while editing the layout. The
emergency-stop widget deliberately has no shortcut. *Settings → Flexible Layouts → Keyboard shortcuts* switches them on/off for
this browser.

## Sound and vibration

Off by default, and **per browser** - nothing is stored in the shared layout. *Settings → Flexible Layouts → Sound and
vibration* has a master mute, a volume, a **Test sound** button, and a switch per event: **a job finishes**, **a job is
cancelled or the machine halts**, **the job is paused**, **a filament monitor faults**, **a heater faults**, **an M291 message
box appears** - each with its own cue (chime, double beep, alarm, low buzz) and, on a device that can vibrate, an optional
vibration. Cues fire on the change, not while a condition merely persists, and not for whatever state the machine was already in
when the page loaded. Browsers refuse audio until you have clicked or tapped the page once (the settings say so), and a
background tab may delay them.

Per widget: a **condition** can also *play a sound* when it becomes true (optionally repeating every N seconds while it holds,
at least 5 and capped), the **alert** widget can sound when it appears, and a button or toggle can **vibrate briefly** when
pressed. None of this ever sends a command.

## Tabs and folding panels

The **Tabs** widget is a container with several tabs, each holding its own mini-grid (use *Edit contents* on it). A tab can be
shown **only when a condition holds** (a "Probing" tab only on a CNC machine), the tab bar can sit **top, bottom or left**, and
on a phone it scrolls sideways. Only the tab that is showing is rendered, so the charts and webcams on the others are not
running. Which tab you last looked at is remembered **per device** (not in the layout).

A **group** or **tabs** panel can be made **foldable**: a chevron in its title hides the contents. Whether it is folded is
also per device. The grid does not close up on its own, so panels below only move up to fill the gap if the folding panel has
**Auto height** switched on in its ⚙ properties.

## Fullscreen, kiosk and keeping the screen on

The **Fullscreen / kiosk** widget has three controls, all **per device**:

- **Fullscreen** (hidden where the browser can't do it - iPhone Safari; use *Share → Add to Home Screen* there).
- **Kiosk mode** hides the top bar and side menu, leaving a small dim button in the corner to leave. Add `?kiosk=1` to the
  address to start in it. With an **access lock** configured, leaving kiosk asks for the **Admin password**, so a wall display
  can't be un-kiosked by a passer-by (`?kiosk=0` goes through the same check).
- **Keep screen awake** uses the browser's Wake Lock. It only works over **https** - on the usual plain-`http` DWC the switch is
  disabled and says why; the **TLS setup** helper in the settings tab can enable https.

## Automatic profile switching

A profile can **take over automatically**: click the robot button on it in *Layout profiles* and choose *when the machine is in
a mode (FFF / CNC / Laser)*, *a print is running*, or *a condition holds*, optionally *go back to the previous profile when it
ends*. Switch it on for a browser with *Switch profiles automatically on this device*.

It is **per device**: this browser gets its own "showing" profile and the shared default is never rewritten, so a wall tablet can
follow the print while everyone else keeps their layout (a manual switch still sets the shared default, as before). Rules are
checked on a **change** - the mode changing, a print starting or ending, a condition flipping - and once when the machine first
loads, not continuously, so switching by hand afterwards sticks until the next change. If several profiles match, the first in
the list wins. Automatic switching is system-initiated and so ignores the Admin lock (that is the point on a locked-down display).

## Accessibility

Flexible Layouts aims to be usable without a mouse or sight. Every icon-only button has a name; the jog pads, shaped buttons and
shaped hotspots are keyboard-operable (Tab in, **arrow keys** choose the direction and ring, **Enter / Space** press); moving and
resizing panels works from the keyboard; alerts and message boxes are announced (errors and warnings assertively); state is never
shown by colour alone (indicators also say on/off, statuses carry text and icons); the colour settings warn when text and
background fall under a 4.5:1 contrast; focus returns to where it was when a dialog closes; and the small transitions stop under
"reduce motion". This is checked automatically (an axe run over every widget and its properties dialog, plus a check that no
icon-only button lacks a name). If you find something that doesn't work with your assistive technology, please report it.

| Where | Keys |
|-------|------|
| Anywhere | **Tab / Shift+Tab** move focus; **Enter / Space** press a button |
| Editing | **Ctrl+Z / Y** undo / redo · **Ctrl+C / X / V / D** copy / cut / paste / duplicate · on a panel header **Enter** then **arrows** move, **Shift+arrows** resize, **Enter / Esc** drop |
| Jog pads | **← →** go round the pad · **↑ ↓** go to the outer / inner ring · **Home / End** outermost / innermost ring · **Enter / Space** move |
| Buttons and toggles | the shortcut you set in ⚙ properties |
| Shortcut recorder | press the keys · **Backspace** clears · **Esc** cancels · **Tab** moves on |

## Phones

Below tablet width the top bar gets a **status bar toggle** and, while printing, a **progress ring**
(tap it for the job page). *Settings → Flexible Layouts → Phone navigation* (per device) switches to DWC's
own phone navigation: the home screen becomes a grid of page tiles with a back arrow instead of the side
menu (editing still uses the side menu). As in DWC, moving between the home screen and a page **slides** (skipped
if your device asks for reduced motion), and a page's badge - unread console messages, modified editors - shows in the
corner of its tile.

## Responsive layouts

While editing, a **desktop / tablet / phone** toggle lets each page hold a separate layout per screen
size. Smaller sizes inherit the larger layout until you change them; *Reset* clears a breakpoint back
to inheriting.

## Profiles

**Layout profiles** keep several complete interfaces (e.g. one for FFF, one for CNC) that you switch
between from the top bar (a quick switcher appears once you have more than one). Manage them from
**Layout profiles** in the settings tab. Importing and single-document operations act on the
**active** profile. A profile can also switch itself in - see
[Automatic profile switching](#automatic-profile-switching).

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
