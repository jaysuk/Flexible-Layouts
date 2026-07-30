# Config backup & restore

Whole-machine configuration backup and restore: **Settings → Flexible Layouts → Backup & restore
config**, or navigate directly to `/Plugins/FlexibleLayouts/ConfigBackup`. Requires the Admin access
level (see [access levels](access-levels-design.md)) if access locking is enabled.

## What's included

| Content | Source |
| --- | --- |
| Everything under `0:/sys/` | recursive |
| Everything under `0:/macros/` | recursive |
| Everything under `0:/filaments/` | recursive |
| Object model dump | privacy-scrubbed snapshot, always redacted regardless of the switch below |
| M122 diagnostics | mainboard + every connected CAN-FD expansion board |

Files are excluded if they're firmware images or logs (`.bin`, `.uf2`, `.hex`, `.zip`, `.log`, `.gz`),
or over the per-file size cap (1 MB by default). Excluded/skipped files are recorded in the backup's
manifest and shown in the UI - nothing disappears silently.

## Redaction - off by default

A **"Redact sensitive values"** switch controls whether the backup is byte-exact or has secrets
replaced with placeholders. It's **off by default** and remembered separately per destination, so you
can keep a local backup verbatim while redacting the copy you push to GitHub.

**Off (verbatim):** the backup restores completely with no manual steps, but contains your WiFi
password and machine password in clear.

**On (redacted):** every backup still records what it found (shown as a summary either way), but with
the switch on, the following are replaced with `[REDACTED]` before the file is written:

- WiFi credentials (`M587`, `M588`, `M589`), the machine password (`M551`), MQTT credentials
  (`M586.4`)
