import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { describe, it } from "vitest";

import { createDefaultWidget, type GridItemModel } from "../src/model/document";
import { BUILTIN_PANELS, FREEFORM_WIDGETS } from "../src/widgets/registry";

// One-off generator for a standalone "All Widgets" page you can import to eyeball every widget.
// It is NOT part of the plugin and is skipped in normal test runs; run it explicitly with:
//   GEN_PAGE=1 npx vitest run test/gen-all-widgets-page.test.ts
// It writes the catalog straight from the registry, so it always covers every addable widget/panel.
describe("all-widgets page generator", () => {
  it.runIf(process.env.GEN_PAGE)("writes AllWidgets.dwcpage.json", () => {
    const COLS = 12;
    const items: Array<GridItemModel> = [];
    let x = 0, y = 0, rowH = 0, idx = 0;
    const place = (widget: GridItemModel["widget"], w: number, h: number, title: string): void => {
      if (x + w > COLS) { x = 0; y += rowH; rowH = 0; }
      items.push({ i: `w${idx++}`, x, y, w, h, widget, title });
      x += w; rowH = Math.max(rowH, h);
    };

    for (const e of FREEFORM_WIDGETS) {
      place(createDefaultWidget(e.type), e.defaultSize.w, e.defaultSize.h, e.type);
    }
    for (const p of BUILTIN_PANELS) {
      place({ type: "builtinPanel", component: p.component }, p.defaultSize.w, p.defaultSize.h, p.component);
    }

    const page = {
      kind: "custom" as const,
      title: "All Widgets",
      icon: "mdi-view-grid-plus",
      grid: { cols: COLS, rowHeight: 30 },
      items,
    };
    const file = {
      kind: "dwcpage" as const,
      app: "FlexibleLayouts" as const,
      exportedAt: new Date().toISOString(),
      title: page.title,
      icon: page.icon,
      page,
    };
    const json = JSON.stringify(file, null, 2);

    for (const out of [
      "C:/Users/live/Documents/Github/Flexible-Layouts/examples/AllWidgets.dwcpage.json",
      "C:/Users/live/Documents/FlexibleLayouts/AllWidgets.dwcpage.json",
    ]) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, json);
    }
    // eslint-disable-next-line no-console
    console.log(`Generated AllWidgets.dwcpage.json with ${items.length} widgets`);
  });
});
