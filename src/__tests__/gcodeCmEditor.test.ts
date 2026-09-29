import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { GCODE_EDITOR_COLORS_SD_PATH } from "dwc-gcode-editor";
import { dwc, lastCode, mountInDwc, patchModel, sentCodes, setUiFrozen } from "dwc-plugin-test-kit";

import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";
import { resetEditorColorSettingsForTests } from "../model/editorColorSettings";

// This harness's happy-dom `localStorage` is a non-functional stub (`localStorage.setItem` is not a
// function - same environment gap duet-gcode-postprocessor's own executionIndex.test.ts documents and
// works around). A tiny in-memory stand-in is the only way to exercise the stepper's simulated-value/
// message-box persistence tests below; real DWC runs in an actual browser, where localStorage works.
const memoryStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	getItem: (key: string) => memoryStorage.get(key) ?? null,
	setItem: (key: string, value: string) => { memoryStorage.set(key, value); },
	removeItem: (key: string) => { memoryStorage.delete(key); },
});

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
		// This assertion used to read "missing.g" off the toolbar's own now-removed filename label
		// (redundant with the host's own tab/tile title) rather than off the load-error alert itself -
		// checks the alert directly now. The i18n key comes back untranslated in this test environment
		// (see the "plugins.flexibleLayouts.gcodeEditor.colors" checks elsewhere in this file), so this
		// asserts on the raw key, not the interpolated "Could not load missing.g: ..." a real locale gives.
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/missing.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("plugins.flexibleLayouts.gcodeEditor.loadFailed"));
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

	it("Step through file shows step info and highlights the current line", async () => {
		fileContent = "G28\nG1 X10 Y10\nG1 Z5\n";
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/stepper-a.g" } });
		document.body.appendChild(wrapper.element); // CM6 line decorations need a connected view
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 Z5"));

		const stepBtn = wrapper.findAll("button").find((b) => b.attributes("title") === "Step through file");
		await stepBtn!.trigger("click");
		await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 3"));
		expect(wrapper.text()).toContain("line 1");
		expect(wrapper.find(".cm-gcodeCurrentLine").exists()).toBe(true);

		fileContent = "G28\nG1 X10 Y10\n";
		wrapper.unmount();
	});

	it("Step forward advances the step counter and the derived machine state", async () => {
		fileContent = "G28\nG1 X10 Y20\nG1 Z5\n";
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/stepper-b.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 Z5"));

		await wrapper.findAll("button").find((b) => b.attributes("title") === "Step through file")!.trigger("click");
		await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 3"));

		const stepForwardBtn = wrapper.findAll("button").find((b) => b.attributes("title") === "Step forward");
		await stepForwardBtn!.trigger("click");
		await stepForwardBtn!.trigger("click");
		await vi.waitFor(() => expect(wrapper.text()).toContain("Step 3 / 3"));
		expect(wrapper.find("[data-axis=\"Z\"]").text()).toContain("5.000");

		fileContent = "G28\nG1 X10 Y10\n";
		wrapper.unmount();
	});

	it("pauses on an unresolved object-model path, resumes once a simulated value is supplied, and persists it for the next open", async () => {
		fileContent = 'G28\nif sensors.gpIn[0].value > 0\n    G1 X1\nG1 Y1\n';
		const filename = "0:/gcodes/stepper-c.g";
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 Y1"));

		await wrapper.findAll("button").find((b) => b.attributes("title") === "Step through file")!.trigger("click");
		await vi.waitFor(() => expect(wrapper.text()).toContain("sensors.gpIn[0].value"));

		const promptInput = wrapper.find("input[placeholder='e.g. 1, true, ...']");
		await promptInput.setValue("1");
		const applyBtn = wrapper.findAll("button").find((b) => b.text() === "Apply");
		await applyBtn!.trigger("click");
		// Resolving a pause rebuilds the index (now 4 real steps: G28, the true if-body's G1 X1, G1 Y1)
		// but deliberately does NOT jump the scrub position to the end - only clamps it into range.
		await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 4"));
		// The value now lives in the scenario editor, which the pause opened by itself - read the field.
		expect(wrapper.find("[data-scenario-panel]").classes()).toContain("v-expansion-panel--active");
		const valueField = wrapper.find("input[aria-label=\"Value of sensors.gpIn[0].value\"]");
		expect((valueField.element as HTMLInputElement).value).toBe("1");
		expect(localStorage.getItem("flexibleLayouts.stepperScenario." + filename)).toContain("sensors.gpIn[0].value");
		wrapper.unmount();

		// A fresh instance for the same file (e.g. the tab was closed and reopened) picks the saved
		// simulated value back up without re-prompting - own flexibleLayouts.* localStorage namespace,
		// distinct from duet-gcode-postprocessor's identically-shaped keys.
		const reopened = mountInDwc(GcodeCmEditor, { props: { filename } });
		await vi.waitFor(() => expect(reopened.text()).toContain("G1 Y1"));
		await reopened.findAll("button").find((b) => b.attributes("title") === "Step through file")!.trigger("click");
		await vi.waitFor(() => expect(reopened.text()).toContain("Step 1 / 4"));
		expect(reopened.text()).not.toContain("has no known value offline");

		localStorage.removeItem("flexibleLayouts.stepperScenario." + filename);
		fileContent = "G28\nG1 X10 Y10\n";
		reopened.unmount();
	});

	it("pauses on a blocking M291 and resumes once answered", async () => {
		fileContent = 'M291 P"Ready?" R"Confirm" S2\nG1 X1\n';
		const wrapper = mountInDwc(GcodeCmEditor, { props: { filename: "0:/gcodes/stepper-d.g" } });
		await vi.waitFor(() => expect(wrapper.text()).toContain("G1 X1"));

		await wrapper.findAll("button").find((b) => b.attributes("title") === "Step through file")!.trigger("click");
		await vi.waitFor(() => expect(wrapper.text()).toContain("Ready?"));

		const okBtn = wrapper.findAll("button").find((b) => b.text() === "OK");
		await okBtn!.trigger("click");
		// Resolving the message box rebuilds the index to its full 2 real steps (M291, then G1 X1) -
		// same "clamps, doesn't jump to the end" behaviour as the simulated-value pause above.
		await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));

		fileContent = "G28\nG1 X10 Y10\n";
		wrapper.unmount();
	});

	describe("the stepper as a macro-testing scenario", () => {
		async function openStepper(content: string, filename: string): Promise<ReturnType<typeof mountInDwc>> {
			fileContent = content;
			const wrapper = mountInDwc(GcodeCmEditor, { props: { filename } });
			document.body.appendChild(wrapper.element);
			await vi.waitFor(() => expect(wrapper.find(".cm-content").exists()).toBe(true));
			await wrapper.findAll("button").find((b) => b.attributes("title") === "Step through file")!.trigger("click");
			return wrapper;
		}
		const stepForward = (wrapper: ReturnType<typeof mountInDwc>) =>
			wrapper.findAll("button").find((b) => b.attributes("title") === "Step forward")!;

		async function typeInto(wrapper: ReturnType<typeof mountInDwc>, label: string, value: string): Promise<void> {
			const input = wrapper.find(`input[aria-label="${label}"]`);
			expect(input.exists(), `no input labelled "${label}"`).toBe(true);
			await input.setValue(value);
			await input.trigger("blur"); // fields commit on blur/Enter, not per keystroke
		}

		it("shows the line as evaluated, in the panel and beneath the line in the editor", async () => {
			const wrapper = await openStepper("var a = 5\nG1 X{var.a * 2} Y1\n", "0:/macros/scn-a.g");
			await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
			await stepForward(wrapper).trigger("click");
			expect(wrapper.find('[data-readout="evaluated"]').text()).toBe("G1 X10 Y1");
			expect(wrapper.find(".cm-gcodeEvaluatedLine").text()).toBe("G1 X10 Y1");
			fileContent = "G28\nG1 X10 Y10\n";
			wrapper.unmount();
		});

		it("a starting position gives a relative move something to be relative to, and is saved for this file", async () => {
			const filename = "0:/macros/scn-b.g";
			const wrapper = await openStepper("G91\nG1 X5\n", filename);
			await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
			await stepForward(wrapper).trigger("click");
			expect(wrapper.find('[data-axis="X"]').text()).toContain("5.000");

			await wrapper.find("[data-scenario-panel] button").trigger("click");
			await typeInto(wrapper, "Start X", "100");
			await vi.waitFor(() => expect(wrapper.find('[data-axis="X"]').text()).toContain("105.000"));
			expect(wrapper.find('[data-axis="X"]').text()).toContain("+5.000");
			expect(localStorage.getItem("flexibleLayouts.stepperScenario." + filename)).toContain('"X":100');

			localStorage.removeItem("flexibleLayouts.stepperScenario." + filename);
			fileContent = "G28\nG1 X10 Y10\n";
			wrapper.unmount();
		});

		it("offers the values the file reads, and changing one takes the other branch", async () => {
			const filename = "0:/macros/scn-c.g";
			const wrapper = await openStepper("if sensors.gpIn[0].value = 1\n    G1 X10\nelse\n    G1 X20\n", filename);
			await vi.waitFor(() => expect(wrapper.text()).toContain("depends on"));
			// The pause opened the scenario panel by itself (no click needed), where the value is entered.
			await vi.waitFor(() => expect(wrapper.find("[data-scenario-panel]").classes()).toContain("v-expansion-panel--active"));
			await vi.waitFor(() => expect(wrapper.find('[data-scenario-input="objectModel:sensors.gpIn[0].value"]').exists()).toBe(true));

			const lastX = async (): Promise<string> => {
				const total = Number(/Step \d+ \/ (\d+)/.exec(wrapper.text())![1]);
				while (!wrapper.text().includes(`Step ${total} /`)) await stepForward(wrapper).trigger("click");
				return wrapper.find('[data-axis="X"]').text();
			};
			await typeInto(wrapper, "Value of sensors.gpIn[0].value", "1");
			await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 3"));
			expect(await lastX()).toContain("10.000");
			await typeInto(wrapper, "Value of sensors.gpIn[0].value", "0");
			await vi.waitFor(() => expect(wrapper.find('[data-axis="X"]').text()).not.toContain("10.000"));
			expect(await lastX()).toContain("20.000");

			localStorage.removeItem("flexibleLayouts.stepperScenario." + filename);
			fileContent = "G28\nG1 X10 Y10\n";
			wrapper.unmount();
		});

		describe("scenario controls", () => {
			// One open-the-stepper helper per host; `name` keeps each test's saved scenario apart.
			const open = (text: string, name: string) => openStepper(text, `0:/macros/${name}.g`);
			afterEach(() => { fileContent = "G28\nG1 X10 Y10\n"; });
			const panelOpen = (wrapper: ReturnType<typeof mountInDwc>): boolean =>
				wrapper.find("[data-scenario-panel]").classes().includes("v-expansion-panel--active");
			const toggleScenarioPanel = (wrapper: ReturnType<typeof mountInDwc>) =>
				wrapper.find("[data-scenario-panel] button").trigger("click");
			const buttonLabelled = (wrapper: ReturnType<typeof mountInDwc>, label: string) =>
				wrapper.findAll("button").find((b) => b.attributes("aria-label") === label)!;
			async function typeInto(wrapper: ReturnType<typeof mountInDwc>, label: string, value: string): Promise<void> {
				const input = wrapper.find(`input[aria-label="${label}"]`);
				expect(input.exists(), `no input labelled "${label}"`).toBe(true);
				await input.setValue(value);
				await input.trigger("blur"); // fields commit on blur/Enter, not per keystroke
			}
			const axisText = (wrapper: ReturnType<typeof mountInDwc>, letter: string): string => wrapper.find(`[data-axis="${letter}"]`).text();

			it("opens the scenario panel by itself when the walk pauses on a value it has a field for", async () => {
				const wrapper = await open("if sensors.gpIn[0].value = 1\n    G1 X10\n", "auto-open");
				await vi.waitFor(() => expect(wrapper.text()).toContain("depends on"));
				await vi.waitFor(() => expect(panelOpen(wrapper)).toBe(true));
				expect(wrapper.find('[data-scenario-input="objectModel:sensors.gpIn[0].value"]').text()).toContain("needs a value");
				wrapper.unmount();
			});

			it("leaves it closed when nothing is missing", async () => {
				const wrapper = await open("G28\nG1 X10\n", "auto-closed");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				expect(panelOpen(wrapper)).toBe(false);
				wrapper.unmount();
			});

			it("does not reopen a panel someone collapsed while the same value is still being asked for", async () => {
				const wrapper = await open("if sensors.gpIn[0].value = 1\n    G1 X10\n", "auto-collapsed");
				await vi.waitFor(() => expect(panelOpen(wrapper)).toBe(true));
				await toggleScenarioPanel(wrapper);
				expect(panelOpen(wrapper)).toBe(false);

				// Same pause again (a different starting position, still no value for the sensor).
				const scenario = wrapper.findComponent({ name: "StepperScenarioPanel" });
				await scenario.vm.$emit("update:inputs", { ...(scenario.props("inputs") as object), start: { axes: { X: 5 } } });
				await new Promise((resolve) => setTimeout(resolve, 50));
				expect(panelOpen(wrapper)).toBe(false);
				wrapper.unmount();
			});

			it("keeps named scenarios apart, and switching between them re-runs the walk", async () => {
				const wrapper = await open("G91\nG1 X5\n", "named");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				await toggleScenarioPanel(wrapper);
				await typeInto(wrapper, "Start X", "100");
				await stepForward(wrapper).trigger("click");
				await vi.waitFor(() => expect(axisText(wrapper, "X")).toMatch(/^X\s*105\.000/));

				await buttonLabelled(wrapper, "New scenario").trigger("click");
				const name = wrapper.find('input[aria-label="Scenario name"]');
				await name.setValue("Primed");
				await name.trigger("keyup.enter");
				await vi.waitFor(() => expect(wrapper.find("[data-scenario-panel] .v-expansion-panel-title").text()).toContain("Scenario: Primed"));
				expect((wrapper.find('input[aria-label="Start X"]').element as HTMLInputElement).value).toBe(""); // a blank scenario
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				await stepForward(wrapper).trigger("click");
				await vi.waitFor(() => expect(axisText(wrapper, "X")).toMatch(/^X\s*5\.000/)); // not the 105 of the other scenario

				// The select's popup can't be clicked in happy-dom, so drive the panel's own emit.
				await wrapper.findComponent({ name: "StepperScenarioPanel" }).vm.$emit("select-scenario", "Default");
				await vi.waitFor(() => expect((wrapper.find('input[aria-label="Start X"]').element as HTMLInputElement).value).toBe("100"));
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				await stepForward(wrapper).trigger("click");
				await vi.waitFor(() => expect(axisText(wrapper, "X")).toMatch(/^X\s*105\.000/));
				wrapper.unmount();
			});

			it("duplicates, renames and deletes a scenario", async () => {
				const wrapper = await open("G28\n", "named-ops");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 1"));
				await toggleScenarioPanel(wrapper);
				await buttonLabelled(wrapper, "Duplicate scenario").trigger("click");
				const title = () => wrapper.find("[data-scenario-panel] .v-expansion-panel-title").text();
				await vi.waitFor(() => expect(title()).toContain("Scenario: Default copy"));

				await buttonLabelled(wrapper, "Rename scenario").trigger("click");
				const name = wrapper.find('input[aria-label="Scenario name"]');
				expect((name.element as HTMLInputElement).value).toBe("Default copy"); // starts from the current name
				await name.setValue("Second");
				await name.trigger("keyup.enter");
				await vi.waitFor(() => expect(title()).toContain("Scenario: Second"));

				// An empty scenario is deleted straight away; the other one becomes active.
				await buttonLabelled(wrapper, "Delete scenario").trigger("click");
				await vi.waitFor(() => expect(title()).toBe("Scenario"));
				expect(buttonLabelled(wrapper, "Delete scenario").attributes("disabled")).toBeDefined(); // the last one stays
				wrapper.unmount();
			});

			it("asks before deleting a scenario that holds something", async () => {
				const wrapper = await open("G91\nG1 X5\n", "named-delete");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				await toggleScenarioPanel(wrapper);
				await buttonLabelled(wrapper, "New scenario").trigger("click");
				const name = wrapper.find('input[aria-label="Scenario name"]');
				await name.setValue("Keep me");
				await name.trigger("keyup.enter");
				await vi.waitFor(() => expect(wrapper.find("[data-scenario-panel] .v-expansion-panel-title").text()).toContain("Keep me"));
				await typeInto(wrapper, "Start X", "7");

				await buttonLabelled(wrapper, "Delete scenario").trigger("click");
				expect(wrapper.text()).toContain('Delete "Keep me"?');
				await wrapper.findAll("button").find((b) => b.text() === "Keep")!.trigger("click");
				expect(wrapper.text()).not.toContain('Delete "Keep me"?');
				expect(wrapper.find("[data-scenario-panel] .v-expansion-panel-title").text()).toContain("Keep me");

				await buttonLabelled(wrapper, "Delete scenario").trigger("click");
				await wrapper.findAll("button").find((b) => b.text() === "Delete")!.trigger("click");
				await vi.waitFor(() => expect(wrapper.find("[data-scenario-panel] .v-expansion-panel-title").text()).toBe("Scenario"));
				wrapper.unmount();
			});

			it("begins the walk at a chosen start line, and can take the cursor's line", async () => {
				const wrapper = await open("G1 X1\nG1 X2\nG1 X3\n", "start-line");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 3"));
				await toggleScenarioPanel(wrapper);
				await typeInto(wrapper, "Start line", "3");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 1"));
				expect(axisText(wrapper, "X")).toContain("3.000");
				expect(wrapper.text()).toContain("line 3");

				const vm = wrapper.vm as unknown as { editorInstance: { view: EditorView } };
				const view = vm.editorInstance.view;
				view.dispatch({ selection: { anchor: view.state.doc.line(2).from } });
				await flushPromises(); // the cursor line reaches the panel through a ref
				await buttonLabelled(wrapper, "Start at the cursor line").trigger("click");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				expect((wrapper.find('input[aria-label="Start line"]').element as HTMLInputElement).value).toBe("2");
				wrapper.unmount();
			});

			it("a start line inside a branch resumes it, and the variables above it become inputs to fill in", async () => {
				const wrapper = await open("var n = 1\nif var.n > 0\n    G1 X{var.n}\n    G1 X{var.n + 1}\n", "start-branch");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 4"));
				await toggleScenarioPanel(wrapper);
				await typeInto(wrapper, "Start line", "4");
				// var.n is declared above the start line, so the walk cannot know it: it asks for it.
				await vi.waitFor(() => expect(wrapper.find('[data-scenario-input="var:n"]').exists()).toBe(true));
				await typeInto(wrapper, "Value of var.n", "10");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 1"));
				expect(axisText(wrapper, "X")).toContain("11.000");
				wrapper.unmount();
			});

			it("shows an M291 message written as an expression, evaluated", async () => {
				const wrapper = await open('var who = "Bob"\nM291 P{"Hello " ^ var.who} S2\nG1 X1\n', "m291-expression");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Hello Bob"));
				await wrapper.findAll("button").find((b) => b.text() === "OK")!.trigger("click");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 3"));
				await stepForward(wrapper).trigger("click");
				expect(wrapper.find('[data-readout="evaluated"]').text()).toBe('M291 P"Hello Bob" S2');
				wrapper.unmount();
			});

			it("models a G1 H1 homing move against the endstops set in the scenario", async () => {
				const wrapper = await open("G91\nG1 H1 X-300 F3000\n", "homing");
				await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
				await stepForward(wrapper).trigger("click");
				await vi.waitFor(() => expect(axisText(wrapper, "X")).toContain("0.000")); // RRF's default axis minimum
				expect(wrapper.find('[data-axis="X"] [aria-label="Homed"]').exists()).toBe(true);

				await toggleScenarioPanel(wrapper);
				await wrapper.find("[data-scenario-endstops-toggle]").trigger("click");
				await typeInto(wrapper, "Axis minimum X", "-5");
				await vi.waitFor(() => expect(axisText(wrapper, "X")).toContain("-5.000"));

				await buttonLabelled(wrapper, "X endstop never triggers").trigger("click");
				await vi.waitFor(() => expect(axisText(wrapper, "X")).toContain("-300.000")); // stopped at its target instead
				expect(wrapper.find('[data-axis="X"] [aria-label="Homed"]').exists()).toBe(false);
				wrapper.unmount();
			});
		});

		it("re-runs the walk when the buffer is edited while stepping", async () => {
			const wrapper = await openStepper("G28\nG1 X10\n", "0:/macros/scn-d.g");
			await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 2"));
			// load() schedules a (0 ms) rebuild that may still be pending - it reads the buffer when it FIRES,
			// so let it settle first, or it would pick the edit up below and this would pass without the
			// edit-triggered rebuild it is meant to check.
			await new Promise((resolve) => setTimeout(resolve, 50));
			const vm = wrapper.vm as unknown as { editorInstance: { view: EditorView } };
			vm.editorInstance.view.dispatch({ changes: { from: 0, insert: "G90\n" } });
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(wrapper.text()).toContain("Step 1 / 2"); // debounced: not re-run yet
			await vi.waitFor(() => expect(wrapper.text()).toContain("Step 1 / 3"), { timeout: 3000 });
			fileContent = "G28\nG1 X10 Y10\n";
			wrapper.unmount();
		});
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