- Network identity (`M540` MAC, `M552`/`M553`/`M554` IP/netmask/gateway, `M587`'s static-IP params)
- `set global.X` / `var X` assignments whose name looks like a secret (`password`, `token`, `key`,
  `ssid`, `hash`, …)
- Common secret patterns in G-code/macro files and plain text: private keys, URL userinfo,
  `key=`/`token=` assignments, Telegram/Slack/Discord tokens, JWTs, AWS keys, email addresses
- The equivalent identity/network lines in the M122 diagnostics dump

**JSON config files (installed plugins' own settings, `0:/sys/*.json`) are redacted by field NAME
only**, not by scanning values for secret-shaped content - a `password`/`token`/`apiKey`/`hash`-named
field is redacted wherever it appears (including Flexible Layouts' own files), but an ordinary
config value isn't touched just because it happens to look like an email address or a URL. This is
deliberate: plugin config in `0:/sys/` is rarely a credential, and scanning every value there for
content patterns was redacting legitimate plugin settings that weren't secrets at all.

**The machine name (`M550`) is never redacted** - it's how you identify your own machine, and
restoring it shouldn't leave the board named "duet". The object-model dump's network fields are
still scrubbed there regardless, since that's a shared privacy function used by every plugin's
diagnostics reports.

Redaction is per-parameter, not per-line: `M587 S"[REDACTED]" P"[REDACTED]"` still reads as a real
config line, and a trailing `[FL-REDACTED:n]` tag lets a later restore find and repair it even if the
file was edited in between.

## Restoring

On the **Restore** tab, pick a source: a local `.zip` (choose a file or drag-and-drop), or any cloud
destination you've already configured on the Configuration tab. For a cloud source, pick a machine
(every machine that's ever backed up there is listed, including ones you no longer own - the
mainboard-swap case), then a backup to restore from - GitHub additionally lets you go back to any past
commit, not just the latest. Once a backup is loaded, choose which files to restore from the file tree,
then review before applying.

**If the backup contains redacted values**, an extra step appears first. Each one needs a resolution:

- **Keep current machine's value** - looked up automatically from the live machine's current file
  (e.g. restoring `config.g` to a machine already on the WiFi recovers the real SSID/password with no
  typing)
- **Enter value** - type it in, validated for shape where it matters (IPv4, MAC address)
- **Comment out this line** - disables it; you finish it by hand afterwards (G-code only)
- **Omit this key** - removes the key from a JSON file so the consumer falls back to its default

A file is never uploaded while it still contains a redaction placeholder - this is checked again
immediately before the upload regardless of what happened in the UI.

### Restore modes

- **Merge** (default) - overwrites and adds files, never deletes anything.
- **Mirror exactly** - also deletes files under a directory you selected *in full* that the backup
  doesn't contain, so the machine matches the backup exactly. Firmware files, directories the backup
  never covered, and Flexible Layouts' own SD safety-net file are never touched. Disabled when the
  backup came from a different machine.

### Restoring to a different machine

Because backups are keyed by machine (a compatibility diff shows automatically), you can restore a
backup taken on one machine onto another - the mainboard-swap case. The diff highlights firmware/board
differences and flags any `M584`/`M569` driver reference in the backup's `config.g` pointing at a
board that isn't connected to the new machine.

## Destinations

Backup destinations are **configured once**, in the **Cloud backup configuration** tab (credentials and
a Save button per destination). The **Create backup** tab then just picks which already-configured
destination to send a new backup to, and the **Restore** tab browses and restores from any of them
(machine picker, backup list, download/restore/delete - where the service supports it).

- **Download (.zip)** - always available, no setup.
- **Duet backup service** - sign in with your Duet3D forum credentials (stored as a session token
  only, never your password); keeps the newest N backups per machine (FIFO, default 5). Limited to
  2 MB per backup by the service itself - the UI shows a size breakdown if you're over. Unlike every
  other destination, the service URL itself is fixed (not shown or editable) - there's nothing to
  configure beyond signing in.
- **GitHub** - a fine-grained personal access token with *Contents: read and write* on one repo. Each
  backup is one commit under `machines/<name>/…` (`<name>` defaults to the hostname, but can be
  overridden per-repo in the GitHub section - useful if you'd rather see `voron24` than an
  auto-detected name, or you're backing up several machines to one repo), so `config.g` changes diff
  across backups, and the zip itself is a stable filename that each push overwrites rather than
  piling up. Pushing an **unredacted** backup to a **public** repo is blocked by default (typed
  confirmation required) - it would publish your WiFi password to a permanently-archived, indexed
  location.
  **Restore browses history**: pick a machine folder (every machine that's ever been pushed to that
  repo is listed, including ones you no longer own - the mainboard-swap case), then pick any past
  commit for it by date, with a "View on GitHub" link per entry and the same cross-machine
  compatibility warning as every other destination.
- **Google Drive** - needs the page loaded over HTTPS (or `localhost`); this is a Google requirement,
  not something the plugin can work around on a plain-HTTP printer (most Duets are plain HTTP - see
  the alternatives below if that's you). Uses your own OAuth client ID and the `drive.file` scope
  only, so the plugin can never see your other Drive files.
- **Dropbox** - works fine over plain HTTP: authenticated with a long-lived access token generated
  directly in the Dropbox App Console (App Console → your app → "Generated access token"), not an
  interactive sign-in. Backups are browsable per machine, same as the Duet service.
- **WebDAV** - also HTTP-friendly, and aimed at self-hosted storage: Nextcloud, ownCloud, or a
  Synology NAS's WebDAV Station all work, authenticated with a username/password (an app password is
  recommended over your main account password where the server supports one). If the server is on a
  different origin to DWC (and not a plain-HTTP server on your own network), it needs to be
  configured to allow that origin (CORS) or the browser will block the connection.

### Why not just Google Drive?

Most Duets serve DWC over plain HTTP, and Google's sign-in flow refuses to run on anything but HTTPS
or `localhost` - that's a policy of Google's OAuth screen, not a browser restriction, so there's no
way around it short of putting an HTTPS reverse proxy in front of the printer. GitHub, Dropbox and
the Duet service all sidestep this because they authenticate with a plain token/credential pair
instead of an interactive redirect, so they work from a plain-HTTP page like any other API call.

## Credential storage & encryption

By default, saved tokens/passwords sit in this browser's local storage as plain text - readable by
anything with devtools access to that browser, same as any browser-stored credential, but never
included in a backup, an export, or a diagnostics report (see below).

The **Credential storage & encryption** section at the top of the Configuration tab can turn on
**AES-256 encryption**, keyed by a passphrase you set there. That passphrase is **never stored
anywhere** - it only exists in memory for the current browser session, used to derive the encryption
key. A reload always re-locks; unlocking again needs the same passphrase. **Forgetting it means those
credentials are unrecoverable** - the same trade-off as a password manager's master password - you'd
regenerate and re-enter each token.

Encryption needs `crypto.subtle` (the Web Crypto API), which every real browser restricts to a secure
context (HTTPS or `localhost`) - so on a typical plain-HTTP Duet, it usually **isn't available**, for
exactly the same reason Google Drive isn't. The section explains this plainly rather than offering a
toggle that would just fail.

**Cross-browser/cross-PC access**: the same section can also save the *encrypted* bundle to the
printer's own SD card (`0:/sys/flexible-layouts.credentials.json`), so a different browser or PC
hitting the same printer can load it and unlock with the same passphrase, instead of re-entering
every token from scratch. This is a genuinely wider exposure than browser-only storage - anyone who
can reach the printer's web interface, or physically pull the card, can reach that file (though not
read it without the passphrase). It's opt-in and manual (a "Save"/"Load" button each way, never
automatic), and the file is protected from Mirror-mode restore's deletion the same way Flexible
Layouts' own layout safety-net file is.

**Cross-browser/cross-PC access without touching the printer**: the same section can also export the
encrypted bundle as a plain `.json` file you move yourself (a USB stick, emailing it to yourself,
etc.) and import it again elsewhere - an alternative for when you don't want the file sitting on the
printer's SD card at all. Same encryption, same passphrase requirement, same opt-in/manual behaviour.

## Reminders and reliability

The **Create backup** tab shows "Last backup: N days ago" (or "No backup yet"), and the same info
appears as a tooltip on the "Backup & restore config" button in Settings - a passive nudge, not a
scheduled backup (the plugin has no background process, so it can only remind you when you're actually
looking at DWC).

**Automatic reminders** (configurable in the Configuration tab, "Automatic reminders" - all on by
default) go further and show an actual dismissible toast, click-through straight to this page, when:

- `config.g` is saved through DWC's System Editor
- the last backup crosses a configurable "overdue" threshold (default 7 days) on connect
- a machine that's never been backed up before connects (only once at least one backup exists for
  *some* machine, so this doesn't also fire alongside the "no backup yet" case on a fresh install)

These are always a one-click reminder, **never** a silent upload or download - clicking one just opens
this page, same as clicking the button yourself. A firmware-update trigger was considered and left out:
the plugin can only observe DWC's update flow reactively (once M997 has already been sent), not gate or
block it, so it wouldn't be a reliable "back up before" guarantee.

Every restored file is **read back immediately after upload and compared against what was sent** -
text files byte-for-byte, binary files by size and hash - before being reported as successfully
written. A mismatch (e.g. a partial write from a flaky connection) is reported as a failed file rather
than a silent success, the same way any other restore failure is shown.
