# TLS / HTTPS setup

A step-by-step helper for RepRapFirmware 3.7's TLS support: serving DWC (and optionally FTP/Telnet)
over an encrypted connection from the printer itself, instead of plain HTTP. Reachable from
**Settings → Flexible Layouts → TLS / HTTPS setup** (requires the Admin access level, same gate as the
full-reset flow, since this rewrites `config.g` and the network interface's security).

This is specifically the RRF feature documented in
[Duet3D/RepRapFirmware's `HTTPS setup.md`](https://github.com/Duet3D/RepRapFirmware/blob/3.7-dev/HTTPS%20setup.md) -
not WPA2-Enterprise WiFi authentication (joining a secured network with a certificate your IT
department issues), which is a separate, unrelated RRF feature this helper doesn't cover.

## Requirements

- **Ethernet**: Duet 3 MB6HC, MB6XD, or Mini 5+ (native onboard Ethernet MAC).
- **WiFi**: an ESP32-family WiFi module on WiFi firmware **2.4.0 or later**. The ESP8266-based module
  used on some boards can't host a TLS server at all (not enough heap for an mbedTLS handshake) - and
  since it could never report 2.4.0+ firmware in the first place, the firmware-version check alone
  reliably rules it out.
- Some third-party STM32-port boards have no native Ethernet MAC at all - their "Ethernet" port is
  actually bridged through an ESP32 module, so it's checked (and behaves) the same as a WiFi interface
  above rather than needing a specific board name recognised.
- A private key and self-signed certificate you generate yourself: **EC key (P-256 or P-384)**, **PEM
  format**, **no passphrase**. RSA keys and DER-encoded files are rejected by RRF.

The helper detects which of your machine's network interfaces qualify and explains why not, per
interface, if neither does.

## The six steps

1. **Capability check** - shows every detected interface and whether it can do TLS. If more than one
   qualifies, pick which one to set up.
2. **Generate a certificate** - a validity-period field (default 3650 days / 10 years) feeds all three
   options below:
   - Shown the exact `openssl` commands (pre-filled with your machine's real hostname and IP), plus
     Windows options (`winget`, Git Bash, or WSL) if OpenSSL isn't already installed. Run these on your
     own PC.
   - **For Windows users without `openssl` handy**: a "Download details for the Windows tool" button
     downloads a small `duet-cert-args.json` file with your hostname/IP/validity already filled in.
     Drop it next to the unzipped **duet-tls-cert-generator** tool (a separate, standalone repo) and
     run its `generate-cert.bat` - no typing needed. That tool installs `openssl` itself via `winget`
     if it isn't already present, rather than vendoring a copy.
   - **If this page happens to be loaded over HTTPS or `localhost`**, a "Generate in browser" button
     also appears - it generates the same kind of key/certificate directly (Web Crypto for the EC key,
     a small ASN.1/X.509 library for the certificate structure - not a hand-rolled encoder), with
     download buttons so you can keep a copy. This only works on that one secure connection.

   Most Duets are plain HTTP, so the guided `openssl` steps (or the Windows tool) are the paths that
   work everywhere; the in-browser option is a bonus for the minority already on a secure connection.
3. **Upload** - pick the `server.key` and `server.crt` files you just generated. Each is sanity-checked
   (PEM markers present, EC not RSA, no passphrase) before uploading to `0:/sys/`.
4. **Enable** - does a full stop/start cycle (`M552 S0`, then `M552 T1 S1` after a short pause) to load
   the uploaded material onto the interface (on WiFi, this imports the files into the WiFi module's
   flash and the SD copies are then wiped automatically), then lets you turn on TLS for HTTPS/FTPS/
   TelnetS individually (`M586 P<n> S1 T1`, with the port configurable per protocol - Telnet isn't
   offered at all on STM32-port boards, which have no Telnet responder regardless of TLS). RRF's own
   reply is what determines success or failure here - the helper translates known error text into a
   plain explanation, but never invents a result RRF didn't report. The stop/start cycle runs on every
   interface (not just a native Ethernet MAC) since it's needed both to resize the Ethernet TLS heap and
   to make sure a freshly-uploaded cert/key is actually picked up on WiFi - a warning appears first,
   since it may briefly drop your DWC connection if you're using this same interface (refresh the page
   if it doesn't reconnect on its own).
5. **Persist to config.g** - RRF does **not** remember TLS state across a later plain `M552 S1` (e.g. if
   you change the SSID afterwards) - it silently turns TLS back off. This step patches the existing
   `M552` line in `config.g` to add `T1` (and adds/updates an `M586 ... T1` line for each protocol you
   just enabled), with a preview of exactly what will change before anything is written.
6. **Done** - a reminder that a self-signed certificate triggers a one-time browser warning on first
   HTTPS connection: click through it, or import `server.crt` into your OS/browser trust store to avoid
   seeing it again. Either way the connection is already encrypted; only certificate authenticity is
   unverified until you do. This step also has a **certificate expiry reminder** (on by default,
   configurable) - a one-click toast, never automatic renewal, shown once per connect if the
   certificate uploaded through this dialog is within the configured number of days of its expiry.
   The expiry date is cached locally at upload time (not re-read from the SD card later, since on WiFi
   the certificate file is deleted from the SD card once imported into the WiFi module's flash) - if a
   certificate was set up some other way, this reminder won't know about it.

## What this helper does *not* do

- It does not attempt to verify the HTTPS connection actually works from inside the dialog - the page
  you're using it from is still on its original (often plain-HTTP) connection, so there's no reliable
  way to test the new HTTPS endpoint without navigating away. Browse to `https://<hostname>` yourself
  afterwards to confirm.
- It does not cover WPA2-Enterprise WiFi authentication (EAP-TLS/PEAP/TTLS) - a different RRF feature
  for joining a secured network, usually with a certificate an organization's IT department issues
  rather than one you self-sign.
