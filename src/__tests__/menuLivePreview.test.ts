import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { language } from "@codemirror/language";
import { forEachDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { GCODE_EDITOR_COLORS_SD_PATH, menuLanguage } from "dwc-gcode-editor";
import { dwc, mountInDwc } from "dwc-plugin-test-kit";
import { nextTick } from "vue";

import Display12864Emulator from "../widgets/Display12864Emulator.vue";
import ExplorerPanel from "../widgets/ExplorerPanel.vue";
import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";
import { menuSourceFromTexts } from "../model/display12864/menuSource";

// Same in-memory localStorage stand-in the other editor tests use (this harness's is a non-function stub).
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

const MAIN = "text R0 C0 F0 T\"Saved title\"";
const files: Record<string, string> = { "0:/menu/main": MAIN, "0:/menu/other": "text T\"other\"" };
const uploadMock = vi.fn(async () => undefined);
const downloadMock = vi.fn(async (options: { filename: string }) => {
	const text = files[options.filename];
	if (text === undefined) throw new Error("not found"); // also the shared colour-scheme SD file
	return text;
});

vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => {
			const real = actual.useMachineStore();
			return {
				...real,
				download: downloadMock,
				upload: uploadMock,
				// What 0:/menu/ holds, for the linter's sibling list and the emulator's own directory load.
				getFileList: async (directory: string) => directory.replace(/\/+$/, "") === "0:/menu"
					? [{ name: "main", isDirectory: false }, { name: "other", isDirectory: false }, { name: "logo.bin", isDirectory: false }]
					: [],
			};
		},
	};
});

type ExposedVm = { editorInstance: { view: EditorView }; save: () => Promise<boolean> };

const type = (vm: ExposedVm, insert: string): void => vm.editorInstance.view.dispatch({ changes: { from: 0, insert } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
	memoryStorage.clear();
	resetEditorColorSettingsForTests();
	uploadMock.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("GcodeCmEditor on a menu file", () => {
	it("opens it with menu highlighting and without the G-code-only toolbar buttons", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/menu/main" } });
		await vi.waitFor(() => expect(w.text()).toContain("Saved title"));
		const icons = w.findAll(".v-btn .v-icon").map((i) => i.classes().join(" "));
		const has = (name: string) => icons.some((c) => c.includes(name));
		expect(has("mdi-content-save-outline")).toBe(true); // still saves
		expect(has("mdi-tag-search")).toBe(false); // F4 code search is G-code only
		expect(has("mdi-play")).toBe(false); // Run would M98 a menu file
		expect(has("mdi-motion-play-outline")).toBe(false); // the stepper walks G-code
		expect(has("mdi-alert-circle-check-outline")).toBe(false); // menus are linted live instead
		// the menu grammar, not G-code's
		expect((w.vm as unknown as ExposedVm).editorInstance.view.state.facet(language)).toBe(menuLanguage);
		w.unmount();
	});

	it("keeps every one of those buttons for a G-code file (teeth for the isMenu gate)", async () => {
		files["0:/sys/x.g"] = "G28\n";
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/x.g" } });
		await vi.waitFor(() => expect(w.text()).toContain("G28"));
		const icons = w.findAll(".v-btn .v-icon").map((i) => i.classes().join(" "));
		expect(icons.some((c) => c.includes("mdi-tag-search"))).toBe(true);
		expect(icons.some((c) => c.includes("mdi-motion-play-outline"))).toBe(true);
		w.unmount();
	});

	it("emits the unsaved buffer as live-text, once typing pauses - and never for a G-code file", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/menu/main" } });
		await vi.waitFor(() => expect(w.text()).toContain("Saved title"));
		const vm = w.vm as unknown as ExposedVm;
		expect(w.emitted("live-text")).toBeUndefined(); // nothing until an edit

		type(vm, "; a\n");
		type(vm, "; b\n"); // two quick edits -> one emit (debounced)
		expect(w.emitted("live-text")).toBeUndefined();
		await vi.waitFor(() => expect(w.emitted("live-text")).toHaveLength(1));
		expect(w.emitted("live-text")![0]).toEqual([`; b\n; a\n${MAIN}`]);
		w.unmount();

		files["0:/sys/y.g"] = "G28\n";
		const g = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/y.g" } });
		await vi.waitFor(() => expect(g.text()).toContain("G28"));
		type(g.vm as unknown as ExposedVm, "; c\n");
		await sleep(450);
		expect(g.emitted("live-text")).toBeUndefined();
		g.unmount();
	});

	it("underlines what RRF would refuse, and knows which menus and images the folder holds", async () => {
		files["0:/menu/main"] = "text T\"ok\"\nbutton T\"Go\" A\"menu\" L\"other\"\nbutton T\"Bad\" A\"menu\" L\"nowhere\"\nimage L\"logo.bin\"\nimage L\"gone.bin\"\ntext X5";
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/menu/main" } });
		await vi.waitFor(() => expect(w.text()).toContain("nowhere"));
		const view = (w.vm as unknown as ExposedVm).editorInstance.view;
		const seen = (): Array<string> => { const out: Array<string> = []; forEachDiagnostic(view.state, (d) => { out.push(String(d.source)); }); return out; };
		// linting is debounced, and the sibling list arrives after load - wait for the full set
		await vi.waitFor(() => expect(seen().sort()).toEqual(["menu/image-missing", "menu/parse-error", "menu/target-missing"]), { timeout: 4000 });
		w.unmount();
		files["0:/menu/main"] = MAIN;
	});
});

