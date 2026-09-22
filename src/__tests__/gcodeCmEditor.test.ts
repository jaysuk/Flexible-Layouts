import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { GCODE_EDITOR_COLORS_SD_PATH } from "dwc-gcode-editor";
import { dwc, lastCode, mountInDwc, patchModel, sentCodes, setUiFrozen } from "dwc-plugin-test-kit";

import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";

let fileContent = "G28\nG1 X10 Y10\n";
let failUpload = false;
const uploaded: Array<{ filename: string; content: string }> = [];
// A tiny in-memory store keyed by filename, just for the color-settings SD file - GcodeCmEditor's own
// g-code content download/upload (fileContent/uploaded above) is unrelated and untouched by this.
const colorFiles = new Map<string, string>();
const downloadMock = vi.fn(async (options: { filename: string }) => {
	if (options.filename === "0:/gcodes/missing.g") throw new Error("not found");
	if (options.filename === GCODE_EDITOR_COLORS_SD_PATH) {
		const stored = colorFiles.get(options.filename);
		if (stored === undefined) throw new Error("not found");
		return stored;
	}
	return fileContent;
});
const uploadMock = vi.fn(async (options: { filename: string; content: Blob }) => {
	if (failUpload) throw new Error("disk full");
	const text = await options.content.text();
	uploaded.push({ filename: options.filename, content: text });
	if (options.filename === GCODE_EDITOR_COLORS_SD_PATH) colorFiles.set(options.filename, text);
});

// The real EditorView, not a hand-rolled subset of its shape - a prior narrower duck-type here
// (only dispatch/focus/contentDOM) silently drifted out of sync once a later test started reading
// .state off it directly and passing the view itself into startCompletion(), both of which need the
// real type. Caught by CI's real DWC typecheck, not by this repo's own local `npm run typecheck`.
type ExposedVm = {
	save: () => Promise<boolean>;
	focus: () => void;
	editorInstance: { view: EditorView };
};

vi.mock("@/stores/machine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/stores/machine")>();
	return {
		...actual,
		useMachineStore: () => {
			const real = actual.useMachineStore();
			return { ...real, download: downloadMock, upload: uploadMock };
		},
	};
});

