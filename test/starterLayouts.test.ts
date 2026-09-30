import { flushPromises } from "@vue/test-utils";
import { MachineMode } from "@duet3d/objectmodel";
import { mountInDwc } from "dwc-plugin-test-kit";
import { describe, expect, it } from "vitest";

import { createEmptyDocument, migrateDocument, type GridItemModel } from "../src/model/document";
import { forEachItemWidget } from "../src/model/document";
import {
	createStarterPage, currentStarterMode, findStarter, isRecommendedStarter, orderedStarters, STARTER_LAYOUTS, starterModeFor,
} from "../src/model/starterLayouts";
import { CUSTOM_PAGE_PREFIX } from "../src/model/pageSlug";
import { useLayoutStore } from "../src/model/store";
import { BUILTIN_PANELS, FREEFORM_WIDGETS } from "../src/widgets/registry";
import WidgetView from "../src/widgets/WidgetView.vue";
import StarterPicker from "../src/editor/StarterPicker.vue";

const freeformTypes = new Set<string>(FREEFORM_WIDGETS.map((w) => w.type));
const panelNames = new Set(BUILTIN_PANELS.map((p) => p.component));

describe("registry integrity - every starter is valid", () => {
	it("has unique ids and a title + description key each", () => {
		expect(new Set(STARTER_LAYOUTS.map((s) => s.id)).size).toBe(STARTER_LAYOUTS.length);
		for (const s of STARTER_LAYOUTS) {
			expect(s.titleKey).toBe(`starters.${s.id}.title`);
			expect(s.descKey).toBe(`starters.${s.id}.desc`);
		}
	});

	for (const starter of STARTER_LAYOUTS) {
		describe(starter.id, () => {
			const items = starter.build();

			it("only uses widget types and built-in panels that exist in the catalogue", () => {
				forEachItemWidget(items, (w) => {
					if (w.type === "builtinPanel") {
						expect(panelNames.has(w.component), `unknown panel ${w.component}`).toBe(true);
					} else {
						expect(freeformTypes.has(w.type), `unknown widget ${w.type}`).toBe(true);
					}
				});
			});

			it("has unique ids, fits the 12-column grid and has no overlapping items", () => {
				expect(new Set(items.map((it) => it.i)).size).toBe(items.length);
				for (const it of items) {
					expect(it.x).toBeGreaterThanOrEqual(0);
					expect(it.w).toBeGreaterThan(0);
					expect(it.x + it.w, `${it.i} overflows`).toBeLessThanOrEqual(12);
				}
				const overlap = (a: GridItemModel, b: GridItemModel) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
				for (let i = 0; i < items.length; i++) {
					for (let j = i + 1; j < items.length; j++) {
						expect(overlap(items[i], items[j]), `items ${i} and ${j} overlap`).toBe(false);
					}
				}
			});

			it("builds fresh ids every call", () => {
				const again = starter.build();
				expect(again.map((it) => it.i).filter((id) => items.some((it) => it.i === id))).toEqual([]);
			});

			it("survives migrateDocument unchanged", () => {
				const doc = createEmptyDocument();
				doc.pages["/p/x"] = { kind: "custom", grid: { cols: 12, rowHeight: 30 }, items } as never;
				const after = migrateDocument(JSON.parse(JSON.stringify(doc)));
				expect(after.pages["/p/x"].items).toEqual(items);
			});

			it("mounts every widget on it without throwing", () => {
				for (const it of items) {
					const w = mountInDwc(WidgetView, { props: { widget: it.widget } });
					expect(w.exists()).toBe(true);
					w.unmount();
				}
			});
		});
	}
});

describe("createStarterPage", () => {
	it("creates a NEW custom page holding the starter's items, and leaves existing pages alone", () => {
		const store = useLayoutStore();
		store.ensurePage("/Dashboard", "override").items = [];
		const before = JSON.stringify(store.getPage("/Dashboard"));
		const path = createStarterPage("touch");
		expect(path.startsWith(CUSTOM_PAGE_PREFIX)).toBe(true);
		expect(store.getPage(path)?.items.length).toBe(findStarter("touch")!.build().length);
		expect(store.getPage(path)?.kind).toBe("custom");
		expect(JSON.stringify(store.getPage("/Dashboard"))).toBe(before);
	});

	it("gives a second copy its own address instead of overwriting the first", () => {
		const a = createStarterPage("print");
		const b = createStarterPage("print");
		expect(a).not.toBe(b);
		expect(useLayoutStore().getPage(a)).toBeDefined();
		expect(useLayoutStore().getPage(b)).toBeDefined();
	});

	it("rejects an unknown id", () => {
		expect(() => createStarterPage("nope")).toThrow();
	});
});

describe("machine-mode recommendation", () => {
	it("follows the machine mode, with DWC's dashboard-mode override winning", () => {
		const { fff, cnc, laser } = MachineMode;
		expect(starterModeFor(fff)).toBe("fff");
		expect(starterModeFor(cnc)).toBe("cnc");
		expect(starterModeFor(laser)).toBe("laser");
		expect(starterModeFor(undefined)).toBe("fff");
		expect(starterModeFor(cnc, "FFF")).toBe("fff");
		expect(starterModeFor(fff, "CNC")).toBe("cnc");
		expect(starterModeFor(laser, "CNC")).toBe("laser");
	});

	it("recommends the printer starters for FFF, and CNC + laser for a laser", () => {
		const fits = (mode: "fff" | "cnc" | "laser") => STARTER_LAYOUTS.filter((s) => isRecommendedStarter(s, mode)).map((s) => s.id);
		expect(fits("fff")).toEqual(["fff", "print", "touch"]);
		expect(fits("cnc")).toEqual(["touch", "cnc"]);
		expect(fits("laser")).toEqual(["touch", "laser", "cnc"]);
	});

	it("lists the fitting starters first", () => {
		const order = orderedStarters("cnc").map((s) => s.id);
		expect(order.slice(0, 2)).toEqual(["touch", "cnc"]);
		expect(new Set(order).size).toBe(STARTER_LAYOUTS.length);
	});

	it("reads the mode from the connected machine", () => {
		expect(["fff", "cnc", "laser"]).toContain(currentStarterMode());
	});
});

describe("StarterPicker", () => {
	async function mountPicker() {
		const w = mountInDwc(StarterPicker, { props: { modelValue: false, attach: true } });
		await w.setProps({ modelValue: true });
		await flushPromises();
		return w;
	}

	it("shows a card per starter with a schematic tile per item", async () => {
		const w = await mountPicker();
		const cards = w.findAll(".starter-card");
		expect(cards).toHaveLength(STARTER_LAYOUTS.length);
		for (const s of STARTER_LAYOUTS) {
			const card = w.find(`[data-starter="${s.id}"]`);
			expect(card.findAll(".starter-tile")).toHaveLength(s.build().length);
		}
	});

	it("adding a starter creates its page and reports the path", async () => {
		const w = await mountPicker();
		await w.find('[data-starter="touch"] .starter-add').trigger("click");
		const created = w.emitted("created");
		expect(created).toHaveLength(1);
		expect(String((created![0] as string[])[0]).startsWith(CUSTOM_PAGE_PREFIX)).toBe(true);
		expect(useLayoutStore().getPage((created![0] as string[])[0])).toBeDefined();
	});
});
