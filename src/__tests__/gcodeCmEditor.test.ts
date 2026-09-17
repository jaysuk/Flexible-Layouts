import { describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

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

type ExposedVm = {
	save: () => Promise<boolean>;
	focus: () => void;
	editorInstance: { view: { dispatch: (spec: unknown) => void; focus: () => void; contentDOM: HTMLElement } };
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
});