describe("GcodeCmEditor", () => {
	beforeEach(() => {
		colorFiles.clear();
		resetEditorColorSettingsForTests();
	});


	it("loads the file's content into a live editor", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/a.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		wrapper.unmount();
	});

	it("shows a load error rather than throwing when the download fails", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/missing.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("missing.g"));
		wrapper.unmount();
	});

	it("marks itself dirty on a real edit, then saves and re-clears dirty", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/b.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		const vm = wrapper.vm as unknown as ExposedVm;

		expect(wrapper.emitted("dirty")?.at(-1)).toEqual([false]); // load() clears dirty once mounted
		vm.editorInstance.view.dispatch({ changes: { from: 0, insert: "; edited\n" } });
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted("dirty")?.at(-1)).toEqual([true]);

		await vm.save();

		expect(uploadMock).toHaveBeenCalledTimes(1);
		expect(uploaded[0].filename).toBe("0:/gcodes/b.g");
		expect(uploaded[0].content).toBe("; edited\n" + fileContent);
		expect(wrapper.emitted("dirty")?.at(-1)).toEqual([false]);
		expect(wrapper.emitted("saved")).toEqual([["0:/gcodes/b.g"]]);
		wrapper.unmount();
	});

	it("skips the download and opens with initialContent when supplied", async () => {
		downloadMock.mockClear();
		const wrapper = mountInDwc(GcodeCmEditor, {
			props: { filename: "0:/gcodes/c.g", initialContent: "; pre-fetched\nG1 Z5\n" },
		});
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 Z5"));
		// initialContent skips downloading the FILE's own content specifically - the shared,
		// unrelated color-scheme SD file is still loaded once per session regardless (see
		// editorColorSettings.ts), so downloadMock itself isn't a clean "not called at all" signal.
		expect(downloadMock).not.toHaveBeenCalledWith(expect.objectContaining({ filename: "0:/gcodes/c.g" }));
		wrapper.unmount();
	});

	it("save() returns true on success and false on a failed upload - matches MonacoEditor.vue's contract", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/d.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		await expect(vm.save()).resolves.toBe(true);

		failUpload = true;
		vm.editorInstance.view.dispatch({ changes: { from: 0, insert: "; more\n" } });
		await expect(vm.save()).resolves.toBe(false);
		failUpload = false;
		wrapper.unmount();
	});

	it("exposes focus(), which gives the CM6 view keyboard focus", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/e.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		// mountInDwc doesn't attach to document.body - a real focus() call is a no-op on a detached
		// element, so attach it ourselves for this one test (only case that needs a real focus target).
		document.body.appendChild(wrapper.element);
		const vm = wrapper.vm as unknown as ExposedVm;

		vm.focus();
		expect(document.activeElement).toBe(vm.editorInstance.view.contentDOM);
		wrapper.unmount();
	});

	it("saves on Ctrl+S via the wired-in saveKeymap - real teeth: a plain 's' does not save", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/f.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		uploadMock.mockClear();
		vm.editorInstance.view.contentDOM.dispatchEvent(
			new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true }),
		);
		await wrapper.vm.$nextTick();
		expect(uploadMock).not.toHaveBeenCalled();

		vm.editorInstance.view.contentDOM.dispatchEvent(
			new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }),
		);
		await vi.waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
		wrapper.unmount();
	});

	it("opens in dark mode when DWC's own darkTheme setting is already on", async () => {
		dwc.settings.darkTheme = true;
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/g.g" } });
		document.body.appendChild(wrapper.element); // getComputedStyle needs a connected element
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		const cmEditor = wrapper.find(".cm-editor");
		expect(cmEditor.exists()).toBe(true);
		const bg = getComputedStyle(cmEditor.element).backgroundColor;
		expect(bg).not.toBe(""); // oneDarkTheme's own background, not the browser default
		expect(bg).not.toBe("rgba(0, 0, 0, 0)");

		dwc.settings.darkTheme = false;
		wrapper.unmount();
	});

	it("follows a live darkTheme toggle without reloading the file", async () => {
		dwc.settings.darkTheme = false;
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/h.g" } });
		document.body.appendChild(wrapper.element);
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		const cmEditor = wrapper.find(".cm-editor");
		const lightBg = getComputedStyle(cmEditor.element).backgroundColor;

		dwc.settings.darkTheme = true;
		await wrapper.vm.$nextTick();
		const darkBg = getComputedStyle(cmEditor.element).backgroundColor;
		expect(darkBg).not.toBe(lightBg);
		expect(wrapper.text()).toContain("G1 X10 Y10"); // same document - not a reload

		dwc.settings.darkTheme = false;
		wrapper.unmount();
	});

	it("offers a real completion for a bare command code (Ctrl+Space)", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/i.g" } });
		document.body.appendChild(wrapper.element); // CM6's tooltip positioning needs a connected view
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		const docLength = vm.editorInstance.view.state.doc.length;
		vm.editorInstance.view.dispatch({ changes: { from: 0, to: docLength, insert: "G1" }, selection: { anchor: 2 } });
		// A plain `dispatch()` doesn't carry the "typed input" annotation autocompletion's automatic
		// trigger listens for - `startCompletion` is the real command `completionKeymap`'s Ctrl-Space
		// binding calls, so this exercises the same path a user's keypress does.
		startCompletion(vm.editorInstance.view);
		await vi.waitFor(() => {
			// @codemirror/autocomplete renders its tooltip into the document body, listing matching
			// dictionary entries once the source resolves - a real completion round-trip, not a stub.
			expect(document.body.textContent).toContain("Linear move");
		});
		wrapper.unmount();
	});

	it("opens the search panel via the toolbar button", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/j.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		expect(wrapper.find(".cm-search").exists()).toBe(false);
		const searchBtn = wrapper.findAll("button").find((b) => b.attributes("title") === "Search (Ctrl+F)");
		await searchBtn!.trigger("click");
		expect(wrapper.find(".cm-search").exists()).toBe(true);
		wrapper.unmount();
	});

	it("the docs-link button follows the cursor onto whatever code it sits on", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/k.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		const docsLink = () => wrapper.findAll("a").find((a) => a.attributes("title") === "G-code reference");
		expect(docsLink()!.attributes("href")).toBe("https://docs.duet3d.com/en/User_manual/Reference/Gcodes");

		vm.editorInstance.view.dispatch({ selection: { anchor: 1 } }); // inside "G28"
		await wrapper.vm.$nextTick();
		expect(docsLink()!.attributes("href")).toBe("https://docs.duet3d.com/en/User_manual/Reference/Gcodes/G28");
		wrapper.unmount();
	});

	it("aligns comments via the toolbar button", async () => {
		fileContent = "G1 X10 ;short\nG1 X10 Y20 ;longer\n";
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/l.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("longer"));

		const alignBtn = wrapper.findAll("button").find((b) => b.attributes("title") === "Align comments");
		await alignBtn!.trigger("click");
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).toContain("G1 X10     ;short");
		fileContent = "G28\nG1 X10 Y10\n";
		wrapper.unmount();
	});

	it("reverts to the loaded content and disables itself once clean again", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/m.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		const revertBtn = () => wrapper.findAll("button").find((b) => b.attributes("title") === "Revert");
		expect(revertBtn()!.attributes("disabled")).toBeDefined();

		vm.editorInstance.view.dispatch({ changes: { from: 0, insert: "; edited\n" } });
		await wrapper.vm.$nextTick();
		expect(revertBtn()!.attributes("disabled")).toBeUndefined();

		await revertBtn()!.trigger("click");
		await wrapper.vm.$nextTick();
		expect(vm.editorInstance.view.state.doc.toString()).toBe("G28\nG1 X10 Y10\n");
		expect(revertBtn()!.attributes("disabled")).toBeDefined();
		wrapper.unmount();
	});

	it("Run sends M98 for a macro-style file, disabled while the UI is frozen", async () => {
		patchModel({ directories: { gCodes: "0:/gcodes" } });
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/macros/prime.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		const runBtn = () => wrapper.findAll("button").find((b) => b.attributes("title") === "Run");
		expect(runBtn()).toBeDefined(); // not under the gcodes directory - offered

		setUiFrozen(true);
		await wrapper.vm.$nextTick();
		expect(runBtn()!.attributes("disabled")).toBeDefined();
		setUiFrozen(false);
		await wrapper.vm.$nextTick();

		await runBtn()!.trigger("click");
		await vi.waitFor(() => expect(sentCodes().length).toBeGreaterThan(0));
		expect(lastCode()).toBe('M98 P"0:/macros/prime.g"');
		wrapper.unmount();
	});

	it("Run is not offered for a file under the gcodes (job) directory", async () => {
		patchModel({ directories: { gCodes: "0:/gcodes" } });
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/n.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		expect(wrapper.findAll("button").find((b) => b.attributes("title") === "Run")).toBeUndefined();
		wrapper.unmount();
	});

	it("the quick-search button opens the G/M-code picker by default, titled Find Code (F4)", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/o.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		const quickSearchBtn = () => wrapper.findAll("button").find((b) => b.attributes("title")?.startsWith("Find "));
		expect(quickSearchBtn()!.attributes("title")).toBe("Find Code (F4)");
		await quickSearchBtn()!.trigger("click");
		expect(wrapper.find(".cm-gcodeQuickSearch").exists()).toBe(true);
		const input = wrapper.find(".cm-gcodeQuickSearch-input").element as HTMLInputElement;
		expect(input.placeholder).toMatch(/code/i);
		wrapper.unmount();
	});

	it("the quick-search button switches to Find Expression (F4) once the cursor sits inside a { expression, and offers the live object model", async () => {
		patchModel({ move: { speedFactor: 1 } });
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/p.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		const docLength = vm.editorInstance.view.state.doc.length;
		vm.editorInstance.view.dispatch({
			changes: { from: 0, to: docLength, insert: "G1 X{move.speedFactor}" },
			selection: { anchor: 6 },
		});
		await wrapper.vm.$nextTick();

		const quickSearchBtn = () => wrapper.findAll("button").find((b) => b.attributes("title")?.startsWith("Find "));
		expect(quickSearchBtn()!.attributes("title")).toBe("Find Expression (F4)");
		await quickSearchBtn()!.trigger("click");
		const labels = wrapper.findAll(".cm-gcodeQuickSearch-label").map((e) => e.text());
		expect(labels).toContain("move.speedFactor");
		wrapper.unmount();
	});

	it("F4 itself opens the same quick-search picker", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/q.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));
		const vm = wrapper.vm as unknown as ExposedVm;

		vm.editorInstance.view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "F4", bubbles: true, cancelable: true }));
		expect(wrapper.find(".cm-gcodeQuickSearch").exists()).toBe(true);
		wrapper.unmount();
	});

	it("opens the color settings dialog via the toolbar button", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/r.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		const settingsBtn = wrapper.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.gcodeEditor.colors");
		await settingsBtn!.trigger("click");
		// The test kit's $t stub echoes the raw key (see its own doc comment: "tests assert on keys
		// rather than translations") - real English text/interpolation only renders against the actual
		// DWC i18n instance, not under this stub.
		expect(document.body.textContent).toContain("plugins.flexibleLayouts.gcodeEditor.colors");
		expect(document.body.querySelectorAll("input[type=color]").length).toBe(10);
		wrapper.unmount();
	});

	it("Save persists the scheme to the SD card and applies it live to the same instance", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/s.g" } });
		document.body.appendChild(wrapper.element); // getComputedStyle needs a connected element
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		await wrapper.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.gcodeEditor.colors")!.trigger("click");
		const bgInput = document.body.querySelector("#gcode-editor-color-background") as HTMLInputElement;
		bgInput.value = "#123456";
		bgInput.dispatchEvent(new Event("input", { bubbles: true }));

		const saveBtn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "plugins.flexibleLayouts.gcodeEditor.save");
		saveBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await flushPromises();

		expect(colorFiles.get(GCODE_EDITOR_COLORS_SD_PATH)).toContain("#123456");
		const cmEditor = wrapper.find(".cm-editor");
		expect(getComputedStyle(cmEditor.element).backgroundColor).toBe("#123456");
		wrapper.unmount();
	});

	it("Cancel closes the dialog without persisting or applying anything", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/t.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		await wrapper.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.gcodeEditor.colors")!.trigger("click");
		const bgInput = document.body.querySelector("#gcode-editor-color-background") as HTMLInputElement;
		bgInput.value = "#123456";
		bgInput.dispatchEvent(new Event("input", { bubbles: true }));

		const cancelBtn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "plugins.flexibleLayouts.gcodeEditor.colorsCancel");
		cancelBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await flushPromises();

		expect(colorFiles.size).toBe(0);
		wrapper.unmount();
	});

	it("Reset to defaults resets the visible color inputs", async () => {
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/u.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X10 Y10"));

		await wrapper.findAll("button").find((b) => b.attributes("title") === "plugins.flexibleLayouts.gcodeEditor.colors")!.trigger("click");
		const bgInput = document.body.querySelector("#gcode-editor-color-background") as HTMLInputElement;
		const originalDefault = bgInput.value;
		bgInput.value = "#123456";
		bgInput.dispatchEvent(new Event("input", { bubbles: true }));
		await wrapper.vm.$nextTick();
		expect(bgInput.value).toBe("#123456");

		const resetBtn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === "plugins.flexibleLayouts.gcodeEditor.colorsReset");
		resetBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await wrapper.vm.$nextTick();
		expect(bgInput.value).toBe(originalDefault);
		wrapper.unmount();
	});

	it("a saved scheme applies live to a DIFFERENT already-open editor instance, not just the one that saved it", async () => {
		const a = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/v.g" } });
		document.body.appendChild(a.element);
		await vi.waitFor(() => expect(a.text()).toContain("G1 X10 Y10"));
		const b = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/w.g" } });
		document.body.appendChild(b.element);
		await vi.waitFor(() => expect(b.text()).toContain("G1 X10 Y10"));

		await a.findAll("button").find((btn) => btn.attributes("title") === "plugins.flexibleLayouts.gcodeEditor.colors")!.trigger("click");
		const bgInput = document.body.querySelector("#gcode-editor-color-background") as HTMLInputElement;
		bgInput.value = "#654321";
		bgInput.dispatchEvent(new Event("input", { bubbles: true }));
		const saveBtn = Array.from(document.body.querySelectorAll("button")).find((btn) => btn.textContent?.trim() === "plugins.flexibleLayouts.gcodeEditor.save");
		saveBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
		await flushPromises();

		const bCmEditor = b.find(".cm-editor");
		expect(getComputedStyle(bCmEditor.element).backgroundColor).toBe("#654321");
		a.unmount();
		b.unmount();
	});
});
