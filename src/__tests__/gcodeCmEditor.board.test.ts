import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { language } from "@codemirror/language";
import { forEachDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { boardTxtLanguage, gcodeLanguage } from "dwc-gcode-editor";
import { mountInDwc } from "dwc-plugin-test-kit";

import AsciiArtDialog from "../widgets/AsciiArtDialog.vue";
import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";

// Same in-memory localStorage stand-in the other editor tests use (this harness's is a non-function stub).
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

const BOARD = "lpc.board = biquskr_1.4\nthis line is not a setting\n";
const files: Record<string, string> = { "0:/sys/board.txt": BOARD, "0:/sys/config.g": "G28\nG1 X10\n" };
const downloadMock = vi.fn(async (options: { filename: string }) => {
	const text = files[options.filename];
	if (text === undefined) throw new Error("not found"); // also the shared colour-scheme SD file
	return text;
});

vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return { ...actual, useMachineStore: () => ({ ...actual.useMachineStore(), download: downloadMock, upload: vi.fn(async () => undefined) }) };
});

type ExposedVm = { editorInstance: { view: EditorView } };

const iconsOf = (w: ReturnType<typeof mountInDwc>): string[] => w.findAll(".v-btn .v-icon").map((i) => i.classes().join(" "));

beforeEach(() => {
	memoryStorage.clear();
	resetEditorColorSettingsForTests();
});
afterEach(() => { vi.restoreAllMocks(); });

describe("GcodeCmEditor on board.txt", () => {
	it("opens it with board.txt highlighting and without the G-code-only toolbar buttons", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/board.txt" } });
		await vi.waitFor(() => expect(w.text()).toContain("biquskr_1.4"));
		const icons = iconsOf(w);
		const has = (name: string) => icons.some((c) => c.includes(name));
		expect(has("mdi-content-save-outline")).toBe(true); // still saves
		for (const gcodeOnly of ["mdi-tag-search", "mdi-play", "mdi-motion-play-outline", "mdi-alert-circle-check-outline", "mdi-format-indent-increase",
			"mdi-comment-remove-outline", "mdi-format-title"]) {
			expect(has(gcodeOnly), gcodeOnly).toBe(false);
		}
		expect((w.vm as unknown as ExposedVm).editorInstance.view.state.facet(language)).toBe(boardTxtLanguage);
		w.unmount();
	});

	it("marks a line that is not a setting", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/board.txt" } });
		await vi.waitFor(() => expect(w.text()).toContain("biquskr_1.4"));
		const view = (w.vm as unknown as ExposedVm).editorInstance.view;
		// The live linter runs on a change, not on load.
		view.dispatch({ changes: { from: view.state.doc.length, insert: "\n" } });
		await vi.waitFor(() => {
			const found: string[] = [];
			forEachDiagnostic(view.state, (d) => { found.push(view.state.sliceDoc(d.from, d.to)); });
			expect(found.some((text) => text.includes("this line is not a setting"))).toBe(true);
		}, { timeout: 3000 });
		w.unmount();
	});

	it("leaves a G-code file on the G-code language, with the G-code buttons", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/config.g" } });
		await vi.waitFor(() => expect(w.text()).toContain("G1 X10"));
		expect((w.vm as unknown as ExposedVm).editorInstance.view.state.facet(language)).toBe(gcodeLanguage);
		const icons = iconsOf(w);
		expect(icons.some((c) => c.includes("mdi-format-title"))).toBe(true);
		expect(icons.some((c) => c.includes("mdi-tag-search"))).toBe(true);
		w.unmount();
	});
});

describe("the text banner on a G-code file", () => {
	it("is inserted as comment lines on their own lines at the cursor, as one undo step", async () => {
		const w = mountInDwc(GcodeCmEditor, { props: { filename: "0:/sys/config.g" } });
		await vi.waitFor(() => expect(w.text()).toContain("G1 X10"));
		const view = (w.vm as unknown as ExposedVm).editorInstance.view;
		view.dispatch({ selection: { anchor: 0 } });
		w.findComponent(AsciiArtDialog).vm.$emit("insert", "Hi");
		const doc = view.state.doc.toString();
		const lines = doc.split("\n");
		expect(lines[0]).toMatch(/^;/);
		expect(doc).toContain("G28\nG1 X10");
		// every banner row is a comment, and the code below is untouched
		const bannerRows = lines.slice(0, lines.indexOf("G28"));
		expect(bannerRows.length).toBeGreaterThan(2);
		expect(bannerRows.every((l) => l.startsWith(";"))).toBe(true);
		w.unmount();
	});
});

describe("AsciiArtDialog", () => {
	// `attach` keeps the dialog's content inside the wrapper, where Vue Test Utils can see it (see GcodeFilePickerDialog's tests).
	async function open() {
		const w = mountInDwc(AsciiArtDialog, { props: { modelValue: false, attach: true } });
		await w.setProps({ modelValue: true });
		await vi.waitFor(() => expect(w.find("[data-ascii-art-text] input").exists()).toBe(true));
		return w;
	}
	type Wrapper = Awaited<ReturnType<typeof open>>;
	const type = async (w: Wrapper, text: string) => { await w.find("[data-ascii-art-text] input").setValue(text); };
	const insertButton = (w: Wrapper) => w.find("[data-ascii-art-insert]");

	it("cannot insert nothing: the button is disabled until there is text", async () => {
		const w = await open();
		expect(insertButton(w).attributes("disabled")).toBeDefined();
		await type(w, "Hi");
		await vi.waitFor(() => expect(insertButton(w).attributes("disabled")).toBeUndefined());
		w.unmount();
	});

	it("previews the banner and hands the text back on Insert, then closes", async () => {
		const w = await open();
		await type(w, "Hi");
		await vi.waitFor(() => expect(w.find("[data-ascii-art-preview]").text()).toMatch(/^; /));
		await insertButton(w).trigger("click");
		expect(w.emitted("insert")).toEqual([["Hi"]]);
		expect(w.emitted("update:modelValue")?.at(-1)).toEqual([false]);
		w.unmount();
	});
});
