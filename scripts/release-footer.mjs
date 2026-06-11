#!/usr/bin/env node
/**
 * Print the static footer appended to every GitHub Release body: install instructions, the
 * DuetWebControl version the ZIP was built against, and a nudge to contribute layouts to the
 * community gallery.
 *
 * The DWC details come from the CI build environment (the release workflow sets these after it checks
 * out DuetWebControl); gallery links have repo defaults so it also reads sensibly when run locally.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgVersion = JSON.parse(readFileSync(join(here, "..", "plugin.json"), "utf8")).version;

const dwcVersion = process.env.DWC_VERSION || "";
const dwcSha = process.env.DWC_SHA || "";
const dwcRef = process.env.DWC_REF || "next";
const dwcBuiltAgainst = dwcVersion
	? `**DuetWebControl ${dwcVersion}**${dwcSha ? ` (\`${dwcSha}\`, ref \`${dwcRef}\`)` : ` (ref \`${dwcRef}\`)`}`
	: `DuetWebControl (ref \`${dwcRef}\`)`;

const galleryRepo = process.env.GALLERY_REPO || "https://github.com/jaysuk/flexible-layouts-gallery";
const gallerySite = process.env.GALLERY_SITE || "https://jaysuk.github.io/flexible-layouts-gallery/";

const out = `
---

### 📦 Install
1. Download \`FlexibleLayouts-${pkgVersion}.zip\` from the **Assets** below.
2. In DuetWebControl, go to **Settings → General → Plugins** and click **Install Plugin**.
3. Select the downloaded ZIP and accept the third-party-plugin prompt.
4. Reload DWC if asked. Then enable **Edit layout** from the top bar to start customising.

> 🔧 Built against ${dwcBuiltAgainst}. Use a DuetWebControl build at or near this version.

### 🤸 Share your layout
Built a layout you're proud of? Add it to the **community gallery** so others can use it:

- 🔎 Browse layouts: ${gallerySite}
- ➕ Contribute: open a PR adding a \`layouts/<your-layout>/\` folder at ${galleryRepo}

Every submission helps the library grow — PRs welcome!
`;

process.stdout.write(out.replace(/^\n/, ""));
