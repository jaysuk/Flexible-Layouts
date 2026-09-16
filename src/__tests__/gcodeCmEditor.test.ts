import { describe, expect, it, vi } from "vitest";
import { mountInDwc } from "dwc-plugin-test-kit";

import GcodeCmEditor from "../widgets/GcodeCmEditor.vue";

let fileContent = "G28\nG1 X10 Y10\n";
const uploaded: Array<{ filename: string; content: string }> = [];
const downloadMock = vi.fn(async (options: { filename: string }) => {
	if (options.filename === "0:/gcodes/missing.g") throw new Error("not found");
	return fileContent;
});
const uploadMock = vi.fn(async (options: { filename: string; content: Blob }) => {
	uploaded.push({ filename: options.filename, content: await options.content.text() });
});

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

		type ExposedVm = { save: () => Promise<void>; editorInstance: { view: { dispatch: (spec: unknown) => void } } };
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
});
