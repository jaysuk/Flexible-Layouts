# Design: Access Levels (expanded "password" access)

**Status:** Implemented (Phases 1 & 2). Reviewed by two independent model passes plus a same-session implementation-time finding — all resolved before/during implementation. All 7 open questions resolved (§7); reviews and my own verification found and fixed 7 real leaks total: free-position group children, header-pinned widgets, FL's own profile-switcher chrome, **page fallbacks** (the most severe, since that's the default un-customized-page state), ungated `CodeInput`/`UploadButton` in the shell chrome, and — found only while implementing, worse than any prior finding — **`FlexSettingsTab.vue`'s Access section itself was reachable and rewritable by any user via ordinary navigation**, since visiting Settings never trips the escape guard (see §4). Also fixed: a migration edge case (§3) and a documented recovery story (§8). Phase 3 (deferring to real firmware roles) is unstarted — RRF #1143 hasn't shipped a role field yet.
**Decisions baked in:** three independently-enableable tiers (Observer / Operator, gating up to Admin) · each enabled restricted tier that isn't the load-time baseline gets its own login · enforce within FL's own surfaces + FL-owned chrome (no DWC-core hacks) · ship as a design doc first.

Motivated by:
- [RRF #1143](https://github.com/Duet3D/RepRapFirmware/issues/1143) — multi-level user authentication (Admin / Power user / User).
- [DWC #483](https://github.com/Duet3D/DuetWebControl/issues/483) — protected configuration: view config files but block edits ("production" machines).
- [DWC #482](https://github.com/Duet3D/DuetWebControl/issues/482) — observer mode (nothing clickable by accident) + hide the emergency-stop.

---

## 1. Scope & honest boundaries

FL is a **client-side DWC plugin**. It can shape *what the UI offers*, but it cannot *enforce* security — anyone with browser devtools, or who stops the plugin, bypasses it. Today's lock already says this ([model/lock.ts](../src/model/lock.ts) header) and that framing stays.

Therefore:

| Issue | What this design delivers | What it deliberately does **not** do |
|---|---|---|
| **DWC #482** (observer) | ✅ Full client-side observer mode: every FL widget non-interactive, optional e-stop hide. FL's sweet spot — FL owns its shell and already has an interaction-block overlay. | — |
| **DWC #483** (protect config) | ⚠️ Operator can run jobs/macros but has no file-browsing/management surface at all in FL (no widget has a partial mode — see §2's `manageFiles` note); built-in `FileList`/`JobFileList` panels require Admin; escape guard blocks DWC's own Settings/file editor. | True "view config, block edits" through a live file browser — no FL widget supports that split. Config *content* can only be shown read-only via static authored text (e.g. a Note widget), not a browsable panel. |
| **RRF #1143** (real auth) | Mirrors the **levels** (Observer/Operator/Admin) as a UI model, with a **forward-compat hook** to defer to firmware-reported roles once #1143 ships. | Real user DB / passwords-in-firmware / JWT / enforced-in-firmware. That is firmware territory, not FL. |

**This is a soft deterrent, not a security boundary.** Every UI string and the settings panel must keep saying so.

---

## 2. Model

Three ordered levels, increasing capability:

```
Observer  <  Operator  <  Admin
```

- **Observer** — view only. Nothing in FL is interactive (read-outs, charts, webcam, status all stay live). Optionally hides the e-stop.
- **Operator** — run the machine: jog, home, run existing jobs, pause/resume, operate controls. **Cannot** edit the layout, leave FL, or manage/edit files & config.
- **Admin** — everything (today's "unlocked" state), incl. editing the layout and changing access settings.

### Enabling tiers, and the load-time baseline

Setting up the lock means independently toggling which of the two restricted tiers exist: **Enable Observer** and **Enable Operator**. Admin is never toggled — it's always the ceiling, and always has a password once any tier is enabled. The page loads as the **most restrictive enabled tier**:

| Observer enabled | Operator enabled | Loads as | Lock is "on"? |
|:--:|:--:|---|:--:|
| ✗ | ✗ | Admin — today's no-lock behavior | no |
| ✓ | ✗ | Observer | yes |
| ✗ | ✓ | Operator | yes |
| ✓ | ✓ | Observer (most restrictive wins) | yes |

### Passwords — one per *reachable step up*, not one flat admin password

Each enabled tier that the loaded baseline has to step **through** gets its own password, so unlocking is an explicit, unambiguous choice of *which* tier to log in as — never a single field silently tried against multiple hashes:

| Config | Loads as | Login option 1 | Login option 2 |
|---|---|---|---|
| Observer only | Observer | **Admin** (admin password) | — |
| Operator only | Operator | **Admin** (admin password) | — |
| Both enabled | Observer | **Operator** (operator password) | **Admin** (admin password) |

- **Admin password** — always required once either tier is enabled; the only way to reach full control.
- **Operator password** — only exists (is set, is shown in settings, is offered as a login) when **both** tiers are enabled. When Operator is enabled alone, it doesn't need its own password: it *is* the baseline you land on, and the only step up from it is straight to Admin.

When both logins are offered, the unlock UI presents them as **two distinct actions** ("Log in as Operator" / "Log in as Admin"), each with its own password field — the user picks which role they're claiming, then proves it. This avoids any ambiguity from password reuse and matches how a real operator vs. admin would think about it.

Session state: `level = ref<AccessLevel>` starts at the computed baseline and rises to whichever tier a successful login claimed; `relock()` returns it to the baseline. Elevating from Observer straight to Admin (skipping Operator) is always allowed — Admin is a superset, not a step that requires passing through Operator first.

### Capabilities

Each level resolves to a capability set. A single resolver `can(cap)` is the only thing the rest of the code consults.

| Capability | Observer | Operator | Admin | Where it gates |
|---|:--:|:--:|:--:|---|
| `interact` (send g-code / operate any control) | ✗ | ✓ | ✓ | FlexGridItem overlay (grid + free-position groups) + a matching overlay in HeaderWidgets |
| `runJobs` (start/pause/resume/cancel, pick file) | ✗ | ✓ | ✓ | JobControl / Files / Macros widgets — subset of `interact` |
| `manageFiles` (upload/delete/rename via a **built-in panel**) | ✗ | ✗ | ✓ | `FileList` / `JobFileList` **built-in panels specifically**, gated by component name — see note below |
| `editConfig` (edit `/sys`, `config.g`) | ✗ | ✗ | ✓ | in practice just the escape guard keeping DWC's own Settings/file editor out of reach — FL has no config-editing widget of its own |
| `editLayout` (enter FL edit mode, open FL Settings, switch/manage profiles) | ✗ | ✗ | ✓ | FlexShell edit button (existing `requestUnlock`) **and** the profile-switcher menu (see §4.8) |
| `leaveLayout` (Settings / BuiltIn / other plugin) | ✗ | ✗ | ✓ | escape guard (existing) |
| e-stop visible | optional | ✓ | ✓ | FlexShell `EmergencyButton` |

**Safety note:** the e-stop stays visible **and clickable** by default even in Observer (everything *else* is blocked, so accidental clicks aren't a concern, and a stop is the one thing you never want to remove). Hiding it is an explicit opt-in (`hideEmergencyStop`), addressing #482's "toggling my inner monk" without making "hidden" the default.

**`manageFiles` note (revised after code review):** every FL-native widget (`FilesWidget`, `MacrosWidget`, `GlobalsWidget`, …) is single all-or-nothing `disabled` — none of them has a partial "browse but can't upload/delete/edit" mode to gate separately. `GlobalsWidget`'s `allowEdit` is an **author-time** layout choice (set once when building the page), not a runtime capability. So `manageFiles` cannot be a per-widget-type rule; the only place it has a real target is DWC's built-in `FileList`/`JobFileList` panels, which genuinely support upload/delete/rename — those two panels (by component name, exactly like `printLock.ts`'s `MOVE_PANELS` set) require `manageFiles`/Admin even though Operator otherwise has `interact`. FL's own Files/Macros widgets (job/macro *launchers*, no manage affordances at all) stay gated by plain `interact`/`runJobs`. This means FL genuinely cannot offer "view config, block edits" through a live file browser — the honest #483 story is: Operator can't browse/manage files through FL at all (only run jobs/macros by name), and true config viewing needs Admin. If a deployment wants students to see specific config *content* without a live editor, that has to be authored as static text (e.g. a Note widget with pasted excerpts), not a browsable panel.

---

## 3. Data model & migration

Stored where the lock lives today: `settings.plugins.flexibleLayouts` (key renamed `lock` → `access`, with read-time migration).

```ts
export type AccessLevel = "observer" | "operator" | "admin";

export interface AccessConfig {
  observerEnabled: boolean;    // Observer exists as a tier
  operatorEnabled: boolean;    // Operator exists as a tier
  adminHash: string;           // required once observerEnabled || operatorEnabled; cyrb53, as today
  operatorHash: string;        // only set/used when BOTH tiers are enabled; "" otherwise
  hideEmergencyStop?: boolean; // opt-in: hide e-stop while below Operator (i.e. while in Observer)
}
```

Derived, never stored:

```ts
enabled      = observerEnabled || operatorEnabled
defaultLevel = observerEnabled ? "observer" : operatorEnabled ? "operator" : "admin"
```

**Migration (read-time, non-destructive):** an old `{ enabled, hash }` (or the legacy `lock` key) maps to:

```ts
enabled=false → { observerEnabled:false, operatorEnabled:false, adminHash:"",   operatorHash:"", hideEmergencyStop:false }
enabled=true  → { observerEnabled:false, operatorEnabled:true,  adminHash:hash, operatorHash:"", hideEmergencyStop:false }
```

Today's lock always allowed interaction but blocked editing/leaving — exactly the Operator baseline — so it migrates to "Operator only enabled", with the old password becoming the **admin** password (the thing that elevates out of it). No existing kiosk silently becomes view-only, loses its password, or gets a surprise second password prompt.

**Edge case (verified against `model/lock.ts`'s `getLock()`):** a partially-written legacy config — `{ enabled: true, hash: "" }`, which `getLock()`'s defaulting can't rule out (e.g. an interrupted save) — must **not** migrate to `operatorEnabled:true, adminHash:""`, because an empty admin hash would make the Admin login accept a blank password. The migration must special-case an empty `hash` as "treat as never configured" (`enabled:false` outcome), regardless of the stored `enabled` flag. Same empty-hash-means-unconfigured rule applies going forward whenever `operatorEnabled` flips true (§7.6) — the settings UI must force a real password entry at that moment rather than ever persisting `operatorEnabled:true` with `operatorHash:""`.

**Read order:** `container()["access"]` if present, else migrate `container()["lock"]` (the existing key) per the rules above, else the fully-unconfigured default. The legacy `lock` key is left untouched on migration (harmless leftover, avoids a destructive write on first read) rather than deleted.

Session state: `level = ref<AccessLevel>` starts at `defaultLevel`; a successful Operator login sets it to `"operator"`, a successful Admin login sets it to `"admin"`; `relock()` returns it to `defaultLevel`.

---

## 4. Enforcement points (FL surfaces + FL chrome only)

> §4.2, 4.3 and 4.8 come from a code-level gap review that checked the naive "just check `can('interact')` per widget" plan against the actual components and found it leaks in three real, verified places: free-position group children, header-pinned widgets, and FL's own profile-switcher chrome. A second independent pass then found the single most severe leak: **page fallbacks** (§4.3a) — the stock DWC content shown on any page the admin hasn't customized yet, which is the *default*, common state, not an edge case — plus two more ungated chrome controls (§4.8a). All are folded in below; nothing here is speculative.

1. **Interaction block — grid items (Observer).** Reuse the existing print-lock overlay in [FlexGridItem.vue](../src/page/FlexGridItem.vue#L64): combine into a **single** overlay condition `v-if="printLocked || accessLocked"` (not two stacked overlays — avoids double-dimming/duplicate badges), where `accessLocked = !can('interact')`. This overlay already "covers widgets that ignore `disabled`" by design, so it's the mechanism of record, not each widget's own prop handling.
2. **Interaction block — free-position group children (verified gap).** [GroupWidget.vue](../src/widgets/GroupWidget.vue#L15)'s free-mode branch renders `<WidgetView :widget="child.widget" />` directly with **no** `disabled` prop and **no** overlay at all — confirmed this is *already* a pre-existing hole in print-lock, not something the access design introduces, but the access model must not inherit it (a jog widget in a free-mode group would stay fully live in Observer). Fix: extract FlexGridItem's overlay markup into a small reusable wrapper (or a directive) and apply it to each free-mode child too, keyed off the same `printLocked || accessLocked` condition per child's own widget. Worth fixing as a standalone bug regardless of this feature.
3. **Interaction block — header-pinned widgets (verified gap, more severe than first scoped).** [HeaderWidgets.vue:18](../src/shell/HeaderWidgets.vue#L18) only ever passes a `:disabled` prop (no physical overlay), and [WidgetView.vue](../src/widgets/WidgetView.vue) doesn't even forward `disabled` to **seven** widget types: `ProfileSwitchWidget`, `MessageBoxWidget`, `ThemeToggleWidget`, `GroupWidget`, `PluginPageWidget`, `EmbeddableWidget`, `WebWidget`. Any of these pinned to the header stay fully interactive in Observer/Operator today, and `ProfileSwitchWidget` additionally **ignores its own `disabled` prop in its template** even where one is passed — so fixing WidgetView alone wouldn't be enough for it. Fix: give `HeaderWidgets.vue` its own physical covering overlay per item (mirroring FlexGridItem's, not trusting per-widget `disabled` handling), keyed off `!can('interact')` (and still `headerLocked()` for print-lock, combined the same `printLocked || accessLocked` way as point 1).
3a. **Page fallbacks (verified gap, the most severe one found — this is the *default* state, not an edge case).** [FlexPage.vue:142](../src/page/FlexPage.vue#L142) renders `<component v-if="!editMode && fallback" :is="fallback" />` **directly, completely outside `FlexGridItem`** whenever a page hasn't been customized yet — which is every built-in page (Dashboard, Status, Console) until an admin edits it. `DashboardFallback.vue` (full stock jog/extrude/etc. dashboard), `ConsoleFallback.vue` (live console + `CodeInput`), and `StatusFallback.vue` (the FFF/CNC container panels, including settable heater targets — mounted via the status region in [FlexShell.vue:109-113](../src/shell/FlexShell.vue#L109)) all get **zero interaction blocking** from this design as originally planned. An Observer landing on an un-customized Dashboard — the single most common real-world case — would have full machine control. Same pre-existing hole as §4.2 (print-lock never reached it either). Fix: wrap the fallback `<component>` (and the status-region mount) in the same reusable overlay from §4.1/§4.2, keyed off `printLocked || accessLocked` for the page as a whole (there's no per-widget granularity inside a fallback — it's one opaque stock component, so the gate is all-or-nothing at the fallback level, which is correct: an un-customized page should behave like a single print-locked/access-locked panel).
4. **Edit mode & settings — and a fourth verified gap found during implementation, more severe than any prior finding.** Existing `requestUnlock()` flow now means "log in as Admin" (`editLayout`). I initially assumed (and both prior reviews took on faith, since it's what earlier drafts of this doc claimed) that FL's escape guard already keeps restricted users out of the Settings tab entirely. **That's wrong.** Verified against DWC's actual layout mechanism (`plugins/layout.ts`): every route, including `/Settings`, is wrapped by whichever shell is active (`registerLayout`'s per-route `routes` overrides only swap *page content* for specific paths — they don't gate navigation), and the escape guard only fires when `isFlLayoutActive()` flips off, which happens *only* when the user actually switches away from FL's layout (e.g. via DWC's own layout-switcher control on the Settings page) — not from merely navigating there. So **`FlexSettingsTab.vue` is reachable by any user, restricted or not, via ordinary nav-drawer navigation** — nothing about visiting Settings is blocked. Its four `openGated()`-wrapped buttons (Manage pages/Theme/Backup&share/Profiles) already handle this correctly by individually requiring `requestUnlock()`/`can('editLayout')` before opening — **but `<LockSettings />` (soon `<AccessSettings />`) is mounted completely unconditionally, with no gate of its own**, and its own toggle logic lets *enabling* and *changing* the password proceed with zero verification (only *disabling* checks the current password). Concretely: a restricted user can navigate to Settings, click "Change password," set a password *they* chose, and now controls Admin — with no devtools required, worse than the "soft, bypassable-with-devtools" framing promises. **Fix:** apply the exact same `openGated()` pattern already used by its four siblings to the Access section too — `FlexSettingsTab.vue` renders `<AccessSettings />` only when `can('editLayout')`, else a small locked placeholder with an "Unlock to manage access" button that calls `requestAdmin()`.
5. **Escape guard.** Existing guard in [model/lock.ts](../src/model/lock.ts) `installEscapeGuard()` already blocks Settings / `/BuiltInLayout` / plugin-switch; it now keys off `!can('leaveLayout')`. Also update the other `isLocked()` call sites verified in [FlexShell.vue](../src/shell/FlexShell.vue): the edit-button gate (`editLocked`, ~line 278) and the Plugins-menu hiding (~lines 329, 536) — all three move to the new resolver. This is what keeps DWC's own config/file editor out of reach in the restricted baseline — the #483 "production machine" story, within FL.
6. **Built-in file-management panels.** `FileList`/`JobFileList` (the only built-in panels with real upload/delete/rename) require `manageFiles`/Admin specifically, by component name — see the capability-table note in §2. FL's own Files/Macros widgets need only `interact`/`runJobs`.
7. **E-stop.** [FlexShell.vue:65](../src/shell/FlexShell.vue#L65): `v-if="settingsStore.showEmergencyStop && !(level === 'observer' && access.hideEmergencyStop)"`.
8. **Profile-switcher chrome (verified gap).** [FlexShell.vue:13-27](../src/shell/FlexShell.vue#L13) renders a profile-switch menu (`<v-menu v-if="profiles.length > 1">`) and a "manage profiles" dialog trigger **entirely outside any widget, and completely ungated today** — no `isLocked()` check exists on it at all. Confirmed the underlying `AccessConfig` is stored in DWC's plugin-settings store (`useSettingsStore().plugins.flexibleLayouts`, per `model/lock.ts`'s `container()`), which is **global**, not per-FL-profile — so switching profiles can't itself weaken the access config. Even so, switching layouts/opening profile management is an editorial action a restricted user shouldn't get from FL's own chrome. Fix: wrap the whole menu in `v-if="profiles.length > 1 && can('editLayout')"`.
8a. **Ungated shell-chrome controls (verified gap): `CodeInput` and `UploadButton`.** [FlexShell.vue:33](../src/shell/FlexShell.vue#L33) (desktop app bar) and [:49](../src/shell/FlexShell.vue#L49) (mobile overflow menu) both render DWC's `CodeInput` — an arbitrary G-code entry field — completely unconditionally; an Observer can type any command straight into FL's own chrome, independent of every widget-level fix above. §7.4 already decided the console/MDI story is `interact`-gated; this is where that decision actually has to land in code. Fix: `v-if="can('interact')"` on both instances (the HeaderWidgets overlay fix from §4.3 does not cover this — `CodeInput` isn't a widget, it's rendered bare in the shell). Similarly [FlexShell.vue:63](../src/shell/FlexShell.vue#L63) renders `UploadButton` (file/job upload) unconditionally on `lgAndUp` — gate behind at least `runJobs`, arguably `manageFiles` given it's a raw upload. (`ConnectButton` at line 11 is dev-only, `import.meta.env.DEV` — no fix needed.)
9. **Embedded settings tabs (awareness note).** `pluginPage` widgets can embed any plugin's settings tab inline (`source: "settingTab"`, confirmed in `model/pluginPages.ts`) — including FL's own `AccessSettings.vue`. In the grid this is already covered by point 1's overlay; this is exactly why point 3 (header) matters — an Admin who mistakenly pins a `settingTab` `pluginPage` widget to the header would otherwise hand a restricted user a live route to Settings with zero blocking.
10. **Level indicator & login.** Small chip in the FL shell showing the current level + "Lock now" (existing `relock`). Its "Unlock…" action opens the prompt described in §2: a single button when only one step-up exists (Observer-only or Operator-only configs — straight to Admin), or **two buttons** ("Log in as Operator" / "Log in as Admin") when both tiers are enabled, each revealing its own password field.

No DWC-core CSS injection, no touching DWC's toolbar outside FL's shell (per decision). Observer mode is therefore meaningful **inside FL's shell**, which is also where the escape guard keeps a restricted user.

---

## 5. Forward-compat with RRF #1143

When firmware gains real roles, FL should *defer down* to them, never *grant up*:
- Read a future firmware-reported access field from the object model (TBD path once #1143 lands).
- Effective capability = **intersection** of (FL level) and (firmware role). FL can hide more, never reveal what firmware forbids.
- This keeps FL honest: once real enforcement exists, FL is just the matching UI layer.

The JWT proposal in #1143's comments is firmware/reverse-proxy concern; FL needs no part of it beyond reading the resulting role.

---

## 6. Files to change (when approved)

| File | Change |
|---|---|
| `model/lock.ts` → `model/access.ts` | Level state, `can(cap)`, `currentLevel`, `loginAsOperator(pw)` / `loginAsAdmin(pw)`, derived `enabled`/`defaultLevel`, migration (incl. the empty-hash edge case in §3); keep escape-guard + prompt mechanism; re-export old names for a transition. |
| `editor/LockSettings.vue` → `AccessSettings.vue` | Two independent checkboxes ("Restrict to Observer", "Restrict to Operator"); Admin password field (shown whenever either is checked); Operator password field (shown only when both are checked, forced non-empty at the moment the second checkbox is ticked — §7.6); **hide e-stop** switch; soft-deterrent disclaimer; disabling any tier or the whole lock requires the Admin password (verify-to-disable, as today). |
| `editor/PasswordDialog.vue` | Extended to offer **one or two login options** depending on which tiers are enabled (see §2/§4.10) — one shared dialog, but it renders a tier-choice step first when both Operator and Admin are reachable from the current level. |
| `page/FlexGridItem.vue` | Combine `printLocked \|\| accessLocked` into the existing single overlay condition (§4.1). |
| `widgets/GroupWidget.vue` | Free-mode branch: apply the same combined-overlay treatment per child (§4.2) — currently the sole widget-level gap where neither print-lock nor access-lock reaches a widget at all. |
| `page/FlexPage.vue` | Wrap the fallback `<component>` at line 142 in the same overlay, all-or-nothing per page (§4.3a) — **the single most severe verified gap**: this is what renders on every un-customized page (Dashboard/Status/Console), i.e. the *default* state, not an edge case. |
| `shell/HeaderWidgets.vue` | Add a physical covering overlay per header item (§4.3), not just a `disabled` prop — required because 7 widget types never receive `disabled` from `WidgetView.vue` today, and `ProfileSwitchWidget` ignores it even where present. |
| `shell/FlexShell.vue` | E-stop visibility (§4.7); level chip / lock-now / unlock (§4.10); edit-button gate now via `can('editLayout')` (was `isLocked()`, ~line 278); Plugins-menu hiding now via `can('leaveLayout')` (was `isLocked()`, ~lines 329/536); **gate the profile-switcher `<v-menu>` (lines 13-27) behind `can('editLayout')`** — currently fully ungated (§4.8); **gate `CodeInput` (lines 33, 49) behind `can('interact')` and `UploadButton` (line 63) behind `can('runJobs')`/`manageFiles`** — both currently fully ungated (§4.8a); wrap the `__status__` `FlexPage` mount (~line 109-113) so its fallback overlay applies the same way. |
| `i18n/en.json` | New `access.*` strings (replacing `lock.*`, with the disclaimer, and the two login-button labels) — **do not** touch the separate, still-used `printLock.*` keys during the sweep. |
| `__tests__/access.test.ts` | Capability resolver per level; derived `enabled`/`defaultLevel` for all 4 toggle combinations; migration from `{enabled,hash}` incl. the empty-hash edge case; Operator-password only meaningful when both tiers on; Admin-skips-Operator elevation; e-stop/observer interplay; free-mode group child gets the overlay; header-pinned widget gets the overlay; **an un-customized page's fallback is blocked in Observer**; profile-switcher menu / CodeInput / UploadButton hidden or gated when restricted; extend the existing printLock interplay test rather than duplicating it. |

Settings entry point stays in [FlexSettingsTab.vue](../src/settings/FlexSettingsTab.vue) (swap `LockSettings` → `AccessSettings`).

---

## 7. Resolved decisions

1. **Operator + macros:** Operator **can run** macros (`M98`) but **cannot edit** macro files — running is gated by `interact`/`runJobs`, editing by `manageFiles`. Running existing, admin-authored macros is core to "operate the machine"; editing them is a config-change action.
2. **Observer e-stop default:** stays **visible and clickable** by default; hiding it is an explicit opt-in (`hideEmergencyStop`). Everything else is blocked in Observer, so accidental clicks aren't the risk — removing the one safety control by default would be.
3. **Naming:** the settings section and UI copy use **"Access"** (not "Roles" or "Kiosk modes") — matches the existing "password" framing the user started from and stays neutral about firmware's own future terminology.
4. **Console/MDI-style send:** gated by `interact` only. Operator may use the console/MDI to run commands (that's the point of Operator); it is **not** additionally gated by `manageFiles`, since sending a command isn't editing a file.
5. **Per-page level override** (e.g. a status page always-Observer regardless of login): **out of scope for v1**. A `minLevel`-per-page mechanism is a plausible v2 addition once the core model is proven; revisit if requested.
6. **Enabling Operator after Observer-only is already deployed:** the settings UI **must force entry of an Operator password at the moment the second checkbox is ticked** — it never silently leaves `operatorHash` empty while `operatorEnabled` is true (an empty hash would make the Operator login accept a blank password, i.e. free entry). `AccessSettings.vue` should open the same "set password" dialog used for initial Admin setup.
7. **Reusing the same password for Operator and Admin:** **allowed, no warning.** Login is an explicit tier choice (the user clicks "Log in as Operator" or "Log in as Admin" and only that hash is checked), so reuse creates no matching ambiguity — it only weakens the separation between tiers, which is the user's call to make.

---

## 8. Recovery (forgotten Admin password)

Not addressed in earlier drafts — a real gap. Since Admin is the only way into `AccessSettings.vue`, and Settings is behind the escape guard (`leaveLayout`), **a forgotten Admin password with `defaultLevel: observer` leaves no in-app path back to Admin at all.**

Given §1's framing — this is a soft, devtools-clearable deterrent, not real security — the intended recovery is exactly that clearing: the config lives at `settings.plugins.flexibleLayouts.access` in DWC's plugin settings, reachable by clearing that key via browser devtools/localStorage, or by whatever bulk "reset this plugin's settings" mechanism DWC itself exposes (if any). This must be **written down** — a short "Lost the password?" note in `AccessSettings.vue` and in the user-facing docs — rather than left as an undocumented escape hatch. It should say plainly: this is by design, not a bug; FL cannot offer real account recovery because it isn't real authentication.

---

## 9. Suggested phasing (once design is signed off)

1. **Phase 1 — Observer mode + access model spine, including all verified gaps.** `access.ts` with levels/capabilities/migration, `AccessSettings.vue` (with the tier checkboxes, dual passwords, and the recovery note from §8), the combined `printLocked || accessLocked` overlay in FlexGridItem, the **same overlay extended to free-mode group children** (§4.2 — also fixes a pre-existing print-lock hole) and to **the page-fallback mount in FlexPage.vue** (§4.3a — the single most severe gap: this is what an un-customized page renders, i.e. the default state) and to **HeaderWidgets** (§4.3), the **profile-switcher menu gate and the CodeInput/UploadButton gates** (§4.8, §4.8a), e-stop hide, shell level chip/login. This is the load-bearing phase — skipping any of these gap-fixes would make Observer mode leak on day one, undermining the headline feature (#482). Delivers #482 fully.
2. **Phase 2 — Operator gating:** the `manageFiles` built-in-panel-name gate on `FileList`/`JobFileList`, escape-guard wording, Operator-can-run/can't-edit macros. Delivers #483's (honestly-scoped) UX.
3. **Phase 3 — Firmware role adoption:** wire the OM access field + intersection when RRF #1143 ships.