describe("Display12864Emulator overrides", () => {
	const source = menuSourceFromTexts({
		main: "text R0 C0 F0 T\"Saved title\"\nbutton R20 C0 T\"Go\" A\"menu\" L\"sub\"",
		sub: "text T\"saved sub\"\nbutton R20 C0 T\"Back\" A\"return\"",
	});
	const shown = (w: ReturnType<typeof mountInDwc>) => (w.vm as unknown as { display: { items: ReadonlyArray<{ kind: string; text?: string }> } }).display.items.map((i) => i.text ?? "");

	async function mount(props: Record<string, unknown> = {}) {
		const w = mountInDwc(Display12864Emulator, { props: { source, ...props } });
		await nextTick();
		await nextTick();
		return w;
	}

	it("shows the saved text and no live badge without overrides", async () => {
		const w = await mount();
		expect(shown(w)).toContain("Saved title");
		expect(w.find(".d12864-live").exists()).toBe(false);
		w.unmount();
	});

	it("lays unsaved text over the saved file and says so", async () => {
		const w = await mount({ overrides: { MAIN: "text R0 C0 F0 T\"Typed title\"" } }); // name matching is case-insensitive
		expect(shown(w)).toEqual(["Typed title"]);
		expect(w.find(".d12864-live").exists()).toBe(true);
		w.unmount();
	});

	it("follows a change to the overrides and stays in the menu the user had navigated to (not back at main)", async () => {
		// No `menu` prop: the only way into `sub` is the knob, so a restart that ignored where the user was
		// would land on `main`.
		const w = await mount();
		const vm = w.vm as unknown as { turn: (clicks: number) => void };
		vm.turn(1);
		vm.turn(0);
		await nextTick();
		expect(w.text()).toContain("main › sub");
		expect(shown(w)).toContain("saved sub");
		await w.setProps({ overrides: { sub: "text T\"typed sub\"" } });
		await nextTick();
		expect(w.text()).toContain("main › sub");
		expect(shown(w)).toEqual(["typed sub"]);
		w.unmount();
	});

	it("keeps the open menu when re-reading the card (a save must not throw the user back to main)", async () => {
		const w = await mount();
		const vm = w.vm as unknown as { turn: (clicks: number) => void; reload: () => Promise<void> };
		vm.turn(1);
		vm.turn(0);
		await nextTick();
		expect(w.text()).toContain("main › sub");
		await vm.reload();
		await nextTick();
		expect(w.text()).toContain("main › sub");
		w.unmount();
	});

	it("shows the error RRF would show for an unsaved line it refuses", async () => {
		const w = await mount({ overrides: { main: "text Z1" } });
		expect(w.find(".d12864-problems").text()).toContain("Bad arg letter");
		w.unmount();
	});

	it("goes back to the saved file when the overrides are removed", async () => {
		const w = await mount({ overrides: { main: "text T\"Typed\"" } });
		await w.setProps({ overrides: {} });
		await nextTick();
		expect(shown(w)).toContain("Saved title");
		expect(w.find(".d12864-live").exists()).toBe(false);
		w.unmount();
	});
});

describe("ExplorerPanel: a menu file in the new editor", () => {
	beforeEach(() => {
		Object.assign(dwc.model, { volumes: [{ mounted: true }] });
		memoryStorage.set("flexibleLayouts.useGcodeEditor", "1");
	});

	async function open(path: string) {
		const w = mountInDwc(ExplorerPanel, { props: { target: { kind: "editor", path } } });
		await nextTick();
		return w;
	}

	it("makes the preview follow what is typed, before anything is saved", async () => {
		const w = await open("0:/menu/main");
		await vi.waitFor(() => expect(w.findComponent(GcodeCmEditor).exists()).toBe(true));
		await vi.waitFor(() => expect(w.text()).toContain("Saved title"));
		await w.find(".exp-menu-bar button").trigger("click"); // show the preview
		const preview = () => w.findComponent(Display12864Emulator);
		await vi.waitFor(() => expect(preview().exists()).toBe(true));
		await vi.waitFor(() => expect((preview().vm as unknown as { display: unknown }).display).not.toBeNull());
		expect(preview().find(".d12864-live").exists()).toBe(false);

		type(w.findComponent(GcodeCmEditor).vm as unknown as ExposedVm, "text R30 C0 T\"Unsaved\"\n");
		await vi.waitFor(() => expect(preview().find(".d12864-live").exists()).toBe(true));
		const items = (preview().vm as unknown as { display: { items: ReadonlyArray<{ text?: string }> } }).display.items;
		expect(items.map((i) => i.text)).toContain("Unsaved");
		expect(uploadMock).not.toHaveBeenCalled(); // nothing was saved to get here
		w.unmount();
	});

	it("still re-reads the card on save for a menu file that opens in the standard editor (setting off)", async () => {
		memoryStorage.set("flexibleLayouts.useGcodeEditor", "0");
		const w = await open("0:/menu/main");
		expect(w.findComponent(GcodeCmEditor).exists()).toBe(false); // Monaco (a stub here) - no live text source
		await w.find(".exp-menu-bar button").trigger("click");
		await vi.waitFor(() => expect(w.findComponent(Display12864Emulator).exists()).toBe(true));
		expect(w.findComponent(Display12864Emulator).props("overrides")).toEqual({});
		expect(w.findComponent(Display12864Emulator).find(".d12864-live").exists()).toBe(false);
		w.unmount();
	});
});

// The colour-scheme file is the one the editor always tries to read; keep the constant referenced so a
// path change there is noticed here too rather than leaving `downloadMock` silently answering it.
void GCODE_EDITOR_COLORS_SD_PATH;
