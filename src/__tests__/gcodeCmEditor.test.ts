import { describe, expect, it, vi } from "vitest";
import { startCompletion } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { dwc, lastCode, mountInDwc, patchModel, sentCodes, setUiFrozen } from "dwc-plugin-test-kit";

import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";

let fileContent = "G28\nG1 X10 Y10\n";
let failUpload = false;
const uploaded: Array<{ filename: string; content: string }> = [];
const downloadMock = vi.fn(async (options: { filename: string }) => {
	if (options.filename === "0:/gcodes/missing.g") throw new Error("not found");
	return fileContent;
});
const uploadMock = vi.fn(async (options: { filename: string; content: Blob }) => {
	if (failUpload) throw new Error("disk full");
	uploaded.push({ filename: options.filename, content: await options.content.text() });
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
		expect(downloadMock).not.toHaveBeenCalled();
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
});
